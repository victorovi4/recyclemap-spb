# Phase C — Frontend reads from YDB (Server Components + Leaflet)

**Дата:** 2026-04-26
**Автор:** Дмитрий Иоффе
**Статус:** утверждён к разработке
**Относится к:** [2026-04-22-recyclemap-spb-full-design.md](2026-04-22-recyclemap-spb-full-design.md) — Phase C

---

## 1. Цель и scope

### Цель

Переключить публичную карту с локального `data/points.json` (30 mock-точек) на чтение из YDB через React Server Components (RSC), расширить фильтр категорий до 13 (под таксономию РС), добавить кластеризацию и сменить дизайн маркера на «бусы» из всех категорий точки. Движок карты — остаётся **Leaflet + OpenStreetMap**.

### Контекст

После Phase B в YDB лежит 101 точка `source='rsbor'` (после починки RSBor pagination станет ~4500). Фронт пока их не видит — он рендерит 30 mock-точек из JSON. Phase C — мост между «есть данные» и «публика их видит».

### Что отличается от full-design.md (изменения, фиксируемые этой спекой)

1. **Карта остаётся на Leaflet.** Полный дизайн-док планировал переход на Яндекс Карты JS API 3.0, но мы откладываем это решение: Leaflet + OSM работает, регистрация ключа Яндекса добавляет внешнюю зависимость и риск блокировки ключа. К Яндекс Картам можно вернуться отдельной фазой, если появится конкретная необходимость (например, требование партнёра).
2. **Геокодер для будущей формы Submit (Phase E)** — Nominatim (открытый OSM-сервис) вместо Яндекс Геокодера.
3. **Чтение точек — RSC, не API route.** Full-design предполагал `/api/points?bbox=...`. В Phase C добавлять API нет смысла — внешних потребителей нет, RSC проще и быстрее. К `/api/points` вернёмся, когда появится первый внешний клиент.

Соответствующие правки занесём в full-design в момент закрытия Phase C.

### В scope

- `app/page.tsx` становится async Server Component, читает YDB напрямую, отдаёт `<HomeClient>` с props.
- Новые fetcher-функции в `lib/ydb-points.ts`: `fetchAllPoints()` и `fetchAllCategories()`.
- Новый клиентский компонент `components/HomeClient.tsx` (фильтр-стейт + рендер `FilterPanel` и `Map`).
- 13 категорий на фронте (вместо 8) — читаются из YDB. Иконки SVG из `public/icons/fractions/` (скачаны в Phase B).
- Маркер: `L.divIcon` с горизонтальной полоской цветных кружков по категориям точки. Лимит 5 + хвост `+N`. Сортировка по `category.sort_order`.
- Кластеризация: `react-leaflet-cluster` (обёртка над `leaflet.markercluster`) — `<MarkerClusterGroup>` вокруг маркеров.
- Попап точки расширен: бэйджи всех категорий с цветами и иконками РС, фото точки если есть.
- Скрипт `scripts/migrate-legacy-points.ts` — одноразовая миграция 30 mock-точек в YDB как `source='manual'` с дедупликацией по координатам (≤150 м к существующей точке = пропуск).
- Удаление `data/points.json`, `data/categories.json`, `lib/data.ts` после успешного прода.

### Не в scope (отложено)

- Замена движка карты на Яндекс Карты — без срока.
- Чипы вместо чекбоксов в фильтре, сайдбар деталей, bottom-sheet, URL-стейт (`?fractions=`, `/point/:id`), share-кнопка, deep-link «Маршрут» — Phase D.
- Форма «Предложить точку», hCaptcha, геокодинг — Phase E.
- Админ-модерация, редактирование точек — Phase F.
- API endpoint `/api/points` — добавим, когда появится внешний потребитель.
- Загрузка фото в Object Storage — backlog.
- E2E-тесты Playwright — Phase G (нужна CI-инфра).

### Оценка

**6–8 часов** (вместо 10–15 из full-design — scope сжат отказом от миграции на Яндекс Карты).

