# Phase B — Data Import Pipeline (recyclemap API → YDB)

**Дата:** 2026-04-22
**Автор:** Дмитрий Иоффе
**Статус:** утверждён к разработке
**Относится к:** [2026-04-22-recyclemap-spb-full-design.md](2026-04-22-recyclemap-spb-full-design.md) — Phase B

---

## 1. Цель и scope

### Цель
Наполнить YDB-таблицу `points` данными **~4500 точек приёма вторсырья по Санкт-Петербургу** из публичного REST API recyclemap.ru и поддерживать её актуальной через еженедельный автоимпорт с email-отчётами админу.

### Контекст
Проект RecycleMap СПб разрабатывается **в партнёрстве с движением «Раздельный Сбор»** (rsbor.ru / recyclemap.ru) — они не просто «источник данных», а заказчик/партнёр, Дмитрий на прямой связи. Это определяет:
- Этический вопрос использования их публичного API снят.
- Таксономия категорий и визуальная палитра берутся один-в-один у РС — это их узнаваемая аудитория.
- Импорт «как есть», без фильтрации старых точек — их модераторы разберутся, если захотят.

### В scope
- HTTP-endpoint `POST /api/cron/import-rsbor` в основном Next.js-приложении
- Клиент к API recyclemap (`/api/public/fractions`, `/api/public/points`, `/api/public/points/{id}`)
- Импорт-оркестратор: пагинация, детали, маппинг, upsert в YDB
- Миграция YDB-схемы: расширение `categories` (+5), `points` (+`schedule_json`), цвета/иконки РС
- Скачивание SVG-иконок РС в `public/icons/fractions/`
- Email-отчёты через [Resend](https://resend.com) (100 писем/день на бесплатном тарифе)
- YC Trigger на cron-расписание, дёргающий endpoint воскресеньем 03:00 МСК
- Первый прогон **ручной** через `curl`; cron включается только после проверки результатов

### Не в scope (этой фазы)
- **OSM Overpass** — отброшен (856 точек с бедными данными, recyclemap покрывает полнее).
- **Scraping rsbor.ru HTML** — отброшен (открытый JSON API делает это ненужным).
- **Смена фронта с JSON на API** — Phase C.
- **Расширение UI-чипов до 13 категорий** — Phase C.
- **Форма «Предложить точку», модерация, админ-UI управления импортом** — Phase E/F.
- **Статус «Сейчас открыто» на основе `schedule_json`** — поле храним на будущее, используем в Phase D+.
- **Per-field manually_edited, audit log изменений, параллелизация запросов** — YAGNI.
- **Обработка пропавших из API точек** — сознательный игнор (ситуация редкая, автомагия может стать источником ложных «закрытий»).

### Оценка
**10–12 часов** (вместо 16–20 из общего дизайн-дока — scope сокращён удалением OSM и скрейпинга).

---

## 2. Архитектура

### 2.1. Решение о формате импортёра

Импортёр живёт **внутри основного Next.js-приложения** как HTTP-endpoint, а не как отдельная YC Cloud Function.

**Почему не Cloud Function:**
- Отдельный deploy, отдельный артефакт, отдельные env, отдельные логи в другой консоли YC.
- Лимит Cloud Function 15 минут — впритык для 4500 запросов с rate-limit 5 req/sec.
- Для автора-новичка — лишний мув-паттерн, который надо осваивать.

**Почему именно HTTP-endpoint + YC Trigger:**
- Один repo, один deploy, один pipeline (уже рабочий CI из Phase A).
- Единый код с YDB-клиентом (`lib/ydb.ts`), единые env-переменные, единая логгинг-модель.
- Таймаут Serverless Container настраивается до часа — комфортный запас над 15-минутным ожидаемым прогоном.
- Для ручного теста достаточно `curl` — без обучения `yc functions`.

### 2.2. Файловая структура

```
lib/
├── rsbor-api.ts                       # Тонкий клиент recyclemap API
├── importers/
│   └── rsbor.ts                       # Оркестратор импорта
└── email.ts                           # Resend-клиент

app/api/cron/import-rsbor/
└── route.ts                           # POST handler, проверка Authorization

types/
└── rsbor.ts                           # TypeScript-типы ответов recyclemap API

sql/
├── 006_migrate_categories_rsbor.sql   # +5 категорий, цвета, иконки
└── 007_migrate_points_schedule.sql    # +schedule_json

scripts/
└── fetch-rsbor-icons.sh               # Разовое скачивание 13 SVG в public/icons/fractions/

public/icons/fractions/                # 13 SVG категорий РС
```

### 2.3. Алгоритм импорта (end-to-end)

1. **Auth.** Проверка `Authorization: Bearer $IMPORT_SECRET`, иначе `401 Unauthorized`.
2. **Load fractions + categories.** `GET https://recyclemap.ru/api/public/fractions` → сверяем, что `id 1..13` присутствуют в нашей `categories.rsbor_id`. Параллельно `SELECT id, rsbor_id FROM categories` → строим в памяти мапу `rsborId → ourId` для быстрого маппинга на шаге 6. Если РС расширил каталог (появился `id=14+`) — пишем warning в лог/email и продолжаем (новая категория проигнорирована для этих точек, админ увидит в отчёте).
3. **Paginate list.** Цикл: `GET /api/public/points?bbox=29.0,59.5,31.0,60.3&size=100&page=N`, пока `len(points) > 0`. Копим массив `pointId`.
4. **Filter by SPb.** Отбрасываем записи, где в `address` нет подстроки «Санкт-Петербург» (case-insensitive). Fallback: если адрес пустой — проверяем, что координаты в bbox СПб (lat 59.75–60.1, lng 29.9–30.7).
5. **Fetch details.** Для каждого `pointId`: `GET /api/public/points/{id}` с rate-limit 5 req/sec (200ms между запросами) и ретраем при 429/5xx: 3 попытки, backoff 1s → 2s → 4s. При финальной неудаче — `errors.push({pointId, reason})`, не валим весь импорт.
6. **Transform.** Из детали собираем YDB-запись:
   - `id` = `"rsbor-{pointId}"` (стабильный slug)
   - `name` = `title` (если пусто — "Пункт приёма")
   - `address` = `address`
   - `lat`, `lng` — парсим из `geom` (формат `"POINT(lng lat)"`)
   - `description` = `pointDescription`
   - `hours Utf8?` = форматированный текст (напр. `"Пн-Чт 10-19, Пт 10-15, Сб 10-19, Вс 10-19"`) — генерируется из `schedule`
   - `schedule_json Json?` = сырой `schedule` от РС
   - `phone` = первый элемент `operator.phones[]`, если есть
   - `website` = первый элемент `operator.sites[]`, если есть
   - `photo_url` — если `photos[]` не пусто, берём `photos[0].path` **как есть** (относительный путь типа `"258_20161004-124814_1.jpg"`); хост CDN РС подставим в UI как `https://recyclemap.ru/images/<photo_url>` (точный префикс уточним на старте плана через DevTools). Если пусто — NULL.
   - `status` = `"active"` (нам из API не приходит «закрыто»)
   - `source` = `"rsbor"`, `source_id` = `str(pointId)`
   - `manually_edited` = не трогаем при UPDATE (сохраняется существующее значение); при INSERT — `false`
   - `created_at` / `updated_at` — ставим при INSERT / UPDATE соответственно
   - `point_categories` — перезаписываем каждый раз: `DELETE WHERE point_id=X; INSERT FROM fractions[]`
7. **Upsert в YDB (одна транзакция на точку).**
   - `SELECT` по `(source='rsbor', source_id)`.
   - Если запись есть и `manually_edited=true` → `stats.skipped_manual++`, skip.
   - Если есть и **все сравниваемые поля совпадают** (`name`, `address`, `lat`, `lng`, `description`, `hours`, `schedule_json`, `phone`, `website`, `photo_url`, и отсортированный список `category_ids`) → `stats.unchanged++`, skip.
   - Если есть и отличается → `UPDATE` + перезапись `point_categories` (`DELETE` старые + `INSERT` новые), `stats.updated++`. `manually_edited` и `created_at` **не трогаем**, `updated_at` = `CurrentUtcTimestamp()`.
   - Если нет → `INSERT` + `INSERT` в `point_categories`, `stats.created++`. `manually_edited=false`, `created_at=updated_at=CurrentUtcTimestamp()`.
   - **Не оборачиваем весь импорт в одну большую TX** — YDB-TX имеет лимит операций. Каждая точка — своя короткая TX.
8. **Send report.** `sendImportReport({created, updated, skipped_manual, unchanged, errors, duration_ms, started_at})` через Resend.

### 2.4. Политика повторных импортов

| Ситуация | Действие |
|---|---|
| Новая точка (есть в API, нет у нас) | INSERT |
| Есть там и там, данные совпадают | skip, unchanged++ |
| Есть там и там, данные изменились, `manually_edited=false` | UPDATE |
| Есть там и там, `manually_edited=true` | skip, skipped_manual++ |
| Была у нас, пропала из API | **игнор** (не меняем status, не логируем в отчёт) |

### 2.5. `manually_edited` — механика

- Поле `Bool` на всю строку `points`.
- Автоматически ставится в `true`, когда админ что-либо правит через `/admin/points/:id/edit` (этот UI — Phase F, в Phase B только резервируем поведение).
- Пока `true` — автоимпорт пропускает точку **целиком**, ни одно поле не перезаписывается.
- Админ может снять флаг в будущей админке кнопкой «вернуть автоимпорт».
- В Phase B UI для этого нет — только само поведение «импорт уважает флаг».

### 2.6. Rate-limit и устойчивость

- **Rate-limit исходящих:** 5 req/sec = 200ms между вызовами details. На 4500 точек = ~15 минут суммарно. Вежливо для партнёрского публичного API.
- **Retry:** 3 попытки при 429/5xx с экспоненциальным backoff (1s, 2s, 4s). Одиночные фейлы идут в `errors[]`, не роняют прогон.
- **Таймаут endpoint:** `export const maxDuration = 900` (15 минут) в `route.ts`. Если упрёмся — делим на 2 вызова с резюмом (см. риски).
- **Глобальный try/catch** в оркестраторе: при исключении шлём алёртное письмо `❌ RecycleMap импорт упал` с трейсом, возвращаем `500` для Trigger.
- **Идемпотентность:** весь импорт можно перезапускать без побочных эффектов — upsert безопасен.
- **Параллелизация не делаем** — 15 минут раз в неделю, оптимизация не нужна.
- **User-Agent при запросах:** `RecycleMapSPb-Importer/1.0 (+https://<наш-домен>)` — чтобы РС в логах понимал, кто приходит.

### 2.7. Защита endpoint

- Обязательный заголовок `Authorization: Bearer <IMPORT_SECRET>` (сравнение константное по времени через `crypto.timingSafeEqual`).
- `IMPORT_SECRET` — рандом 32-байта, хранится в GitHub Secrets → env контейнера.
- YC Trigger подставляет этот заголовок в исходящий HTTP-вызов.
- Без валидного заголовка — `401`, без тела.

---

## 3. Миграция YDB-схемы

### 3.1. `sql/006_migrate_categories_rsbor.sql`

```sql
-- Добавляем метаданные РС (mapping + SVG-иконка)
ALTER TABLE categories ADD COLUMN rsbor_id Int32;
ALTER TABLE categories ADD COLUMN icon_path Utf8;

-- Обновляем существующие 8 под палитру и иконки РС
UPDATE categories SET rsbor_id = 1,  color = "#4085F3", icon_path = "/icons/fractions/paper.svg"      WHERE id = "paper";
UPDATE categories SET rsbor_id = 2,  color = "#ED671C", icon_path = "/icons/fractions/plastic.svg"    WHERE id = "plastic";
UPDATE categories SET rsbor_id = 3,  color = "#227440", icon_path = "/icons/fractions/glass.svg"      WHERE id = "glass";
UPDATE categories SET rsbor_id = 4,  color = "#E83623", icon_path = "/icons/fractions/metall.svg"     WHERE id = "metal";
UPDATE categories SET rsbor_id = 5,  color = "#2CC0A5", icon_path = "/icons/fractions/tetrapack.svg"  WHERE id = "tetrapak";
UPDATE categories SET rsbor_id = 6,  color = "#EA4C99", icon_path = "/icons/fractions/clothes.svg"    WHERE id = "textile";
UPDATE categories SET rsbor_id = 9,  color = "#C06563", icon_path = "/icons/fractions/appliances.svg" WHERE id = "electronics";
UPDATE categories SET rsbor_id = 10, color = "#C8744E", icon_path = "/icons/fractions/battery.svg"    WHERE id = "batteries";

-- Добавляем 5 новых
UPSERT INTO categories (id, label, color, icon, icon_path, rsbor_id, sort_order) VALUES
    ("lamps",     "Лампочки",       "#8F6EEF", "💡", "/icons/fractions/lightbulbs.svg", 7,  9),
    ("caps",      "Крышечки",       "#DAA219", "🎩", "/icons/fractions/caps.svg",        8,  10),
    ("tires",     "Шины",           "#6F4D41", "🛞", "/icons/fractions/tires.svg",       11, 11),
    ("hazardous", "Опасные отходы", "#242627", "☣️", "/icons/fractions/dangerous.svg",   12, 12),
    ("other",     "Прочее",         "#3EB8DE", "♻️", "/icons/fractions/other.svg",       13, 13);
```

**Итог:** `categories` = 13 строк, у всех проставлены `rsbor_id` (маппинг при импорте) и `icon_path` (рендер в UI с fallback на `icon` эмодзи).

### 3.2. `sql/007_migrate_points_schedule.sql`

```sql
ALTER TABLE points ADD COLUMN schedule_json Json;
-- source Utf8 уже есть — будем писать "rsbor"
-- source_id Utf8? уже есть — будем писать str(pointId)
-- manually_edited Bool уже есть
```

**Ничего не переименовываем.** Только добавляем `schedule_json` для сырой структуры часов.

### 3.3. Иконки

Скрипт `scripts/fetch-rsbor-icons.sh`:
```bash
#!/usr/bin/env bash
set -euo pipefail
mkdir -p public/icons/fractions
for f in paper plastic glass metall tetrapack clothes lightbulbs caps appliances battery tires dangerous other; do
  curl -sfL "https://recyclemap.ru/assets/icons/fractions/$f.svg" \
    -o "public/icons/fractions/$f.svg"
done
echo "✓ Downloaded $(ls public/icons/fractions/ | wc -l) SVG icons"
```

**Точный CDN-путь уточним через DevTools сайта РС на первом шаге плана** (возможно, не `/assets/icons/fractions/`, а `/assets/images/fractions/` или похожее). Если нет — будем копировать из их Angular-бандла.

### 3.4. Повторяемость миграций

- `ALTER TABLE ADD COLUMN` в YDB даст ошибку, если колонка уже есть → оборачиваем применение в bash с `|| true` и/или нумеруем файлы последовательно (007 после 006).
- `UPDATE ... WHERE id=X` и `UPSERT` — идемпотентны, можно применять повторно.

---

## 4. Email-отчёты (Resend)

### 4.1. Регистрация

Разово выполняется автором проекта:
1. `resend.com/signup` — создать аккаунт (Google/email).
2. API Keys → Create API Key → copy.
3. Сохранить в GitHub Secrets как `RESEND_API_KEY`.

**Пока своего домена нет** — шлём от `onboarding@resend.dev`. Когда появится (Phase G) — верифицируем SPF/DKIM на `recyclemap-spb.ru` и меняем на `noreply@recyclemap-spb.ru`.

**Лимиты:** 100 писем/день, 3000/месяц бесплатно. Наш профиль (1 письмо/нед + будущие модерационные) ≪ лимита.

### 4.2. Клиент

`lib/email.ts`:
```ts
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY!);

export type ImportStats = {
  started_at: string;
  duration_ms: number;
  created: number;
  updated: number;
  skipped_manual: number;
  unchanged: number;
  errors: { pointId: number; reason: string }[];
};

export async function sendImportReport(stats: ImportStats) {
  return resend.emails.send({
    from: "RecycleMap <onboarding@resend.dev>",
    to: (process.env.IMPORT_REPORT_TO ?? "").split(",").filter(Boolean),
    subject: `RecycleMap импорт: +${stats.created} новых, ${stats.updated} изменений`,
    html: renderReportHtml(stats),
  });
}

export async function sendImportFailure(error: Error) { /* отдельный алёрт */ }
```

### 4.3. Получатели

- **Phase B:** env-переменная `IMPORT_REPORT_TO` (CSV список email), начинаем с `victorovi4@gmail.com`.
- **Phase F:** заменяем на `SELECT email FROM admins WHERE role='admin'`.

### 4.4. Шаблон письма (минимум)

```
Тема: RecycleMap импорт: +12 новых, 47 изменений

Воскресенье 2026-04-26, 03:00 МСК
Длительность: 14 мин 32 сек

Итог:
  • Новых точек:          12
  • Обновлено:            47
  • Пропущено (ручные):    3
  • Без изменений:      4428
  • Ошибки:                2

Ошибки:
  • pointId 4521 — HTTP 500 после 3 попыток
  • pointId 5113 — невалидный JSON в details

Админка: https://bbaosmjuhscbpji6n847.containers.yandexcloud.net/admin/points
```

HTML-версия — аналогичная, с цветными заголовками и кнопкой-ссылкой в админку.

### 4.5. Алёрт при падении импорта

Если в оркестраторе ловится необработанное исключение (таймаут YDB, потеря связи, баг в коде) — отправляется отдельное письмо `❌ RecycleMap импорт упал` со стектрейсом и текстом ошибки. **Cron не ретраит автоматически** (`retry-attempts=0` в Trigger), чтобы не бомбить API партнёра.

---

## 5. План первого запуска и cron

### 5.1. Чеклист ручного прогона (Этап 1)

Выполняется однократно, **перед** установкой Trigger-а. Точные команды с пояснениями — в плане Phase B (создаётся после утверждения этой спеки).

1. **Секреты в GitHub Secrets:**
   ```bash
   echo $(openssl rand -hex 32) | gh secret set IMPORT_SECRET
   gh secret set RESEND_API_KEY  # paste из resend.com
   echo "victorovi4@gmail.com" | gh secret set IMPORT_REPORT_TO
   ```
2. **Push, деплой.** GitHub Actions автоматически раскатывает `main` на YC Serverless Container.
3. **Применить миграции:**
   ```bash
   GRPC_DNS_RESOLVER=native ydb yql --file sql/006_migrate_categories_rsbor.sql
   GRPC_DNS_RESOLVER=native ydb yql --file sql/007_migrate_points_schedule.sql
   ```
4. **Скачать иконки:**
   ```bash
   bash scripts/fetch-rsbor-icons.sh
   git add public/icons/fractions && git commit -m "feat: RSBor category icons" && git push
   ```
5. **Ручной прогон импорта** (ждём ~15 минут):
   ```bash
   IMPORT_SECRET=$(gh secret list --json name,value 2>/dev/null | jq -r '.[] | select(.name=="IMPORT_SECRET") | .value')
   # (реально GitHub Secrets не отдаются через gh — берём из буфера обмена при создании)
   URL="https://bbaosmjuhscbpji6n847.containers.yandexcloud.net"
   curl -X POST "$URL/api/cron/import-rsbor" \
     -H "Authorization: Bearer $IMPORT_SECRET" \
     -H "Content-Type: application/json" \
     --max-time 1000
   ```
6. **Проверка YDB:**
   ```bash
   GRPC_DNS_RESOLVER=native ydb yql -q "SELECT COUNT(*) FROM points WHERE source='rsbor'"
   # Ожидаем ~4500
   GRPC_DNS_RESOLVER=native ydb yql -q "SELECT id, name, address, hours FROM points WHERE source='rsbor' LIMIT 10"
   # Смотрим глазами: адреса разумные, часы распарсены
   GRPC_DNS_RESOLVER=native ydb yql -q "SELECT category_id, COUNT(*) FROM point_categories GROUP BY category_id"
   # Распределение по 13 категориям
   ```
7. **Проверка email.** В почте `victorovi4@gmail.com` должен лежать отчёт.

**Если что-то не так** — исправляем, **возможен откат**: `DELETE FROM points WHERE source='rsbor'` (и `point_categories` каскадно обработать). После фикса — повторяем шаг 5.

### 5.2. Установка cron (Этап 2)

Выполняется **только после** успешного ручного прогона:

```bash
yc serverless trigger create timer \
  --name recyclemap-rsbor-import-weekly \
  --cron-expression "0 0 3 ? * SUN *" \
  --invoke-container-id bbaosmjuhscbpji6n847 \
  --invoke-container-path "/api/cron/import-rsbor" \
  --invoke-container-service-account-id ajehuicrfcm511prdpvh \
  --retry-attempts 0
```

**Детали:**
- Cron: воскресенье 03:00 (YC time zone — UTC+3 по умолчанию в ru-central1, совпадает с МСК).
- **Retry = 0** — сознательно, чтобы при падении импорта не бомбить API РС; разбираемся через email.
- Target SA — существующий `recyclemap-sa` (уже имеет `serverless.containers.invoker`).
- **Важно:** YC Trigger на «HTTP вызов контейнера» автоматически передаёт IAM-токен, но **нам он как аутентификация не нужен** — мы полагаемся на `Authorization: Bearer $IMPORT_SECRET`, который Trigger тоже умеет подставлять через `--invoke-container-header` (проверим точный синтаксис в плане).

### 5.3. Этап 3: мониторинг первой недели

- В следующее воскресенье приходит email с отчётом.
- Если всё ок → **Phase B закрыта**.
- Если падение/аномалия → чиним вручную, повторяем.

---

## 6. Риски

| Риск | Вероятность | Последствия | Митигация |
|---|---|---|---|
| API РС сменит формат/путь | низкая | импортёр падает на следующей неделе | Дмитрий на связи с РС — предупредят; `lib/rsbor-api.ts` изолирован, фикс локальный |
| API РС ставит rate-limit (429) | низкая | retry съест или импорт упадёт | уже делаем 5 req/sec + 3 retry с backoff; при эскалации — замедлим |
| `maxDuration=900` мало | средняя | импорт обрывается по таймауту | разделить на части с резюмом по последнему `pointId`; делаем только если наступит |
| CDN-путь иконок РС не совпадает с предполагаемым | средняя | `fetch-rsbor-icons.sh` падает | на старте плана проверяем через DevTools сайта РС; при фейле копируем иконки из их Angular-бандла вручную |
| В `address` у части точек нет «Санкт-Петербург» | средняя | теряем часть точек СПб | fallback на bbox (lat 59.75–60.1, lng 29.9–30.7) |
| `operator=null` → нет phone/website | высокая | поля NULL в YDB | нормально, UI обрабатывает пустые поля |
| API РС упал в воскресенье 03:00 | средняя | cron падает, 0 данных за неделю | email-алёрт; ретраим руками в понедельник |
| Resend domain sandbox шлёт в спам | средняя | админ не видит отчёт | проверяем Spam на первом прогоне; когда купим домен — верифицируем |
| GitHub Secret не пробрасывается в контейнер | низкая | 401 при `curl` | проверяем в `.github/workflows/deploy.yml`, env уже настроен из Phase A |

---

## 7. Открытые вопросы (решим на старте плана)

- **Точный CDN-путь SVG-иконок РС** — уточним в DevTools до начала Phase B.
- **Точный синтаксис `yc serverless trigger create timer` c `--invoke-container-header`** — сверяем с актуальной документацией YC.
- **Форматирование `schedule` → текст `hours`** — какой порядок группировки использовать: «Пн-Чт 10-19, Пт 10-15» vs развёрнутый «Пн 10-19 · Вт 10-19 · ...». Решим при имплементации; легко менять (один метод `formatSchedule()`).

---

## 8. Успех фазы

Фаза закрыта, когда:

1. ✅ `categories` содержит 13 строк с цветами/иконками РС.
2. ✅ `points` содержит ~4500 строк с `source='rsbor'`, `manually_edited=false`.
3. ✅ `point_categories` заполнена, у каждой точки ≥1 категория.
4. ✅ Endpoint `POST /api/cron/import-rsbor` работает за ~15 минут, возвращает JSON-статистику, шлёт email-отчёт.
5. ✅ YC Trigger создан, сам запускает импорт еженедельно.
6. ✅ Получен первый автоматический email в следующее воскресенье, статистика совпадает с ожидаемой (0 новых, 0 изменений, ~4500 unchanged).

**Релиз-готовность:** фаза не меняет пользовательский UI (он всё ещё на JSON), но даёт заполненную БД — следующий шаг (Phase C) сможет переключить фронт на API.

---

## 9. Следующий шаг

После утверждения этой спеки — `superpowers:writing-plans` для создания `docs/superpowers/plans/2026-04-22-phase-b-rsbor-import.md` с tasks-чеклистом для `subagent-driven-development`.
