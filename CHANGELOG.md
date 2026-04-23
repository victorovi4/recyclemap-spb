# Changelog

Журнал изменений проекта RecycleMap СПб. Формат — [Keep a Changelog](https://keepachangelog.com/ru/1.1.0/), версии по [SemVer](https://semver.org/spec/v2.0.0.html).

Для ИИ-ассистентов: этот файл — основной «дневник проекта». Сверяйтесь с ним при старте новой сессии, чтобы понять где мы находимся. Новые значимые изменения записывайте сюда же.

---

## [Unreleased] — следующая фаза

_Phase C: фронт с JSON на API + Яндекс Карты._

---

## [0.2.0-phase-b] — 2026-04-22 — Data import pipeline (recyclemap API → YDB)

**Итог фазы:** есть eженедельный автоимпорт из публичного API recyclemap.ru в YDB с email-отчётами через Resend. В БД сохранено 101 точка по СПб (из ожидаемых ~4500 — временно ограничено багом пагинации на стороне recyclemap.ru). Когда RSBor починит пагинацию, weekly-cron сам подхватит остальные без нашего вмешательства.

### Added

- **HTTP endpoint** `POST /api/cron/import-rsbor` с Bearer-like auth — принимает IMPORT_SECRET через заголовок `X-Import-Secret` **ИЛИ** query-string `?secret=<hex>` (см. gotcha №3).
- **Тонкий HTTP-клиент** recyclemap API (`lib/rsbor/api.ts`) — `fetchFractions`, `fetchPointsPage`, `fetchPointDetails` с rate-limit 5 req/sec, экспоненциальный backoff (1/2/4 сек), 3 retry. Специальный класс `NonRetryableError` для 404/400 — не делаем retry.
- **Import-оркестратор** (`lib/importers/rsbor.ts`) — коллекция точек (size=500, без пагинации пока сломана), фильтр СПб по address или bbox fallback, транформация `schedule → текст "Пн–Чт 10:00–19:00"`, upsert в YDB с уважением к `manually_edited`.
- **YDB-repository** `lib/ydb-points.ts` — `pointsEqual` (pure), `findBySource`, `insertPoint`, `updatePoint`, `replacePointCategories`, `fetchRsborIdMap`.
- **Resend email** — HTML-отчёт после каждого импорта, алёрт при фатальном падении. API-key в GitHub Secrets как `RESEND_KEY`.
- **Локальный запуск** `scripts/run-import.ts` (через `npx tsx`) — обход 10-мин таймаута YC Load Balancer при ручном curl.
- **Vitest** — 39 юнит-тестов, 5 файлов (`transform`, `api`, `ydb-points`, `email`, `importer`).
- **YC Trigger** `recyclemap-rsbor-import-weekly` (id `a1skaimgmnrlbqh4sa7v`) — воскресенье 00:00 UTC = 03:00 МСК, `retry-attempts=0`.
- **Таблицы YDB** расширены:
  - `categories`: +колонки `rsbor_id Int32?`, `icon_path Utf8?`. Справочник вырос с 8 до 13 категорий (`lamps`, `caps`, `tires`, `hazardous`, `other`). Цвета и SVG-иконки — из recyclemap.ru.
  - `points`: +колонка `schedule_json Json?` для сырой структуры часов работы.
- **13 SVG-иконок** категорий РС в `public/icons/fractions/` (2.2 MB, скачаны через `scripts/fetch-rsbor-icons.sh` из `recyclemap.ru/assets/icons/fractions/`).
- **Миграции** в `sql/`: `006_migrate_categories_rsbor.sql` (DDL only), `006b_seed_rsbor_categories.sql` (seed), `007_migrate_points_schedule.sql` (schedule_json), `seed_admins.sql` (whitelist из 4 email).
- **4-й админ** в whitelist: `tulip-yulia@yandex.ru`.
- **GitHub Secrets:** `IMPORT_SECRET`, `IMPORT_REPORT_TO` (на `victorovi4@gmail.com`,`mtr1305@me.com`), `RESEND_KEY`.
- **CategoryId** расширен до 13 значений в `lib/types.ts`.
- **`scripts/`** как отдельная папка (раньше был только `*.sh`, теперь и TS).

### Changed

- `.github/workflows/deploy.yml`:
  - `revision-execution-timeout: 60s → 900s` (15 минут на импорт)
  - +3 env var: `IMPORT_SECRET`, `RESEND_API_KEY` (из `secrets.RESEND_KEY`), `IMPORT_REPORT_TO`
- Цвета категорий переписаны с собственной палитры на узнаваемую палитру recyclemap.ru (`paper #4085F3`, `plastic #ED671C`, итд).
- `package.json`: добавлены `vitest`, `@vitest/ui`, `tsx`, `resend`. Скрипты `test` и `test:watch`.

### Fixed (во время Phase B)

- `parseGeom` — regex принимал мусор вида `"POINT(1.2.3 4.5)"` (silent NaN), теперь строгий `-?\d+(?:\.\d+)?` + `isNaN` guard.
- `RSBor HTTP client`: 4xx-non-retryable был внутри `try {}` и ловился `catch`, всё-таки retry'ился. Введён `NonRetryableError` который re-throws из catch.
- `pointsEqual` — не проверял `id`/`source`/`source_id` (spec deviation, не баг в использовании).
- `findBySource` — `AGG_LIST` в correlated subquery даёт YQL `missing '::' at 'AGG_LIST'`. Переписано на 2 отдельных SELECT (points + point_categories).
- Pagination orchestrator бесконечно крутился на бажном API — добавлен dedup seen-set + лимит `MAX_PAGES=20` + stop при `totalResults` достигнут или странице без новых id.
- `IMPORT_SECRET` env в контейнере был `""` а потом `'-'` — моя ошибка `gh secret set ... --body -` (читает `-` буквально). Исправлено явным `--body "<hex>"`.

### Gotchas и уроки

1. **API recyclemap.ru — сломана пагинация.** Параметр `page=N` на 2026-04-22 игнорируется — любая страница возвращает те же 500 (или 100) первых точек. `size=500` работает, `size>1000` возвращает ошибку. Временный workaround: импортируем 500 (фильтр СПб → ~100). Когда РС починит — cron подхватит всё.
2. **YDB не миксует DDL+DML в одном query.** `ALTER TABLE ADD COLUMN ... UPDATE ...` → всё откатывается. Разделил 006 на 006 (DDL) + 006b (seed).
3. **YC Serverless Container перехватывает `Authorization: Bearer <...>`** и пытается валидировать как IAM-token — наш hex не проходит, 403 никогда не доходит до приложения. Используем `X-Import-Secret` header ИЛИ `?secret=` query.
4. **YC Trigger не поддерживает custom headers** — только `--invoke-container-path`. Поэтому endpoint принимает secret через query string.
5. **YC LB 10-мин HTTP-таймаут** — при длинном ручном curl'е соединение обрывается на 10:00. Импорт в контейнере продолжает работать до `execution_timeout=900s`. Для первого ручного прогона запускали локально через `scripts/run-import.ts`.
6. **YDB CLI auth через IAM token**: нужен env `IAM_TOKEN=$(yc iam create-token)`. В SDK: `YDB_ACCESS_TOKEN_CREDENTIALS=$(yc iam create-token)`.
7. **RSBor CDN путь иконок** — `/assets/icons/fractions/{paper,plastic,...}.svg` (проверен через browser DevTools).
8. **Весь код phase-b в TDD** — сначала failing test, потом impl, 39 тестов. Sonnet-субагенты, между задачами — spec compliance review + code quality review. Каждая review-итерация находила 1-2 реальных бага, уже описанных выше в Fixed.

### Security / operational notes

- `IMPORT_SECRET` 32-байта hex в GitHub Secrets + в env контейнера. В query-string trigger path — компромисс (попадает в YC logs). Для мирового relay — приемлемо, долгосрочно можно переделать на IAM-token validation.
- Resend — пока шлём с `onboarding@resend.dev` (sandbox). Когда купим домен (Phase G) — верифицируем SPF/DKIM, сменим на `noreply@recyclemap-spb.ru`.
- `points` в YDB сейчас 101 строка — Phase C переключит фронт с `data/points.json` на API, и эти точки появятся на карте.

### Ключевые коммиты (chronological)

```
27ec704 docs: Phase B design — RSBor API import pipeline
1602019 docs: Phase B implementation plan (18 tasks, ~12h)
a7647c8 feat(phase-b): vitest setup + parseGeom helper
be0a60e fix(phase-b): parseGeom rejects malformed WKT, add error-path tests
9fad89c types: expand CategoryId to 13 RSBor fractions
b13e67e feat(phase-b): transform helpers (formatSchedule, isSpbAddress, isSpbBbox)
6819dc0 test(phase-b): cover isSpbBbox bounds
31449d0 feat(phase-b): TypeScript types for RSBor public API
1ac3974 feat(phase-b): RSBor API HTTP client with retry
6864589 fix(phase-b): honor non-retryable 4xx in RSBor client + tests
3f90748 sql: migration 006 — RSBor categories (+5 new, colors, icons)
d562a27 sql: migration 007 — add points.schedule_json
ddcfcab feat(phase-b): YDB points repository (upsert + category sync)
65f6ab0 fix(phase-b): pointsEqual compares all scalar PointRow fields
07f8aa2 feat(phase-b): Resend email client + HTML report template
93458a1 feat(phase-b): RSBor import orchestrator
d3cfbf2 feat(phase-b): POST /api/cron/import-rsbor endpoint with Bearer auth
7d88cb2 ci: extend container timeout to 900s, add import/resend env vars
7b4537e assets(phase-b): 13 RSBor category icons + fetch script
94c5f7a sql: split migration 006 into DDL (006) + seed (006b)
1a648e6 sql: slim 006 to DDL only (seed moved to 006b)
b729504 seed: add tulip-yulia@yandex.ru to admins whitelist
f228c55 ci: RESEND_API_KEY env reads from RESEND_KEY secret
d3eac6a fix(phase-b): use X-Import-Secret header (YC intercepts Authorization)
6c09db9 fix(phase-b): stop pagination on totalResults + dedup + max 200 pages
7c9e2d7 fix(phase-b): findBySource uses two SELECTs (AGG_LIST breaks YQL)
4c9bd73 fix(phase-b): PAGE_SIZE 100→500 (workaround RSBor pagination bug)
b3f5f90 feat(phase-b): accept IMPORT_SECRET via ?secret= query
```

---

## [0.1.0-phase-a] — 2026-04-22 — Инфраструктура на Yandex Cloud

**Итог фазы:** сайт переехал с Vercel на Yandex Cloud, появилась настоящая БД (YDB), админский вход через Яндекс OAuth с whitelist-проверкой. Функциональность фронтенда не изменилась — всё ещё JSON и Leaflet, но инфраструктура готова для следующих фаз.

### Added

- **YDB Serverless database** `recyclemap-spb`
  (id `etnsnfn8f18mv9mjomar`, folder `b1g6i2jb8nd6hjs6rndg`, endpoint `grpcs://ydb.serverless.yandexcloud.net:2135`)
- **5 таблиц YDB** (см. `sql/`): `categories`, `points`, `point_categories`, `submissions`, `admins`
- **Seed данные** — 8 категорий в `categories` (plastic, glass, paper, metal, batteries, electronics, tetrapak, textile)
- **Whitelist админов** в таблице `admins`: `victorovi4@gmail.com`, `dima@cleangames.org`, `mtr1305@yandex.ru`
- **Service Account** `recyclemap-sa` (id `ajehuicrfcm511prdpvh`) с ролями: `container-registry.images.pusher`, `serverless.containers.admin`, `ydb.editor`, `serverless.containers.invoker`, `iam.serviceAccounts.user` (на самого себя)
- **YC Serverless Container** `recyclemap-spb` (id `bbaosmjuhscbpji6n847`), URL https://bbaosmjuhscbpji6n847.containers.yandexcloud.net
- **Dockerfile** — multi-stage, Node 20 alpine, standalone Next.js output, non-root user, порт 8080
- **GitHub Actions workflow** `.github/workflows/deploy.yml` — build → push в YC Container Registry → deploy в Serverless Container, триггер на push в main
- **NextAuth v5 (beta)** с Яндекс-провайдером, `/admin` защищён middleware-ом (файл `proxy.ts` в Next.js 16)
- **Yandex OAuth-приложение** «RecycleMap СПб» с тремя скоупами: `login:info`, `login:email`, `login:avatar`
- **Брендовая иконка** `public/brand/icon.{svg,256.png,512.png,1024.png}` — зелёный пин с символом переработки
- **10 GitHub Secrets**: `YC_SA_JSON_CREDENTIALS`, `YC_REGISTRY_ID`, `YC_FOLDER_ID`, `YC_SERVICE_ACCOUNT_ID`, `YANDEX_CLIENT_ID`, `YANDEX_CLIENT_SECRET`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `YDB_ENDPOINT`, `YDB_DATABASE`
- **Дизайн-документ полного продукта** `docs/superpowers/specs/2026-04-22-recyclemap-spb-full-design.md` (7 фаз, 87–117 часов)
- **План Phase A** `docs/superpowers/plans/2026-04-22-phase-a-yc-infra.md` (16 задач)
- **Бэклог** `docs/superpowers/backlog.md` — идеи на потом (чат-бот для апдейтов через Max/VK)

### Changed

- Следующая фаза строится поверх **настоящей БД** и **полного продуктового видения** (раньше был учебный MVP)
- Хостинг переехал с Vercel на Yandex Cloud Serverless Container
- `middleware.ts` переименован в `proxy.ts` (Next.js 16)
- `next.config.ts` — добавлены `output: "standalone"` и `serverExternalPackages: ["ydb-sdk", "@yandex-cloud/nodejs-sdk"]`

### Removed

- **Vercel project** `recyclemap-spb` — удалён через `vercel remove --yes`. Локальная `.vercel/` папка тоже удалена.
- **`gdegrant-test` YDB-база** — удалена, чтобы освободить слот для `recyclemap-spb`. Если понадобится для E2E тестов GdeGrant — пересоздать отдельно (квота YDB-баз сейчас 4/4 заполнена).

### Gotchas и уроки

1. **Yandex OAuth scopes** — провайдер NextAuth **хардкодит** три скоупа (`login:info login:email login:avatar`). Все три должны быть включены в OAuth-приложении, иначе `invalid_scope`.
2. **Turbopack + external CJS** — `serverExternalPackages: ["ydb-sdk"]` + `import { Driver } from "ydb-sdk"` = `TypeError: n.Driver is not a constructor`. Фикс — использовать `createRequire(import.meta.url)` (см. `lib/ydb.ts`).
3. **Next.js 16 rename** — `middleware.ts` теперь `proxy.ts` (у нас в корне).
4. **YDB не поддерживает Double как ключ индекса** — убрали `INDEX idx_location ON (lat, lng)` из `sql/002_points.sql`. Для 1000 точек bbox-фильтр через `WHERE` достаточно.
5. **Local `ydb` CLI на macOS** — c-ares не резолвит DNS. Обход: `GRPC_DNS_RESOLVER=native` в env.
6. **YC Serverless Container SA «use»** — SA, деплоящий контейнер, должен иметь роль `iam.serviceAccounts.user` на самом себе (если он же и runtime SA).
7. **NextAuth v5 env** — предпочитает `AUTH_SECRET` / `AUTH_URL` / `AUTH_TRUST_HOST=true` (v4-имена `NEXTAUTH_*` тоже работают). В `.github/workflows/deploy.yml` прописаны обе формы.

### Security / operational notes

- ⚠️ **Yandex OAuth Client Secret** (`303359c1647a4a3794038391683415e0`) прошёл через чат-сессию — **надо ротировать** через UI oauth.yandex.ru перед публичным анонсом проекта.
- Ключ сервисного аккаунта был скачан только в `/tmp` и удалён после загрузки в GitHub Secrets.
- Таблица `admins` пока не используется для авторизации по роли — только по email (whitelist).

### Ключевые коммиты (chronological)

```
a3d2c3a Initial commit from Create Next App
146321f strip default page, add design docs, ru locale
cf83f56 add types and 8 recycling categories
530651b Header + page skeleton + data loader
70f5400 30 SPb recycling points across 12 districts
5312ed0 interactive Leaflet map with colored markers and popups
a7edb89 working filter panel + gitignore research artifacts
0056f78 remove Leaflet attribution link, keep OSM attribution only
a010993 recyclemap.ru architecture reconnaissance (ref doc + 27 screenshots)
7aef8ff full product design + backlog
2e6d75b Phase A implementation plan
2874c30 enable Next.js standalone output for YC deploy
8e140f9 Dockerfile + .dockerignore
35e7fb5 GitHub Actions deploy workflow for YC
cc41ff1 initial YDB schema (5 tables) + seed 8 categories
93b2b5b YDB client singleton
fee46eb admins whitelist via YDB
2d295f6 NextAuth v5 with Yandex provider
cd3dbe8 /admin route with Yandex OAuth gate
2bb73a7 NextAuth v5 env names (AUTH_*) + AUTH_TRUST_HOST
4ab7dde createRequire for ydb-sdk to fix external-CJS interop
1a3b614 wrap up Phase A — remove debug logs, retire Vercel, mark done
```

---

## [0.0.1-mvp] — 2026-04-21 — Учебный MVP

**Итог:** работающий прототип на Vercel, показывающий паттерн. Позднее переросли в полный продукт и мигрировали на YC.

### Added

- Next.js 16.2.4 + TypeScript + Tailwind v4 + Leaflet (через `react-leaflet`)
- 30 реальных точек приёма в СПб, 8 категорий, JSON в репозитории
- Фильтр-чекбоксы, попап на карте с деталями, адаптив
- Дизайн-документ MVP `docs/superpowers/specs/2026-04-21-recyclemap-spb-mvp-design.md`
- План MVP `docs/superpowers/plans/2026-04-21-recyclemap-spb-mvp.md`
- Исследование recyclemap.ru — 27 скриншотов + 322-строчный референс-документ
- Деплой на Vercel (`recyclemap-spb.vercel.app`, потом удалён)

### Changed

- Scope пересмотрен: из учебного MVP сделали полное продуктовое видение (см. Phase A и далее)

### Retired в Phase A

- Vercel-деплой
- JSON-источник данных (скоро заменим на YDB чтением через API)
- Leaflet (заменим на Яндекс Карты в Phase C)