---

## 2. Архитектура

### 2.1. Data flow

```
                   ┌──────────────────────────────────┐
   браузер         │  app/page.tsx (Server Component) │
   запрашивает  ──▶│  - fetchAllPoints()      ──┐     │
   /              │  - fetchAllCategories()  ──┼─▶ YDB│
                   │                           │     │
                   │  отдаёт HTML + props ─────┘     │
                   └──────────────┬───────────────────┘
                                  │
                                  ▼
                   ┌──────────────────────────────────┐
                   │  HomeClient (Client Component)   │
                   │  - useState<Set<CategoryId>>     │
                   │  - useMemo: filtered points      │
                   │                                  │
                   │  ┌──────────┐  ┌──────────────┐ │
                   │  │FilterPanel│  │     Map      │ │
                   │  │ 13 чекбок│  │ leaflet +    │ │
                   │  │   сов    │  │ markercluster│ │
                   │  └──────────┘  └──────────────┘ │
                   └──────────────────────────────────┘
```

### 2.2. Принципиальные точки

1. **`app/page.tsx` — `async function Page()`**, без `"use client"`. Читает YDB через существующий `lib/ydb.ts` driver, кладёт результат в props `<HomeClient points={...} categories={...} />`.
2. **YDB-креды никогда не покидают сервер** — переменные `YDB_ENDPOINT`, `YDB_DATABASE` остаются server-only. Это закрывает безопасность без `/api/points`.
3. **`HomeClient.tsx` — `"use client"`**, держит фильтр-стейт (`useState<Set<CategoryId>>`), рендерит `FilterPanel` и `Map`.
4. **`FilterPanel.tsx` и `Map.tsx`/`MapInner.tsx` — без логики выборки.** Принимают данные через props.
5. **Кеширование:** `export const revalidate = 300` на `app/page.tsx` — Next.js на сервере держит кеш 5 минут. Импорт RSBor идёт раз в неделю, нам этой свежести с запасом.

### 2.3. Типы данных (передаются с server на client)

```ts
// lib/types.ts (расширяется)

export type CategoryId =
  | "plastic" | "glass" | "paper" | "metal"
  | "batteries" | "electronics" | "tetrapak" | "textile"
  | "lamps" | "caps" | "tires" | "hazardous" | "other";

export type PublicCategory = {
  id: CategoryId;
  label: string;
  color: string;          // HEX, например "#4085F3"
  iconPath: string | null; // "/icons/fractions/paper.svg"
  emoji: string;          // fallback "📄"
  sortOrder: number;
};

export type PublicPoint = {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  categoryIds: CategoryId[]; // отсортированы по category.sortOrder
  hours: string | null;
  phone: string | null;
  website: string | null;
  description: string | null;
  photoUrl: string | null;   // полный URL: "https://recyclemap.ru/images/<path>" или null
};
```

`Point` (старый тип, привязан к JSON) и текущий `Category` уходят. `PointRow` в `lib/ydb-points.ts` остаётся как есть — это серверная модель.

### 2.4. Категории — источник истины

YDB-таблица `categories` (13 строк, заполнена в Phase B). На фронт никаких хардкодов категорий не остаётся — `fetchAllCategories()` подтягивает их при каждом server-render (с кешем).

`emoji` для fallback — берём из той же таблицы (поле `icon` в YDB-схеме). Если SVG-картинка не загрузилась — рендерим эмодзи.

---

## 3. Файловые изменения

### Создаются

