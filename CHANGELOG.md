# Changelog

Журнал изменений проекта RecycleMap СПб. Формат — [Keep a Changelog](https://keepachangelog.com/ru/1.1.0/), версии по [SemVer](https://semver.org/spec/v2.0.0.html).

Для ИИ-ассистентов: этот файл — основной «дневник проекта». Сверяйтесь с ним при старте новой сессии, чтобы понять где мы находимся. Новые значимые изменения записывайте сюда же.

---

## [Unreleased] — следующая фаза

_Phase B: Data import pipeline._

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
