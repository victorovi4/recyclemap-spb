# Phase A — YC Infra + Deploy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Мигрировать текущий recyclemap-spb (Next.js + JSON + Leaflet) с Vercel на Yandex Cloud Serverless Container, создать YDB-схему и подключить NextAuth через Яндекс OAuth с whitelist-проверкой. Все фичи текущего сайта сохраняются, добавляется только защищённый `/admin`-роут-заглушка.

**Architecture:** Используем паттерн deploy, уже работающий в GdeGrant: Dockerfile (multi-stage, Node 20, standalone Next.js output), GitHub Actions CI/CD (test → build → push в YC Container Registry → deploy в Serverless Container). БД — YDB Serverless, уже создана. Auth — NextAuth.js v5 с Яндекс-провайдером и проверкой whitelist в `admins` таблице.

**Tech Stack:** Next.js 16 + TypeScript, YDB (ydb-sdk v5), NextAuth.js v5, Yandex Cloud Serverless Container, Yandex Container Registry, GitHub Actions, Docker.

**Спецификация:** [docs/superpowers/specs/2026-04-22-recyclemap-spb-full-design.md](../specs/2026-04-22-recyclemap-spb-full-design.md)

**Существующие YC ресурсы:**
- Cloud: `b1gllfcopm13aodjgmkb` (`cleangames-secretaryorg`)
- Folder: `b1g6i2jb8nd6hjs6rndg` (`gdegrant`) — используем его для recyclemap
- YDB database: `recyclemap-spb` (id `etnsnfn8f18mv9mjomar`), endpoint `grpcs://ydb.serverless.yandexcloud.net:2135/?database=/ru-central1/b1gllfcopm13aodjgmkb/etnsnfn8f18mv9mjomar`
- Container Registry: `gdegrant` (`crpioubc2iths58n1mn8`) — переиспользуем, только образы с префиксом `recyclemap-spb:*`

**Что на выходе Phase A:**
- Сайт работает на YC-хостинге (HTTPS, через `*.containers.yandexcloud.net` subdomain)
- Все текущие фичи (карта, 30 точек, фильтры) сохранены, данные всё ещё из JSON
- YDB-схема (5 таблиц) создана, `categories` заполнена 8 строками
- Страница `/admin` есть, пускает только через Яндекс OAuth и только тех, кто в таблице `admins`
- GitHub Actions автоматически деплоит main-ветку
- Vercel деплой удалён

---

## File structure (что будет создано или изменено)

```
recyclemap/
├── .dockerignore              # НОВОЕ
├── Dockerfile                 # НОВОЕ
├── next.config.ts             # ИЗМЕНЕНО (add output: 'standalone')
├── package.json               # ИЗМЕНЕНО (new deps)
├── .github/workflows/
│   └── deploy.yml             # НОВОЕ
├── sql/
│   ├── 001_categories.sql     # НОВОЕ
│   ├── 002_points.sql         # НОВОЕ
│   ├── 003_point_categories.sql  # НОВОЕ
│   ├── 004_submissions.sql    # НОВОЕ
│   ├── 005_admins.sql         # НОВОЕ
│   └── seed_categories.sql    # НОВОЕ
├── lib/
│   ├── ydb.ts                 # НОВОЕ (YDB client helper)
│   ├── auth.ts                # НОВОЕ (NextAuth config)
│   └── admins.ts              # НОВОЕ (whitelist check)
├── app/
│   ├── api/
│   │   └── auth/
│   │       └── [...nextauth]/
│   │           └── route.ts   # НОВОЕ
│   └── admin/
│       ├── layout.tsx         # НОВОЕ (session gate)
│       └── page.tsx           # НОВОЕ (stub)
├── middleware.ts              # НОВОЕ (admin route protection)
└── .env.local.example         # НОВОЕ (for dev)
```

---

## Task 1 — YC Service Account для деплоев

**Files:**
- Modify: `.github/settings` (на GitHub.com, не в репозитории — секреты)

- [ ] **Step 1: Создать service account `recyclemap-sa`**

```bash
yc iam service-account create recyclemap-sa \
  --description "Deploy and runtime SA for recyclemap-spb"
```

Ожидаемо: JSON с `id` нового SA, сохраните — он понадобится в следующих шагах как `SA_ID`.

- [ ] **Step 2: Записать SA_ID в переменную окружения (только для этой сессии)**

```bash
export SA_ID=$(yc iam service-account get --name recyclemap-sa --format json | python3 -c "import json,sys; print(json.load(sys.stdin)['id'])")
echo "SA_ID=$SA_ID"
```

- [ ] **Step 3: Дать SA права на деплой в контейнер и пуш в Container Registry**