| Файл | Назначение |
|---|---|
| `components/HomeClient.tsx` | `"use client"` обёртка с фильтр-стейтом. Принимает `{points, categories}` от server-компонента. |
| `lib/categories.ts` | `fetchAllCategories(): Promise<PublicCategory[]>` — `SELECT id, label, color, icon, icon_path, sort_order FROM categories ORDER BY sort_order`. |
| `scripts/migrate-legacy-points.ts` | Одноразовый: читает `data/points.json`, для каждой точки `findDuplicateByRadius(150)`, если null — `insertPoint()` с `source='manual'`. |
| `scripts/migrate-legacy-points.test.ts` | Юнит на pure-функцию `findDuplicateByRadius`. |
| `lib/ydb-points.fetchAll.test.ts` | Мок driver, проверка корректной выборки `PublicPoint[]`. |
| `lib/categories.test.ts` | Сортировка, преобразование null. |
| `components/beadMarker.test.ts` | Pure-функция `buildBeadHtml(colors[])` — лимит 5+«+N», порядок цветов, экранирование. |

### Меняются

| Файл | Что меняется |
|---|---|
| `app/page.tsx` | Был `"use client"` + JSON-импорт. Становится async Server Component, читает YDB, передаёт props в `<HomeClient>`. |
| `lib/ydb-points.ts` | + `fetchAllPoints(): Promise<PublicPoint[]>` (один SQL с `LEFT JOIN point_categories`, преобразование `photoUrl`). |
| `lib/types.ts` | Добавляются `PublicPoint` и `PublicCategory`. Старый `Point`/`Category` удаляются. |
| `components/Map.tsx` | Принимает `{points: PublicPoint[], categories: PublicCategory[]}`. |
| `components/MapInner.tsx` | Замена `coloredIcon(color)` → `beadMarker(categoryColors)`. Обёртка `<MarkerClusterGroup>`. Импорт CSS markercluster. |
| `components/FilterPanel.tsx` | Без структурных изменений (она уже принимает `categories: Category[]` дженериком). Меняется тип props. |
| `components/PointPopup.tsx` | Принимает `PublicPoint`, рендерит фото если есть, использует `iconPath` (с fallback на `emoji`). |
| `app/globals.css` | + CSS для `.bead-marker` и его дочерних элементов. |
| `package.json` | + `leaflet.markercluster`, `react-leaflet-cluster`, `@types/leaflet.markercluster`. |
| `docs/superpowers/specs/2026-04-22-recyclemap-spb-full-design.md` | Карта Leaflet, чтение через RSC, Nominatim вместо Яндекс Геокодера. |
| `CHANGELOG.md` | Запись в `[Unreleased]` → потом → `[0.3.0-phase-c]`. |

### Удаляются (после успешного прода)

| Файл | Причина |
|---|---|
| `data/points.json` | Данные мигрировали в YDB. История в git. |
| `data/categories.json` | Категории читаются из YDB. |
| `lib/data.ts` | Больше нет JSON-источника. |

---

## 4. Маркер «бусы»

### 4.1. HTML-шаблон

```html
<div class="bead-marker">
  <span style="background:#4085F3"></span>
  <span style="background:#ED671C"></span>
  <span style="background:#227440"></span>
  <span style="background:#EA4C99"></span>
  <span style="background:#8F6EEF"></span>
  <span class="more">+3</span>     <!-- появляется при N>5 -->
</div>
```

### 4.2. CSS (в `app/globals.css`)

```css
.bead-marker {
  display: flex;
  gap: 2px;
  padding: 4px;
  background: white;
  border-radius: 14px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
  align-items: center;
}
.bead-marker span {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}
.bead-marker .more {
  width: auto;
  height: auto;
  border-radius: 0;
  background: transparent;
  font-size: 10px;
  color: #555;
  padding: 0 2px;
  font-weight: 600;
}
```

### 4.3. Хелпер (pure)

```ts
// components/beadMarker.ts
export function buildBeadHtml(colors: string[], maxBeads = 5): string {
  const visible = colors.slice(0, maxBeads);
  const overflow = colors.length - visible.length;
  const beads = visible.map((c) => `<span style="background:${escapeColor(c)}"></span>`).join("");
  const more = overflow > 0 ? `<span class="more">+${overflow}</span>` : "";
  return `<div class="bead-marker">${beads}${more}</div>`;
}
```

`escapeColor` — простая проверка regex `/^#[0-9a-fA-F]{3,8}$/`, чтобы не вставить мусор в `style` (категории читаются из YDB, доверенный источник, но защита недорогая).

### 4.4. Сортировка цветов

В `MapInner.tsx` перед сборкой бус: цвета берутся в порядке `point.categoryIds`, который уже отсортирован по `category.sortOrder` на этапе `fetchAllPoints()`. Это даёт стабильный визуальный паттерн — у похожих точек одинаковая последовательность цветов.

### 4.5. Якорь и размер

```ts
L.divIcon({
  className: "",
  html: buildBeadHtml(colors),
  iconSize: null,        // авторазмер по контенту
  iconAnchor: [9, 9],    // середина первой бусины (10/2 + padding 4)
});
```

---

## 5. Кластеризация

### 5.1. Зависимости

```bash
npm i leaflet.markercluster react-leaflet-cluster
npm i -D @types/leaflet.markercluster
```

### 5.2. Использование

```tsx
import MarkerClusterGroup from "react-leaflet-cluster";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";

<MarkerClusterGroup
  chunkedLoading
  maxClusterRadius={50}
  spiderfyOnMaxZoom
  showCoverageOnHover={false}
  disableClusteringAtZoom={15}
>
  {points.map((p) => <Marker key={p.id} ... />)}
</MarkerClusterGroup>
```

### 5.3. Параметры

| Параметр | Значение | Зачем |
|---|---|---|
| `maxClusterRadius` | `50` (пиксели) | На zoom 11 (общий вид СПб) кластер собирает плотные группы. |
| `disableClusteringAtZoom` | `15` | На уровне улиц показываем все маркеры по отдельности. |
| `spiderfyOnMaxZoom` | `true` | Если несколько точек ровно в одной координате на максимальном зуме — раскидываются «паучком». |
| `chunkedLoading` | `true` | Рендер пачками 200 шт., UI не лочится при 4500 точек. |
| `showCoverageOnHover` | `false` | Убираем shadow-полигон при наведении (визуальный шум). |

Стиль самого кластера — дефолтный (бирюзовый круг с числом). Кастомизация (цвета по доминирующей категории и т. п.) — Phase D или backlog.

### 5.4. Поведение с фильтром

При смене чекбокса `HomeClient` пересобирает `filteredPoints`, React рендерит `<MarkerClusterGroup>` с новым набором, библиотека сама пересобирает кластеры. Никакой императивной работы с инстансом класстера у нас нет.

---

## 6. Миграция 30 mock-точек

### 6.1. Алгоритм

1. Прочитать `data/points.json` (30 строк) и `data/categories.json` (8 строк).
2. Для каждой mock-точки `m`:
   1. `dup = findDuplicateByRadius(m, existingPoints, 150 /* m */)`. Здесь `existingPoints` — все точки, которые уже есть в YDB (получаем одним `fetchAllPoints()` в начале скрипта).
   2. Если `dup !== null` → лог `⊘ "${m.name}" дубль с ${dup.id} (расстояние ${d} м)`, skip.
   3. Иначе:
      - Сборка `PointRow`: `id="manual-${slug(m.name)}-${m.lat.toFixed(4)}"`, `source="manual"`, `source_id=null`, `manually_edited=false`, `status="active"`, `created_at=updated_at=now()`, `categoryIds = m.categories`. Поля `photo_url`, `schedule_json` — null.
      - `insertPoint(row)` (повторно используем существующую функцию из `lib/ydb-points.ts`).
      - Лог `+ "${m.name}" → ${row.id}`.
3. Печатать итог: `created: N | skipped: M`.

### 6.2. `findDuplicateByRadius` (pure, тестируемая)

```ts
export function findDuplicateByRadius(
  needle: { lat: number; lng: number },
  haystack: { id: string; lat: number; lng: number }[],
  radiusMeters: number,
): { id: string; distanceMeters: number } | null {
  let best: { id: string; distanceMeters: number } | null = null;
  for (const h of haystack) {
    const d = haversine(needle.lat, needle.lng, h.lat, h.lng);
    if (d <= radiusMeters && (!best || d < best.distanceMeters)) {
      best = { id: h.id, distanceMeters: d };
    }
  }
  return best;
}
```