```bash
# Право пушить образы в CR
yc container registry add-access-binding \
  --id crpioubc2iths58n1mn8 \
  --role container-registry.images.pusher \
  --service-account-id $SA_ID

# Право создавать/обновлять Serverless Containers
yc resource-manager folder add-access-binding b1g6i2jb8nd6hjs6rndg \
  --role serverless.containers.admin \
  --service-account-id $SA_ID

# Право читать/писать в нашу YDB
yc resource-manager folder add-access-binding b1g6i2jb8nd6hjs6rndg \
  --role ydb.editor \
  --service-account-id $SA_ID

# Право на вызов контейнера
yc resource-manager folder add-access-binding b1g6i2jb8nd6hjs6rndg \
  --role serverless.containers.invoker \
  --service-account-id $SA_ID
```

Ожидаемо: четыре подтверждения без ошибок.

- [ ] **Step 4: Создать authorized key для этого SA**

```bash
yc iam key create \
  --service-account-id $SA_ID \
  --output /tmp/recyclemap-sa-key.json \
  --description "GitHub Actions deploy key"
```

**ВАЖНО:** файл `/tmp/recyclemap-sa-key.json` содержит приватный ключ. Не коммитьте его.

- [ ] **Step 5: Положить ключ в GitHub Secrets**

```bash
gh secret set YC_SA_JSON_CREDENTIALS \
  --repo victorovi4/recyclemap-spb \
  < /tmp/recyclemap-sa-key.json

gh secret set YC_REGISTRY_ID \
  --repo victorovi4/recyclemap-spb \
  --body "crpioubc2iths58n1mn8"

gh secret set YC_FOLDER_ID \
  --repo victorovi4/recyclemap-spb \
  --body "b1g6i2jb8nd6hjs6rndg"

gh secret set YC_SERVICE_ACCOUNT_ID \
  --repo victorovi4/recyclemap-spb \
  --body "$SA_ID"
```

Ожидаемо: четыре `✓ Set secret XXX`.

- [ ] **Step 6: Удалить локальный ключ**

```bash
shred -u /tmp/recyclemap-sa-key.json 2>/dev/null || rm -P /tmp/recyclemap-sa-key.json
```

- [ ] **Step 7: Commit**

Ничего не коммитим в этом шаге — GitHub Secrets на стороне GitHub, файлов в репо не меняем. Но убедимся что ключ нигде не лежит:

```bash
git status
```

Expected: `nothing to commit`. Если что-то появилось — не то.

---

## Task 2 — Yandex OAuth приложение

**Files:** никаких в репо. Регистрация приложения на oauth.yandex.ru.

- [ ] **Step 1: Открыть https://oauth.yandex.ru/client/new**

Регистрация нового приложения.

- [ ] **Step 2: Заполнить форму**

- **Название:** `RecycleMap СПб`
- **Платформы:** галочку «Веб-сервисы»
- **Callback URI:** `http://localhost:3000/api/auth/callback/yandex` (для разработки)
  + позже добавим прод-URL когда он будет известен
- **Scope (Права):** галочку `login:email` (нужен email для whitelist)

- [ ] **Step 3: Сохранить Client ID + Client Secret**

Скопировать с экрана «Данные приложения».

- [ ] **Step 4: Положить в GitHub Secrets**

Замените `<CLIENT_ID>` и `<CLIENT_SECRET>` на реальные значения:

```bash
gh secret set YANDEX_CLIENT_ID --repo victorovi4/recyclemap-spb --body "<CLIENT_ID>"
gh secret set YANDEX_CLIENT_SECRET --repo victorovi4/recyclemap-spb --body "<CLIENT_SECRET>"
```

- [ ] **Step 5: Сгенерировать NEXTAUTH_SECRET (случайная строка)**

```bash
NEXTAUTH_SECRET=$(openssl rand -base64 32)
echo "$NEXTAUTH_SECRET"
gh secret set NEXTAUTH_SECRET --repo victorovi4/recyclemap-spb --body "$NEXTAUTH_SECRET"
unset NEXTAUTH_SECRET
```

- [ ] **Step 6: Положить YDB креды в GitHub Secrets**

```bash
gh secret set YDB_ENDPOINT --repo victorovi4/recyclemap-spb --body "grpcs://ydb.serverless.yandexcloud.net:2135"
gh secret set YDB_DATABASE --repo victorovi4/recyclemap-spb --body "/ru-central1/b1gllfcopm13aodjgmkb/etnsnfn8f18mv9mjomar"
```

- [ ] **Step 7: Проверить список всех секретов**

```bash
gh secret list --repo victorovi4/recyclemap-spb
```