`haversine(lat1, lng1, lat2, lng2)` — стандартная формула, возвращает метры. Радиус Земли 6 371 000 м. На дистанциях <500 м разница с более точными формулами незначительна.

### 6.3. Идемпотентность

Стабильный `id="manual-${slug(name)}-${lat.toFixed(4)}"` означает: при повторном запуске скрипта `findDuplicateByRadius` найдёт уже существующую запись (она же среди `existingPoints`), пропустит. То есть скрипт безопасно перезапустить.

### 6.4. Запуск

```bash
YDB_ACCESS_TOKEN_CREDENTIALS=$(yc iam create-token) \
GRPC_DNS_RESOLVER=native \
npx tsx scripts/migrate-legacy-points.ts
```

Запускается **локально** (не из контейнера) — это разовая миграция, и она не должна попадать в CI.

### 6.5. Удаление JSON

В отдельном коммите, после деплоя и визуальной проверки прода:
- `git rm data/points.json data/categories.json lib/data.ts`.
- В `lib/types.ts` удалить старые `Point` и `Category`.
- Деплой → проверить, что прод по-прежнему работает.

---

## 7. Тесты

### 7.1. Юнит (vitest)

| Файл | Что проверяем |
|---|---|
| `lib/ydb-points.fetchAll.test.ts` | Мок driver: `fetchAllPoints()` корректно собирает `categoryIds` (отсортированные по `sortOrder`), преобразует null-поля, формирует `photoUrl` с префиксом `https://recyclemap.ru/images/`. |
| `lib/categories.test.ts` | `fetchAllCategories()` сортирует по `sort_order`, маппит null → null для `iconPath`. |
| `components/beadMarker.test.ts` | `buildBeadHtml`: 3 цвета → 3 span'а без `more`; 8 цветов → 5 span'ов + `<span class="more">+3</span>`; пустой массив → пустой `<div>`; цвет с инъекцией (`"red; bg:url(x)"`) — отбрасывается. |
| `scripts/migrate-legacy-points.test.ts` | `findDuplicateByRadius`: точка на 100 м → возвращается; на 200 м → null; пустой haystack → null; несколько в радиусе → ближайшая. |

### 7.2. Существующие тесты Phase B (не должны сломаться)

`npm test` после всех изменений — все 39 предыдущих тестов зелёные плюс новые.

### 7.3. E2E (отложено до Phase G)

Headed Playwright против прода: открыть `/`, проверить ≥100 маркеров, кликнуть, проверить попап. Требует CI-инфры — добавим в Phase G вместе с доменом и аналитикой.

---

## 8. Верификация на проде

После деплоя автор проверяет руками:

1. На главной видны маркеры (не только 30 mock).
2. На zoom 11 видны кластеры с числами.
3. На zoom 15+ кластеры распадаются на индивидуальные маркеры.
4. Многокатегорийные точки показывают ≥2 цветных бусины.
5. Клик по маркеру → попап с названием, адресом, бэйджами всех категорий, фото если есть, описанием.
6. Чекбокс «Лампочки» (новая категория) скрывает/показывает соответствующие точки.
7. «Сбросить» → счётчик «Найдено: 0».
8. «Выбрать все» → счётчик «Найдено: 131» (или сколько после миграции).
9. Админ-дашборд `/admin` продолжает работать.
10. Импорт `/api/cron/import-rsbor` запустился вручную (`curl ... ?secret=...`) → email-отчёт пришёл, `unchanged ≈ 101`.

---

## 9. План реализации (эскиз для writing-plans)