Ожидаемо: должно быть как минимум 8 секретов: `YC_SA_JSON_CREDENTIALS`, `YC_REGISTRY_ID`, `YC_FOLDER_ID`, `YC_SERVICE_ACCOUNT_ID`, `YANDEX_CLIENT_ID`, `YANDEX_CLIENT_SECRET`, `NEXTAUTH_SECRET`, `YDB_ENDPOINT`, `YDB_DATABASE`.

- [ ] **Step 8: Commit** — нечего коммитить, переходим к следующей задаче.

---

## Task 3 — Next.js standalone output

**Files:**
- Modify: `next.config.ts`

- [ ] **Step 1: Обновить `next.config.ts`**

Заменить всё содержимое на:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  turbopack: {
    root: __dirname,
  },
  images: {
    unoptimized: true, // стандартные Next/Image не работают в Serverless Container без лишних настроек
  },
};

export default nextConfig;
```

- [ ] **Step 2: Проверить локально что собирается**

```bash
npm run build
```

Ожидаемо: `✓ Compiled successfully`. В `.next/standalone/` появится минимальный сервер.

- [ ] **Step 3: Commit**

```bash
git add next.config.ts
git commit -m "feat(infra): enable Next.js standalone output for YC deploy"
```

---

## Task 4 — Dockerfile и .dockerignore

**Files:**
- Create: `Dockerfile`
- Create: `.dockerignore`

- [ ] **Step 1: Создать `.dockerignore`**

```
node_modules
.next
.git
.github
docs
.vscode
.claude
.playwright-mcp
.superpowers
.env*
!.env.example
coverage
*.log
.DS_Store
README.md
```

- [ ] **Step 2: Создать `Dockerfile`**

```dockerfile
# Stage 1: Install dependencies
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --prefer-offline --no-audit

# Stage 2: Build
FROM node:20-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build && find .next -name '*.map' -delete

# Stage 3: Production
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

RUN chown -R 1001:1001 /app

USER nextjs

# YC Serverless Container ожидает приложение на порту 8080
ENV PORT=8080
ENV HOSTNAME="0.0.0.0"

EXPOSE 8080

CMD ["node", "server.js"]
```

- [ ] **Step 3: Собрать локально чтобы убедиться что Dockerfile корректен**

```bash
docker build -t recyclemap-spb:local .
```

Ожидаемо: после 2–5 минут билда — `Successfully tagged recyclemap-spb:local`.

Если Docker Desktop не запущен — запустите его через Applications.

- [ ] **Step 4: Запустить контейнер и проверить**

```bash
docker run --rm -p 8080:8080 recyclemap-spb:local
```

Ждите `Ready` в логах. В другом терминале:

```bash
curl -sS -o /dev/null -w "HTTP %{http_code}\n" http://localhost:8080
```

Ожидаемо: `HTTP 200`. Останавливаем контейнер — `Ctrl+C`.

- [ ] **Step 5: Commit**

```bash
git add Dockerfile .dockerignore
git commit -m "feat(infra): Dockerfile + .dockerignore for standalone Next.js"
```

---

## Task 5 — GitHub Actions workflow

**Files:**
- Create: `.github/workflows/deploy.yml`

- [ ] **Step 1: Создать workflow**

```yaml
name: Deploy to Yandex Cloud

on:
  push:
    branches: [main]
  workflow_dispatch:

env:
  CR_REGISTRY: ${{ secrets.YC_REGISTRY_ID }}
  CR_REPOSITORY: recyclemap-spb
  IMAGE_TAG: ${{ github.sha }}

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    permissions:
      contents: read

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Login to Yandex Container Registry
        uses: yc-actions/yc-cr-login@v2
        with:
          yc-sa-json-credentials: ${{ secrets.YC_SA_JSON_CREDENTIALS }}

      - name: Build Docker image
        run: |
          docker build \
            -t cr.yandex/${{ env.CR_REGISTRY }}/${{ env.CR_REPOSITORY }}:${{ env.IMAGE_TAG }} \
            -t cr.yandex/${{ env.CR_REGISTRY }}/${{ env.CR_REPOSITORY }}:latest \
            .

      - name: Push Docker image
        run: |
          docker push cr.yandex/${{ env.CR_REGISTRY }}/${{ env.CR_REPOSITORY }}:${{ env.IMAGE_TAG }}
          docker push cr.yandex/${{ env.CR_REGISTRY }}/${{ env.CR_REPOSITORY }}:latest

      - name: Deploy Serverless Container
        uses: yc-actions/yc-sls-container-deploy@v2
        with:
          yc-sa-json-credentials: ${{ secrets.YC_SA_JSON_CREDENTIALS }}
          container-name: recyclemap-spb
          folder-id: ${{ secrets.YC_FOLDER_ID }}
          revision-image-url: cr.yandex/${{ env.CR_REGISTRY }}/${{ env.CR_REPOSITORY }}:${{ env.IMAGE_TAG }}
          revision-service-account-id: ${{ secrets.YC_SERVICE_ACCOUNT_ID }}
          revision-memory: 512Mb
          revision-cores: 1
          revision-core-fraction: 100
          revision-concurrency: 8
          revision-execution-timeout: 60s
          public: true
          revision-env: |
            NEXTAUTH_SECRET=${{ secrets.NEXTAUTH_SECRET }}
            NEXTAUTH_URL=${{ secrets.NEXTAUTH_URL }}
            YANDEX_CLIENT_ID=${{ secrets.YANDEX_CLIENT_ID }}
            YANDEX_CLIENT_SECRET=${{ secrets.YANDEX_CLIENT_SECRET }}
            YDB_ENDPOINT=${{ secrets.YDB_ENDPOINT }}
            YDB_DATABASE=${{ secrets.YDB_DATABASE }}
            YC_SERVICE_ACCOUNT_ID=${{ secrets.YC_SERVICE_ACCOUNT_ID }}
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/deploy.yml
git commit -m "feat(infra): GitHub Actions deploy workflow for YC"
```

---

## Task 6 — Создать Serverless Container

**Files:** никаких в репо.

- [ ] **Step 1: Создать пустой контейнер через yc CLI**

```bash
yc serverless container create \
  --name recyclemap-spb \
  --folder-id b1g6i2jb8nd6hjs6rndg \
  --description "RecycleMap СПб production"
```

Ожидаемо: JSON с `id` нового контейнера.

- [ ] **Step 2: Записать URL контейнера**

```bash
yc serverless container get --name recyclemap-spb | grep "^url:"
```

Ожидаемо: `url: https://<container-id>.containers.yandexcloud.net/`. Сохраните этот URL — это ваш NEXTAUTH_URL.

- [ ] **Step 3: Добавить NEXTAUTH_URL в GitHub Secrets**

Замените `<URL>` на полученный URL:

```bash
gh secret set NEXTAUTH_URL \
  --repo victorovi4/recyclemap-spb \
  --body "<URL БЕЗ завершающего слеша>"
```

Например: `https://bba12345.containers.yandexcloud.net`

- [ ] **Step 4: Добавить callback URI в Yandex OAuth**

На https://oauth.yandex.ru/client (кнопка «Редактировать» вашего приложения):

- В поле Callback URI добавить вторую строчку: `<NEXTAUTH_URL>/api/auth/callback/yandex`
  (например `https://bba12345.containers.yandexcloud.net/api/auth/callback/yandex`)

Сохранить.

---

## Task 7 — Первый деплой (проверка инфры до кода приложения)

- [ ] **Step 1: Запушить workflow на main**

```bash
git push
```

- [ ] **Step 2: Открыть Actions и ждать зелёный результат**

```bash
gh run watch
```

(или через веб https://github.com/victorovi4/recyclemap-spb/actions)

Ожидаемо: через 3–5 минут — `✓ Deploy to Yandex Cloud`.

- [ ] **Step 3: Проверить что сайт отвечает**

```bash
curl -sS -o /dev/null -w "HTTP %{http_code} | %{size_download} bytes | %{time_total}s\n" <NEXTAUTH_URL>
```

Ожидаемо: `HTTP 200`, размер похож на Vercel-версию. Откройте URL в браузере — увидите карту с 30 точками как раньше, но уже на YC.

- [ ] **Step 4: Если упало — разобрать логи**

```bash
gh run view --log-failed
# или
yc serverless container logs recyclemap-spb --tail 100
```

Не идём дальше пока сайт не работает на YC.

---

## Task 8 — YDB схема (Data Definition)

**Files:**
- Create: `sql/001_categories.sql`
- Create: `sql/002_points.sql`
- Create: `sql/003_point_categories.sql`
- Create: `sql/004_submissions.sql`
- Create: `sql/005_admins.sql`
- Create: `sql/seed_categories.sql`

- [ ] **Step 1: Создать папку и категории**

`sql/001_categories.sql`:

```sql
CREATE TABLE categories (
    id Utf8 NOT NULL,
    label Utf8 NOT NULL,
    color Utf8 NOT NULL,
    icon Utf8 NOT NULL,
    sort_order Int32 NOT NULL,
    PRIMARY KEY (id)
);
```

- [ ] **Step 2: Создать `sql/002_points.sql`**

```sql
CREATE TABLE points (
    id Utf8 NOT NULL,
    name Utf8 NOT NULL,
    address Utf8 NOT NULL,
    lat Double NOT NULL,
    lng Double NOT NULL,
    hours Utf8,
    phone Utf8,
    website Utf8,
    description Utf8,
    status Utf8 NOT NULL,
    source Utf8 NOT NULL,
    source_id Utf8,
    photo_url Utf8,
    manually_edited Bool NOT NULL,
    created_at Timestamp NOT NULL,
    updated_at Timestamp NOT NULL,
    PRIMARY KEY (id),
    INDEX idx_source_id GLOBAL ON (source, source_id),
    INDEX idx_location GLOBAL ON (lat, lng)
);
```

- [ ] **Step 3: Создать `sql/003_point_categories.sql`**

```sql
CREATE TABLE point_categories (
    point_id Utf8 NOT NULL,
    category_id Utf8 NOT NULL,
    PRIMARY KEY (point_id, category_id)
);
```

- [ ] **Step 4: Создать `sql/004_submissions.sql`**

```sql
CREATE TABLE submissions (
    id Utf8 NOT NULL,
    type Utf8 NOT NULL,
    target_point_id Utf8,
    submitter_email Utf8 NOT NULL,
    payload Json NOT NULL,
    status Utf8 NOT NULL,
    admin_note Utf8,
    created_at Timestamp NOT NULL,
    reviewed_at Timestamp,
    PRIMARY KEY (id),
    INDEX idx_status GLOBAL ON (status, created_at)
);
```

- [ ] **Step 5: Создать `sql/005_admins.sql`**

```sql
CREATE TABLE admins (
    yandex_id Utf8 NOT NULL,
    email Utf8 NOT NULL,
    role Utf8 NOT NULL,
    created_at Timestamp NOT NULL,
    PRIMARY KEY (yandex_id)
);
```

- [ ] **Step 6: Создать `sql/seed_categories.sql`**

```sql
UPSERT INTO categories (id, label, color, icon, sort_order) VALUES
    ("plastic",     "Пластик",            "#2E7D32", "🧴", 1),
    ("glass",       "Стекло",             "#00838F", "🍾", 2),
    ("paper",       "Бумага и картон",    "#8D6E63", "📄", 3),
    ("metal",       "Металл",             "#546E7A", "🥫", 4),
    ("batteries",   "Батарейки",          "#EF6C00", "🔋", 5),
    ("electronics", "Электроника",        "#5E35B1", "💻", 6),
    ("tetrapak",    "Тетрапак",           "#D84315", "📦", 7),
    ("textile",     "Одежда и текстиль",  "#C2185B", "👕", 8);
```

- [ ] **Step 7: Применить все миграции к YDB**

```bash
export YDB_ENDPOINT="grpcs://ydb.serverless.yandexcloud.net:2135"
export YDB_DATABASE="/ru-central1/b1gllfcopm13aodjgmkb/etnsnfn8f18mv9mjomar"

for f in sql/001_*.sql sql/002_*.sql sql/003_*.sql sql/004_*.sql sql/005_*.sql sql/seed_*.sql; do
  echo "=== applying $f ==="
  yc ydb sql --endpoint "$YDB_ENDPOINT" --database "$YDB_DATABASE" --file "$f"
done
```

Ожидаемо: шесть успешных выполнений без ошибок.

- [ ] **Step 8: Убедиться что всё создано**

```bash
yc ydb sql --endpoint "$YDB_ENDPOINT" --database "$YDB_DATABASE" \
  --script "SELECT COUNT(*) AS n FROM categories;"
```

Ожидаемо: `n: 8`.

- [ ] **Step 9: Commit**

```bash
git add sql/
git commit -m "feat(db): initial YDB schema (5 tables) + seed 8 categories"
```

---

## Task 9 — YDB client helper

**Files:**
- Create: `lib/ydb.ts`
- Modify: `package.json` (+ydb-sdk)

- [ ] **Step 1: Установить ydb-sdk**

```bash
npm install ydb-sdk@5
```

- [ ] **Step 2: Создать `lib/ydb.ts` (минимальный singleton driver)**

```ts
import { Driver, getCredentialsFromEnv } from "ydb-sdk";

let driverPromise: Promise<Driver> | null = null;

/**
 * Singleton YDB driver. Lazily initialized on first call.
 *
 * Credentials source:
 *   - В проде: контейнер получает service-account credentials автоматически
 *     через метаданные YC (getCredentialsFromEnv распознаёт)
 *   - Локально: `yc iam create-token` → экспортировать как YC_TOKEN
 */
export function getDriver(): Promise<Driver> {
  if (driverPromise) return driverPromise;

  const endpoint = process.env.YDB_ENDPOINT;
  const database = process.env.YDB_DATABASE;

  if (!endpoint || !database) {
    throw new Error("YDB_ENDPOINT and YDB_DATABASE env vars are required");
  }

  driverPromise = (async () => {
    const driver = new Driver({
      endpoint,
      database,
      authService: getCredentialsFromEnv(),
    });
    const ready = await driver.ready(10_000);
    if (!ready) throw new Error("YDB driver failed to initialize within 10s");
    return driver;
  })();

  return driverPromise;
}
```

**Референс:** в соседнем проекте `~/Documents/GdeGrant/` есть рабочие обращения к YDB через этот же `ydb-sdk@5`. При затруднениях — смотрите их `lib/ydb.ts` (или аналогичный) как образец.

- [ ] **Step 3: Убедиться что код собирается**

```bash
npm run build
```

Ожидаемо: build проходит. Если ругается на типы — исправьте перед коммитом.

- [ ] **Step 4: Commit**

```bash
git add lib/ydb.ts package.json package-lock.json
git commit -m "feat(db): YDB client helper"
```

---

## Task 10 — Admins whitelist (до NextAuth, иначе auth.ts импортирует несуществующий файл)

**Files:**
- Create: `lib/admins.ts`

- [ ] **Step 1: Создать `lib/admins.ts`**

```ts
import { TypedValues } from "ydb-sdk";
import { getDriver } from "./ydb";

/** Проверка — есть ли этот email в whitelist-таблице admins. */
export async function isAdminEmail(email: string): Promise<boolean> {
  try {
    const driver = await getDriver();
    const result = await driver.tableClient.withSession(async (session) => {
      const res = await session.executeQuery(
        `DECLARE $email AS Utf8;
         SELECT email FROM admins WHERE email = $email LIMIT 1;`,
        { $email: TypedValues.utf8(email) },
      );
      return res.resultSets[0]?.rows ?? [];
    });
    return result.length > 0;
  } catch (err) {
    console.error("isAdminEmail query failed:", err);
    return false;
  }
}
```

**Примечание для исполнителя:** точное API `executeQuery` и шейп `resultSets` может отличаться между минорными версиями `ydb-sdk@5`. Если TypeScript ругается — посмотрите пример в `~/Documents/GdeGrant/` (любой файл, делающий SELECT) и адаптируйте.

- [ ] **Step 2: Засидить вашего админа**

Замените `<ваш_yandex_id>` и `<ваш_email>` на реальные (yandex_id можно найти на https://id.yandex.ru/profile в URL; email — тот с которым вы логинитесь в Яндекс).

```bash
yc ydb sql --endpoint "$YDB_ENDPOINT" --database "$YDB_DATABASE" \
  --script "UPSERT INTO admins (yandex_id, email, role, created_at) VALUES (\"<ваш_yandex_id>\", \"<ваш_email>\", \"admin\", CurrentUtcTimestamp());"
```

Ожидаемо: `OK` без ошибок.

- [ ] **Step 3: Commit**

```bash
git add lib/admins.ts
git commit -m "feat(auth): admins whitelist check via YDB"
```

---

## Task 11 — NextAuth v5 setup

**Files:**
- Create: `lib/auth.ts`
- Create: `app/api/auth/[...nextauth]/route.ts`
- Modify: `package.json` (+ next-auth)

- [ ] **Step 1: Установить NextAuth v5**

```bash
npm install next-auth@beta
```

(`@beta` — это v5. На момент 2026-04-22 v5 может уже быть stable — проверьте `npm view next-auth version`, если `5.x.x` — используйте просто `next-auth`.)

- [ ] **Step 2: Создать `lib/auth.ts`**

```ts
import NextAuth from "next-auth";
import Yandex from "next-auth/providers/yandex";
import { isAdminEmail } from "./admins";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Yandex({
      clientId: process.env.YANDEX_CLIENT_ID,
      clientSecret: process.env.YANDEX_CLIENT_SECRET,
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      // Допускаем вход только если email в whitelist
      if (!user.email) return false;
      return await isAdminEmail(user.email);
    },
    async session({ session, token }) {
      // Прокидываем yandex_id (sub) в session
      if (token?.sub) {
        (session.user as { id?: string }).id = token.sub;
      }
      return session;
    },
  },
  pages: {
    signIn: "/admin/login",
  },
});
```

- [ ] **Step 3: Создать роут для NextAuth**

`app/api/auth/[...nextauth]/route.ts`:

```ts
import { handlers } from "@/lib/auth";

export const { GET, POST } = handlers;
```

- [ ] **Step 4: Commit**

```bash
git add lib/auth.ts app/api/auth/[...nextauth]/route.ts package.json package-lock.json
git commit -m "feat(auth): NextAuth v5 with Yandex provider"
```

---

## Task 12 — /admin route + middleware protection

**Files:**
- Create: `middleware.ts`
- Create: `app/admin/layout.tsx`
- Create: `app/admin/page.tsx`
- Create: `app/admin/login/page.tsx`

- [ ] **Step 1: Создать `middleware.ts` в корне (не в `app/`)**

```ts
import { auth } from "@/lib/auth";

export default auth((req) => {
  const isAdminPath = req.nextUrl.pathname.startsWith("/admin");
  const isLoginPath = req.nextUrl.pathname === "/admin/login";

  if (isAdminPath && !isLoginPath && !req.auth) {
    const url = new URL("/admin/login", req.url);
    return Response.redirect(url);
  }
});

export const config = {
  matcher: ["/admin/:path*"],
};
```

- [ ] **Step 2: Создать `app/admin/login/page.tsx`**

```tsx
import { signIn } from "@/lib/auth";

export default function LoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-bold mb-4">Вход в админку</h1>
        <form
          action={async () => {
            "use server";
            await signIn("yandex", { redirectTo: "/admin" });
          }}
        >
          <button
            type="submit"
            className="bg-emerald-700 text-white px-6 py-3 rounded-lg hover:bg-emerald-800 transition-colors"
          >
            Войти через Яндекс
          </button>
        </form>
        <p className="mt-4 text-sm text-gray-500">
          Доступ только для админов из whitelist
        </p>
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Создать `app/admin/layout.tsx`**

```tsx
import { auth, signOut } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) {
    redirect("/admin/login");
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="bg-gray-100 border-b border-gray-200 px-4 py-2 flex items-center justify-between">
        <div className="text-sm text-gray-700">
          Админка · {session.user.email}
        </div>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/" });
          }}
        >
          <button type="submit" className="text-sm text-gray-600 hover:text-gray-900">
            Выйти
          </button>
        </form>
      </div>
      {children}
    </div>
  );
}
```

- [ ] **Step 4: Создать `app/admin/page.tsx`**

```tsx
export default function AdminHome() {
  return (
    <main className="p-6">
      <h1 className="text-2xl font-bold mb-2">Админка RecycleMap</h1>
      <p className="text-gray-600">
        Вы залогинены. Дальнейшие функции появятся в Phase F (модерация) и Phase E (форма предложений).
      </p>
    </main>
  );
}
```

- [ ] **Step 5: Собрать локально чтобы убедиться что TypeScript доволен**

```bash
npm run build
```

Ожидаемо: `✓ Compiled successfully`.

- [ ] **Step 6: Commit**

```bash
git add middleware.ts app/admin/
git commit -m "feat(admin): /admin route with Yandex OAuth gate"
```

---

## Task 13 — Локальная проверка auth (опционально, но рекомендую)

**Files:**
- Create: `.env.local.example`
- ЛОКАЛЬНО создать `.env.local` (не коммитим)

- [ ] **Step 1: Создать `.env.local.example`**

```
# Скопируйте этот файл в .env.local и заполните значения для локальной разработки
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=<openssl rand -base64 32>
YANDEX_CLIENT_ID=<из oauth.yandex.ru>
YANDEX_CLIENT_SECRET=<из oauth.yandex.ru>
YDB_ENDPOINT=grpcs://ydb.serverless.yandexcloud.net:2135
YDB_DATABASE=/ru-central1/b1gllfcopm13aodjgmkb/etnsnfn8f18mv9mjomar
# Для локальной разработки YDB-кредов сойдёт yc CLI session
YC_TOKEN=$(yc iam create-token)
```

- [ ] **Step 2: Создать `.env.local` локально**

```bash
cp .env.local.example .env.local
# Отредактировать, вставить реальные значения
```

Убедитесь что `.env*` уже в `.gitignore` (уже есть строка `.env*` в стандартном Next.js gitignore).

- [ ] **Step 3: Запустить dev и проверить**

```bash
npm run dev
```

Откройте http://localhost:3000/admin — должно редиректнуть на `/admin/login`. Клик «Войти через Яндекс» → страница Яндекса → разрешаете → возвращает на `/admin`. Если ваш email в `admins` — видите приветствие. Если нет — ошибка 403.

- [ ] **Step 4: Commit только example**

```bash
git add .env.local.example
git commit -m "docs(auth): env example for local dev"
```

---

## Task 14 — Prod-деплой с auth + проверка

- [ ] **Step 1: Push**

```bash
git push
```

- [ ] **Step 2: Ждать зелёный деплой**

```bash
gh run watch
```

Ожидаемо: деплой ~3–5 мин, зелёный.

- [ ] **Step 3: Открыть прод URL в браузере**

`<NEXTAUTH_URL>` — главная страница работает как раньше (карта, 30 точек).

- [ ] **Step 4: Проверить prod-авторизацию**

Открыть `<NEXTAUTH_URL>/admin` → редирект на `/admin/login` → кнопка «Войти через Яндекс» → Яндекс-страница авторизации → возврат на `/admin` → приветствие.

Если **ошибка `redirect_uri_mismatch`** — значит забыли добавить prod Callback URI в настройках Yandex OAuth. Вернитесь к Task 6 Step 4.

- [ ] **Step 5: Если что-то не работает**

```bash
yc serverless container logs recyclemap-spb --tail 50
```

Не переходим к следующей задаче пока auth на проде не работает.

---

## Task 15 — Отключить Vercel

- [ ] **Step 1: Удалить проект в Vercel CLI**

```bash
vercel remove recyclemap-spb --yes
```

Ожидаемо: `Success! Removed project recyclemap-spb`.

Это удалит деплои и все домены. Репозиторий на GitHub и код остаются нетронутыми.

- [ ] **Step 2: Удалить `.vercel/` локально**

```bash
rm -rf .vercel/
```

- [ ] **Step 3: Обновить README (если там упоминается Vercel)**

```bash
grep -n "vercel" README.md 2>/dev/null || echo "no mentions"
```

Если упоминания есть — отредактировать и заменить на YC-URL.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore(infra): retire Vercel, YC is production"
git push
```