| # | Задача | Оценка | Зависимости |
|---|---|---|---|
| 1 | `lib/types.ts`: добавить `PublicPoint`, `PublicCategory` | 20 мин | — |
| 2 | `lib/ydb-points.ts`: `fetchAllPoints()` + тест | 1 ч | 1 |
| 3 | `lib/categories.ts`: `fetchAllCategories()` + тест | 30 мин | 1 |
| 4 | `scripts/migrate-legacy-points.ts` + тест `findDuplicateByRadius` | 1 ч | 2 |
| 5 | Запуск миграции локально → визуальная проверка YDB | 15 мин | 4 |
| 6 | `app/page.tsx` → async Server Component + `components/HomeClient.tsx` | 45 мин | 2, 3 |
| 7 | `components/beadMarker.ts` + тест + замена в `MapInner.tsx` | 1 ч | 1 |
| 8 | Кластеризация: зависимости + `<MarkerClusterGroup>` обёртка | 30 мин | 7 |
| 9 | `components/PointPopup.tsx` под `PublicPoint` (фото, 13 категорий, иконки) | 30 мин | 1, 7 |
| 10 | Smoke-тест `npm run dev` локально | 30 мин | 6–9 |
| 11 | Деплой → прод-чеклист (см. §8) | 30 мин | 10 |
| 12 | Удалить `data/points.json`, `data/categories.json`, `lib/data.ts` | 10 мин | 11 |
| 13 | Обновить full-design.md + `CHANGELOG.md` | 30 мин | 12 |

**Итого:** ~6 ч 50 мин чистого времени → **6–8 часов** с проверками и debug.

### Стратегия subagent-driven-development

- **sonnet** (логика + тесты + RSC-перевод): задачи 2, 3, 4, 6, 7.
- **haiku** (механические правки): задачи 1, 8, 9, 12, 13.
- **интерактивно с автором**: задачи 5, 10, 11.

---

## 10. Риски

| Риск | Вероятность | Митигация |
|---|---|---|
| `react-leaflet-cluster` несовместим с `react-leaflet@5` | низкая | проверим на старте задачи 8; fallback — прямой `leaflet.markercluster` через `useEffect` ref в `MapInner` |
| YDB-запрос `fetchAllPoints` тормозит при 4500 точках | низкая | один SQL с join'ом, в YDB <1с при <10k строк; `revalidate=300` сглаживает |
| `next.config.ts: serverExternalPackages: ["ydb-sdk"]` уже работает | подтверждено | работает в админке Phase A — там уже `getDriver()` из RSC |
| 30 mock-точек все окажутся дублями | средняя | приемлемо: лог `skipped: 30`, фронт показывает 101 RSBor |
| Markercluster CSS конфликтует с Tailwind | низкая | импорт CSS до Tailwind в `globals.css`; debug при возникновении |
| После удаления `data/points.json` фронт падает в SSR | низкая | задача 12 идёт **после** успешного деплоя задачи 11 |

---

## 11. Открытые вопросы

Нет — все принципиальные решения зафиксированы в брейншторме.

---

## 12. Успех фазы

Фаза закрыта, когда:

1. ✅ Прод-фронт показывает ≥100 точек из YDB (вместо 30 mock из JSON).
2. ✅ Фильтр содержит 13 чекбоксов, каждый управляет видимостью.
3. ✅ Многокатегорийные точки показывают всё через «бусы».
4. ✅ На zoom 11 видны кластеры; на zoom 15 — индивидуальные маркеры.
5. ✅ Попап точки показывает все категории, фото (если есть), описание.
6. ✅ `data/points.json` и `data/categories.json` удалены, `lib/data.ts` тоже.
7. ✅ `npm test` зелёный, новых тестов ≥4.
8. ✅ `CHANGELOG.md` и full-design.md обновлены.

**Релиз-готовность:** видна публикой, можно показывать партнёру (Раздельный Сбор) и собирать первый фидбек.

---

## 13. Следующий шаг

После утверждения этой спеки автором — `superpowers:writing-plans` для создания `docs/superpowers/plans/2026-04-26-phase-c-frontend-api.md` с tasks-чеклистом для `subagent-driven-development`.