---

## Task 16 — Phase A checkpoint

- [ ] **Step 1: Пройти чек-лист**

- [ ] Сайт открывается по URL YC-контейнера, показывает карту как раньше
- [ ] HTTPS работает
- [ ] `/admin/login` показывает кнопку «Войти через Яндекс»
- [ ] Вход вашим Яндекс-аккаунтом успешен, видите «Админка · ваш_email»
- [ ] Выход через кнопку работает (редирект на `/`)
- [ ] Email не из whitelist блокируется (можно проверить с другого аккаунта — ошибка или бесконечный редирект)
- [ ] YDB-таблицы существуют (`yc ydb sql --script "SELECT COUNT(*) FROM categories;"` возвращает 8)
- [ ] `git push` на main автоматически деплоит через GitHub Actions
- [ ] Vercel удалён, `.vercel/` не существует

- [ ] **Step 2: Обновить дизайн-документ статусом Phase A**

В `docs/superpowers/specs/2026-04-22-recyclemap-spb-full-design.md` секция 7 — напротив Phase A добавить `✅ завершено`.

```bash
git add docs/
git commit -m "docs: Phase A marked complete"
git push
```

---

## Self-Review

**Покрытие спеки:**
- [x] Миграция с Vercel на YC (Task 4–7, 15)
- [x] Dockerfile и CI/CD (Task 4, 5)
- [x] YDB-схема (Task 8): все 5 таблиц + seed categories
- [x] NextAuth + Яндекс OAuth + whitelist (Task 10–11)
- [x] `/admin` защищённый роут (Task 12)
- [x] Service account с правами CR/Container/YDB/Invoker (Task 1)
- [x] Rate-limit на API — **отложено в Phase C**, будет там нужно когда появятся `/api/points` вызовы; сейчас API нет
- [x] Сам фронт остаётся без изменений — из JSON он всё ещё читает

**Плейсхолдеры:** Все `<ваш_yandex_id>`, `<ваш_email>`, `<URL>`, `<CLIENT_ID>` и пр. — это не TBD, а пользовательские подстановки с чёткой инструкцией откуда взять значение.

**Согласованность типов:** таблицы YDB (`categories`, `points`, `point_categories`, `submissions`, `admins`), поля типов совпадают со спекой. Имена env-переменных (`YDB_ENDPOINT`, `NEXTAUTH_URL`, `YANDEX_CLIENT_ID`) согласованы через Task 2, 5, 9, 13.

**Известные отступления от TDD-стандартов:**
- Phase A — инфра. Unit-тесты бессмысленны для Dockerfile или workflow. Валидация — ручные чек-листы после деплоя (Task 7, 14, 16).
- В Phase C (когда появится API) вернёмся к тестам.

---

## Реалистичные ожидания

- Task 1–2 (SA + OAuth) — 1–1.5 часа
- Task 3–6 (Docker + CI + создание контейнера) — 2–3 часа, первый раз небыстро
- Task 7 (первый деплой) — 15 мин если всё хорошо; 1–2 часа если что-то упало
- Task 8 (YDB-схема) — 30 мин
- Task 9–13 (auth и admin-роут) — 2–3 часа
- Task 14–16 (прод-проверка + отключение Vercel) — 30–45 мин

**Итого: 8–12 часов**. Укладываемся в оценку из дизайн-документа (10–15 ч).
