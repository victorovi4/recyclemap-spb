# Phase B — RSBor API Import Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Наполнить YDB ~4500 точками из публичного REST API recyclemap.ru через `POST /api/cron/import-rsbor`, запустить weekly-cron через YC Trigger, слать email-отчёты через Resend.

**Architecture:** Импортёр — HTTP-endpoint внутри основного Next.js-приложения, вызывается YC Trigger-ом по cron. Тонкий клиент `lib/rsbor-api.ts` дёргает 3 endpoint'а (`fractions`, `points list`, `points/{id}`) с rate-limit 5 req/sec и retry. Оркестратор в `lib/importers/rsbor.ts` фильтрует по СПб, маппит категории, upsert'ит в YDB с уважением к `manually_edited`.

**Tech Stack:** Next.js 16 (App Router), TypeScript, YDB (ydb-sdk), Resend, Vitest (новое — для юнит-тестов), YC Serverless Container + YC Trigger.

**Spec:** [docs/superpowers/specs/2026-04-22-phase-b-rsbor-import-design.md](../specs/2026-04-22-phase-b-rsbor-import-design.md)

**Existing YC resources (из Phase A):**
- Container: `recyclemap-spb` (id `bbaosmjuhscbpji6n847`), URL `https://bbaosmjuhscbpji6n847.containers.yandexcloud.net`
- Service Account: `recyclemap-sa` (id `ajehuicrfcm511prdpvh`)
- YDB: `recyclemap-spb` (id `etnsnfn8f18mv9mjomar`)
- GitHub Secrets: уже есть `YDB_ENDPOINT`, `YDB_DATABASE`, `YC_SA_JSON_CREDENTIALS`, и др.

**На выходе Phase B:**
- YDB.points содержит ~4500 строк `source='rsbor'`
- YDB.categories содержит 13 строк с цветами/иконками РС
- `public/icons/fractions/*.svg` (13 файлов)
- `POST /api/cron/import-rsbor` — рабочий endpoint с Bearer-auth
- YC Trigger `recyclemap-rsbor-import-weekly` создан
- Первый email-отчёт получен

---

## File structure (создаётся или изменяется)

```
recyclemap/
├── package.json                               # ИЗМЕНЕНО (+vitest, +resend, +scripts)
├── vitest.config.ts                           # НОВОЕ
├── .github/workflows/deploy.yml               # ИЗМЕНЕНО (timeout 60→900, +3 env)
├── sql/
│   ├── 006_migrate_categories_rsbor.sql       # НОВОЕ
│   └── 007_migrate_points_schedule.sql        # НОВОЕ
├── scripts/
│   └── fetch-rsbor-icons.sh                   # НОВОЕ
├── public/icons/fractions/                    # НОВОЕ (13 SVG)
├── lib/
│   ├── types.ts                               # ИЗМЕНЕНО (CategoryId +5 значений)
│   ├── rsbor/
│   │   ├── types.ts                           # НОВОЕ (TS-типы ответов RSBor API)
│   │   ├── api.ts                             # НОВОЕ (HTTP-клиент с retry/rate-limit)
│   │   ├── transform.ts                       # НОВОЕ (parseGeom, formatSchedule, filterSpb)
│   │   └── api.test.ts                        # НОВОЕ
│   ├── rsbor/transform.test.ts                # НОВОЕ
│   ├── importers/
│   │   ├── rsbor.ts                           # НОВОЕ (оркестратор)
│   │   └── rsbor.test.ts                      # НОВОЕ
│   ├── ydb-points.ts                          # НОВОЕ (repository upsert)
│   ├── ydb-points.test.ts                     # НОВОЕ
│   └── email.ts                               # НОВОЕ (Resend-клиент + HTML-шаблон)
├── app/api/cron/import-rsbor/
│   └── route.ts                               # НОВОЕ (POST handler, Bearer-auth)
├── CHANGELOG.md                               # ИЗМЕНЕНО (запись в [Unreleased])
```

---

## Task 1 — Setup Vitest + первый smoke-тест

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `lib/rsbor/transform.ts` (stub)
- Create: `lib/rsbor/transform.test.ts`

- [ ] **Step 1: Установить vitest**

```bash
npm install --save-dev vitest @vitest/ui
```

Ожидаемо: `package.json` получает `"vitest"` и `"@vitest/ui"` в `devDependencies`. Создаётся `node_modules/vitest/`.

- [ ] **Step 2: Добавить `test` скрипт в package.json**

В `package.json` → секция `scripts`:

```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "test": "vitest run",
  "test:watch": "vitest"
}
```

- [ ] **Step 3: Создать `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts", "app/**/*.test.ts"],
  },
});
```

- [ ] **Step 4: Написать failing smoke-тест**

Создать `lib/rsbor/transform.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseGeom } from "./transform";

describe("parseGeom", () => {
  it("extracts lng and lat from WKT POINT", () => {
    expect(parseGeom("POINT(30.420172 59.879528)")).toEqual({
      lng: 30.420172,
      lat: 59.879528,
    });
  });
});
```

- [ ] **Step 5: Создать пустой `lib/rsbor/transform.ts`**

```ts
export function parseGeom(_geom: string): { lng: number; lat: number } {
  throw new Error("not implemented");
}
```

- [ ] **Step 6: Запустить тест — ожидаем FAIL**

```bash
npm test -- lib/rsbor/transform.test.ts
```

Ожидаемо: `FAIL · parseGeom extracts lng and lat from WKT POINT`, сообщение `Error: not implemented`.

- [ ] **Step 7: Реализовать `parseGeom` минимально**

Заменить тело в `lib/rsbor/transform.ts`:

```ts
export function parseGeom(geom: string): { lng: number; lat: number } {
  const match = /^POINT\(([-\d.]+)\s+([-\d.]+)\)$/.exec(geom);
  if (!match) throw new Error(`Invalid geom format: ${geom}`);
  return { lng: Number(match[1]), lat: Number(match[2]) };
}
```

- [ ] **Step 8: Запустить тест — ожидаем PASS**

```bash
npm test -- lib/rsbor/transform.test.ts
```

Ожидаемо: `✓ parseGeom extracts lng and lat from WKT POINT`.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json vitest.config.ts lib/rsbor/
git commit -m "feat(phase-b): vitest setup + parseGeom helper"
```

---

## Task 2 — Расширение типа CategoryId до 13 значений

**Files:**
- Modify: `lib/types.ts`

- [ ] **Step 1: Расширить union-тип CategoryId**

Заменить в `lib/types.ts`:

```ts
export type CategoryId =
  | "plastic"
  | "glass"
  | "paper"
  | "metal"
  | "batteries"
  | "electronics"
  | "tetrapak"
  | "textile"
  | "lamps"
  | "caps"
  | "tires"
  | "hazardous"
  | "other";

export type Category = {
  id: CategoryId;
  label: string;
  color: string; // HEX
  icon: string; // emoji (fallback)
  iconPath?: string; // SVG-путь для рендера
  rsborId?: number; // для импорта
};

export type Point = {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  categories: CategoryId[];
  hours: string;
  phone: string;
  website: string;
  description: string;
  source: string;
};
```

- [ ] **Step 2: Проверить, что `npm run build` проходит**

```bash
npm run build
```

Ожидаемо: успешная сборка. Существующий `data/categories.json` и `data/points.json` всё ещё совместимы (их значения — подмножество нового union-а).

- [ ] **Step 3: Commit**

```bash
git add lib/types.ts
git commit -m "types: expand CategoryId to 13 RSBor fractions"
```

---

## Task 3 — Helpers в `lib/rsbor/transform.ts` (TDD)

**Files:**
- Modify: `lib/rsbor/transform.ts`
- Modify: `lib/rsbor/transform.test.ts`

### 3.1. `formatSchedule` — форматирование расписания в текст

- [ ] **Step 1: Добавить failing-тест `formatSchedule`**

Дописать в `lib/rsbor/transform.test.ts`:

```ts
import { formatSchedule, type RSBorScheduleDay } from "./transform";

describe("formatSchedule", () => {
  it("returns 'Не указано' for empty schedule", () => {
    expect(formatSchedule([])).toBe("Не указано");
  });

  it("formats single day", () => {
    const s: RSBorScheduleDay[] = [{ dow: 0, opens: ["10:00"], closes: ["19:00"] }];
    expect(formatSchedule(s)).toBe("Пн 10:00–19:00");
  });

  it("groups consecutive days with same hours", () => {
    const s: RSBorScheduleDay[] = [
      { dow: 0, opens: ["10:00"], closes: ["19:00"] },
      { dow: 1, opens: ["10:00"], closes: ["19:00"] },
      { dow: 2, opens: ["10:00"], closes: ["19:00"] },
      { dow: 3, opens: ["10:00"], closes: ["19:00"] },
      { dow: 4, opens: ["10:00"], closes: ["15:00"] },
    ];
    expect(formatSchedule(s)).toBe("Пн–Чт 10:00–19:00, Пт 10:00–15:00");
  });

  it("handles multiple intervals per day", () => {
    const s: RSBorScheduleDay[] = [
      { dow: 0, opens: ["10:00", "14:00"], closes: ["13:00", "19:00"] },
    ];
    expect(formatSchedule(s)).toBe("Пн 10:00–13:00, 14:00–19:00");
  });
});
```

- [ ] **Step 2: Запустить — ожидаем FAIL**

```bash
npm test -- lib/rsbor/transform.test.ts
```

Ожидаемо: тесты не компилируются (`formatSchedule` и `RSBorScheduleDay` не экспортированы).

- [ ] **Step 3: Реализовать `formatSchedule`**

Дописать в `lib/rsbor/transform.ts`:

```ts
export type RSBorScheduleDay = {
  dow: number; // 0=Пн, 1=Вт, ..., 6=Вс
  opens: string[];
  closes: string[];
};

const DOW_RU = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

function formatIntervals(opens: string[], closes: string[]): string {
  return opens.map((o, i) => `${o}–${closes[i] ?? "?"}`).join(", ");
}

export function formatSchedule(schedule: RSBorScheduleDay[]): string {
  if (schedule.length === 0) return "Не указано";

  const sorted = [...schedule].sort((a, b) => a.dow - b.dow);
  const groups: { start: number; end: number; intervals: string }[] = [];

  for (const day of sorted) {
    const intervals = formatIntervals(day.opens, day.closes);
    const last = groups[groups.length - 1];
    if (last && last.intervals === intervals && last.end === day.dow - 1) {
      last.end = day.dow;
    } else {
      groups.push({ start: day.dow, end: day.dow, intervals });
    }
  }

  return groups
    .map((g) => {
      const label = g.start === g.end
        ? DOW_RU[g.start]
        : `${DOW_RU[g.start]}–${DOW_RU[g.end]}`;
      return `${label} ${g.intervals}`;
    })
    .join(", ");
}
```

- [ ] **Step 4: Запустить — ожидаем PASS**

```bash
npm test -- lib/rsbor/transform.test.ts
```

Ожидаемо: все 5 тестов (`parseGeom` + 4× `formatSchedule`) зелёные.

### 3.2. `isSpbAddress` — фильтр по СПб

- [ ] **Step 5: Добавить failing-тест**

Дописать в `lib/rsbor/transform.test.ts`:

```ts
import { isSpbAddress } from "./transform";

describe("isSpbAddress", () => {
  it("matches canonical format", () => {
    expect(isSpbAddress("Россия, Санкт-Петербург, улица Швецова, 41")).toBe(true);
  });

  it("matches case-insensitive", () => {
    expect(isSpbAddress("санкт-петербург, невский, 1")).toBe(true);
  });

  it("rejects Leningrad oblast", () => {
    expect(isSpbAddress("Ленинградская область, Всеволожск, ул. Ленина")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isSpbAddress("")).toBe(false);
  });
});
```

- [ ] **Step 6: Запустить — FAIL**

```bash
npm test -- lib/rsbor/transform.test.ts
```

- [ ] **Step 7: Реализовать**

Дописать в `lib/rsbor/transform.ts`:

```ts
export function isSpbAddress(address: string | null | undefined): boolean {
  if (!address) return false;
  return address.toLowerCase().includes("санкт-петербург");
}

export function isSpbBbox(lat: number, lng: number): boolean {
  return lat >= 59.75 && lat <= 60.1 && lng >= 29.9 && lng <= 30.7;
}
```

- [ ] **Step 8: Запустить — PASS**

```bash
npm test -- lib/rsbor/transform.test.ts
```

Ожидаемо: все тесты зелёные.

- [ ] **Step 9: Commit**

```bash
git add lib/rsbor/transform.ts lib/rsbor/transform.test.ts
git commit -m "feat(phase-b): transform helpers (formatSchedule, isSpbAddress, isSpbBbox)"
```

---

## Task 4 — Типы RSBor API (`lib/rsbor/types.ts`)

**Files:**
- Create: `lib/rsbor/types.ts`

- [ ] **Step 1: Создать файл с TS-типами ответов API**

```ts
// Типы ответов публичного API recyclemap.ru.
// Источник: наблюдаемый формат JSON на 2026-04-22.

export type RSBorFraction = {
  id: number;
  name: string;
  type: string; // "RC"
  color: string; // HEX
  icon: string; // имя SVG-файла
};

export type RSBorScheduleDay = {
  dow: number;
  opens: string[];
  closes: string[];
};

export type RSBorOperator = {
  operatorId: number;
  title: string;
  address: string;
  phones: string[];
  emails: string[];
  sites: string[];
};

export type RSBorPhoto = {
  photo_id: number;
  order: number;
  path: string;
  thumb: string | null;
};

export type RSBorPointListItem = {
  geom: string; // "POINT(lng lat)"
  pointId: number;
  pointType: string;
  address: string;
  title: string;
  restricted: boolean;
  rating: { likes: number; dislikes: number; score: number };
  fractions: RSBorFraction[];
  businesHoursState: { state: string; nextStateTime: string; expired: boolean };
  numberOfComments: number;
};

export type RSBorPointDetails = RSBorPointListItem & {
  addressDescription: string;
  pointDescription: string;
  precise: boolean;
  scheduleDescription: string | null;
  photos: RSBorPhoto[];
  schedule: RSBorScheduleDay[];
  validDates: unknown[];
  operator: RSBorOperator | null;
  partner: unknown;
  lastUpdate: string; // "2025-08-05"
  moderators: unknown[];
  comments: unknown[];
};

export type RSBorApiResponse<T> =
  | { isSuccess: true; data: T }
  | { isSuccess: false; errors: { message: string; trace: string | null } };

export type RSBorPointsListResponse = {
  totalResults: number;
  points: RSBorPointListItem[];
};
```

- [ ] **Step 2: Commit**

```bash
git add lib/rsbor/types.ts
git commit -m "feat(phase-b): TypeScript types for RSBor public API"
```

---

## Task 5 — HTTP-клиент `lib/rsbor/api.ts` с retry и rate-limit

**Files:**
- Create: `lib/rsbor/api.ts`
- Create: `lib/rsbor/api.test.ts`

- [ ] **Step 1: Написать failing-тесты**

Создать `lib/rsbor/api.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchFractions, fetchPointsPage, fetchPointDetails } from "./api";

describe("RSBor API client", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetchFractions returns data array", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ isSuccess: true, data: [{ id: 1, name: "BUMAGA" }] }),
    });

    const result = await fetchFractions();
    expect(result).toEqual([{ id: 1, name: "BUMAGA" }]);
    expect(fetch).toHaveBeenCalledWith(
      "https://recyclemap.ru/api/public/fractions",
      expect.objectContaining({
        headers: expect.objectContaining({ "User-Agent": expect.stringContaining("RecycleMapSPb") }),
      }),
    );
  });

  it("fetchPointsPage passes bbox and size params", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ isSuccess: true, data: { totalResults: 0, points: [] } }),
    });

    await fetchPointsPage({ bbox: "29,59,31,60", page: 0, size: 100 });
    const calledUrl = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(calledUrl).toContain("bbox=29%2C59%2C31%2C60");
    expect(calledUrl).toContain("page=0");
    expect(calledUrl).toContain("size=100");
  });

  it("fetchPointDetails retries on 5xx", async () => {
    const m = fetch as unknown as ReturnType<typeof vi.fn>;
    m.mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({}) });
    m.mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({}) });
    m.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ isSuccess: true, data: { pointId: 3, title: "x" } }),
    });

    const result = await fetchPointDetails(3, { backoffMs: () => 0 });
    expect(result.pointId).toBe(3);
    expect(m).toHaveBeenCalledTimes(3);
  });

  it("fetchPointDetails throws after 3 failed attempts", async () => {
    const m = fetch as unknown as ReturnType<typeof vi.fn>;
    m.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });

    await expect(fetchPointDetails(3, { backoffMs: () => 0 })).rejects.toThrow(
      /500.*after 3 attempts/,
    );
    expect(m).toHaveBeenCalledTimes(3);
  });
});
```

- [ ] **Step 2: Запустить — FAIL (модуль не существует)**

```bash
npm test -- lib/rsbor/api.test.ts
```

- [ ] **Step 3: Реализовать клиент**

Создать `lib/rsbor/api.ts`:

```ts
import type {
  RSBorApiResponse,
  RSBorFraction,
  RSBorPointDetails,
  RSBorPointsListResponse,
} from "./types";

const BASE_URL = "https://recyclemap.ru/api/public";
const USER_AGENT = "RecycleMapSPb-Importer/1.0 (+https://github.com/victorovi4/recyclemap-spb)";
const DEFAULT_HEADERS: Record<string, string> = {
  "User-Agent": USER_AGENT,
  Accept: "application/json",
};

type RetryOpts = {
  maxAttempts?: number;
  backoffMs?: (attempt: number) => number;
};

const DEFAULT_RETRY: Required<RetryOpts> = {
  maxAttempts: 3,
  backoffMs: (attempt) => Math.pow(2, attempt) * 1000, // 1s, 2s, 4s
};

async function fetchJson<T>(url: string, retry: RetryOpts = {}): Promise<T> {
  const { maxAttempts, backoffMs } = { ...DEFAULT_RETRY, ...retry };
  let lastErr: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, backoffMs(attempt)));
    }
    try {
      const res = await fetch(url, { headers: DEFAULT_HEADERS });
      if (res.ok) {
        const body = (await res.json()) as RSBorApiResponse<T>;
        if (!body.isSuccess) {
          throw new Error(`API error: ${body.errors.message}`);
        }
        return body.data;
      }
      // 4xx — не ретраим кроме 429
      if (res.status >= 400 && res.status < 500 && res.status !== 429) {
        throw new Error(`HTTP ${res.status} (non-retryable)`);
      }
      lastErr = new Error(`HTTP ${res.status}`);
    } catch (err) {
      lastErr = err;
    }
  }

  throw new Error(`${lastErr instanceof Error ? lastErr.message : String(lastErr)} after ${maxAttempts} attempts`);
}

export function fetchFractions(retry?: RetryOpts): Promise<RSBorFraction[]> {
  return fetchJson<RSBorFraction[]>(`${BASE_URL}/fractions`, retry);
}

export function fetchPointsPage(
  params: { bbox: string; page: number; size: number },
  retry?: RetryOpts,
): Promise<RSBorPointsListResponse> {
  const qs = new URLSearchParams({
    bbox: params.bbox,
    page: String(params.page),
    size: String(params.size),
  });
  return fetchJson<RSBorPointsListResponse>(`${BASE_URL}/points?${qs}`, retry);
}

export function fetchPointDetails(
  pointId: number,
  retry?: RetryOpts,
): Promise<RSBorPointDetails> {
  return fetchJson<RSBorPointDetails>(`${BASE_URL}/points/${pointId}`, retry);
}
```

- [ ] **Step 4: Запустить — PASS**

```bash
npm test -- lib/rsbor/api.test.ts
```

Ожидаемо: все 4 теста зелёные.

- [ ] **Step 5: Commit**

```bash
git add lib/rsbor/api.ts lib/rsbor/api.test.ts
git commit -m "feat(phase-b): RSBor API HTTP client with retry"
```

---

## Task 6 — SQL миграция: расширение `categories`

**Files:**
- Create: `sql/006_migrate_categories_rsbor.sql`

- [ ] **Step 1: Создать файл миграции**

```sql
-- Phase B — расширение categories под таксономию РС (13 категорий).
-- Применяется однократно. ALTER TABLE ADD COLUMN идемпотентен в YDB только если
-- колонки нет; повторный запуск упадёт — это нормально.

ALTER TABLE categories ADD COLUMN rsbor_id Int32;
ALTER TABLE categories ADD COLUMN icon_path Utf8;

UPDATE categories SET rsbor_id = 1,  color = "#4085F3", icon_path = "/icons/fractions/paper.svg"      WHERE id = "paper";
UPDATE categories SET rsbor_id = 2,  color = "#ED671C", icon_path = "/icons/fractions/plastic.svg"    WHERE id = "plastic";
UPDATE categories SET rsbor_id = 3,  color = "#227440", icon_path = "/icons/fractions/glass.svg"      WHERE id = "glass";
UPDATE categories SET rsbor_id = 4,  color = "#E83623", icon_path = "/icons/fractions/metall.svg"     WHERE id = "metal";
UPDATE categories SET rsbor_id = 5,  color = "#2CC0A5", icon_path = "/icons/fractions/tetrapack.svg"  WHERE id = "tetrapak";
UPDATE categories SET rsbor_id = 6,  color = "#EA4C99", icon_path = "/icons/fractions/clothes.svg"    WHERE id = "textile";
UPDATE categories SET rsbor_id = 9,  color = "#C06563", icon_path = "/icons/fractions/appliances.svg" WHERE id = "electronics";
UPDATE categories SET rsbor_id = 10, color = "#C8744E", icon_path = "/icons/fractions/battery.svg"    WHERE id = "batteries";

UPSERT INTO categories (id, label, color, icon, icon_path, rsbor_id, sort_order) VALUES
    ("lamps",     "Лампочки",       "#8F6EEF", "💡", "/icons/fractions/lightbulbs.svg", 7,  9),
    ("caps",      "Крышечки",       "#DAA219", "🎩", "/icons/fractions/caps.svg",        8,  10),
    ("tires",     "Шины",           "#6F4D41", "🛞", "/icons/fractions/tires.svg",       11, 11),
    ("hazardous", "Опасные отходы", "#242627", "☣️", "/icons/fractions/dangerous.svg",   12, 12),
    ("other",     "Прочее",         "#3EB8DE", "♻️", "/icons/fractions/other.svg",       13, 13);
```

- [ ] **Step 2: Commit (миграция пока НЕ применяется — это ручной шаг Task 15)**

```bash
git add sql/006_migrate_categories_rsbor.sql
git commit -m "sql: migration 006 — RSBor categories (+5 new, colors, icons)"
```

---

## Task 7 — SQL миграция: добавить `schedule_json` в `points`

**Files:**
- Create: `sql/007_migrate_points_schedule.sql`

- [ ] **Step 1: Создать файл миграции**

```sql
-- Phase B — добавляем колонку schedule_json для сырой структуры расписания от РС.
-- Поле hours Utf8? остаётся (туда пишем отформатированный текст).

ALTER TABLE points ADD COLUMN schedule_json Json;
```

- [ ] **Step 2: Commit**

```bash
git add sql/007_migrate_points_schedule.sql
git commit -m "sql: migration 007 — add points.schedule_json"
```

---

## Task 8 — YDB repository для points (upsert логика)

**Files:**
- Create: `lib/ydb-points.ts`
- Create: `lib/ydb-points.test.ts`

Импортёр пишет в YDB через этот модуль. YDB-операции мокаем на уровне драйвера.

- [ ] **Step 1: Написать failing-тесты**

Создать `lib/ydb-points.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { pointsEqual, type PointRow } from "./ydb-points";

describe("pointsEqual", () => {
  const base: PointRow = {
    id: "rsbor-3",
    name: "Пункт приёма",
    address: "Санкт-Петербург, Варфоломеевская, 18Д",
    lat: 59.88,
    lng: 30.42,
    description: "Металл",
    hours: "Пн–Вс 10:00–19:00",
    schedule_json: '[{"dow":0,"opens":["10:00"],"closes":["19:00"]}]',
    phone: "88123208340",
    website: "https://metall-lom.ru",
    photo_url: "258_20161004.jpg",
    status: "active",
    source: "rsbor",
    source_id: "3",
    categoryIds: ["metal"],
  };

  it("equal when all fields match", () => {
    expect(pointsEqual(base, { ...base })).toBe(true);
  });

  it("not equal when name differs", () => {
    expect(pointsEqual(base, { ...base, name: "Другое" })).toBe(false);
  });

  it("not equal when categoryIds differ", () => {
    expect(pointsEqual(base, { ...base, categoryIds: ["metal", "paper"] })).toBe(false);
  });

  it("equal regardless of categoryIds order", () => {
    const a = { ...base, categoryIds: ["metal", "paper"] };
    const b = { ...base, categoryIds: ["paper", "metal"] };
    expect(pointsEqual(a, b)).toBe(true);
  });
});
```

- [ ] **Step 2: Запустить — FAIL**

```bash
npm test -- lib/ydb-points.test.ts
```

- [ ] **Step 3: Создать `lib/ydb-points.ts` с типом и `pointsEqual`**

```ts
import type { CategoryId } from "./types";
import { getDriver, TypedValues } from "./ydb";

export type PointRow = {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  description: string | null;
  hours: string | null;
  schedule_json: string | null;
  phone: string | null;
  website: string | null;
  photo_url: string | null;
  status: string;
  source: string;
  source_id: string | null;
  categoryIds: CategoryId[];
};

export type ExistingPoint = {
  id: string;
  manually_edited: boolean;
  data: PointRow;
};

export function pointsEqual(a: PointRow, b: PointRow): boolean {
  const scalarEqual =
    a.name === b.name &&
    a.address === b.address &&
    a.lat === b.lat &&
    a.lng === b.lng &&
    a.description === b.description &&
    a.hours === b.hours &&
    a.schedule_json === b.schedule_json &&
    a.phone === b.phone &&
    a.website === b.website &&
    a.photo_url === b.photo_url &&
    a.status === b.status;
  if (!scalarEqual) return false;

  const aCats = [...a.categoryIds].sort().join(",");
  const bCats = [...b.categoryIds].sort().join(",");
  return aCats === bCats;
}
```

- [ ] **Step 4: Запустить — PASS**

```bash
npm test -- lib/ydb-points.test.ts
```

- [ ] **Step 5: Добавить функции работы с YDB**

Дописать в `lib/ydb-points.ts`:

```ts
import type { Ydb } from "ydb-sdk";

// Найти по (source, source_id). Возвращает null если не найдена.
export async function findBySource(
  source: string,
  sourceId: string,
): Promise<ExistingPoint | null> {
  const driver = await getDriver();
  const result = await driver.tableClient.withSession(async (session) => {
    const query = `
      DECLARE $source AS Utf8;
      DECLARE $source_id AS Utf8;
      SELECT p.id, p.name, p.address, p.lat, p.lng, p.description, p.hours,
             p.schedule_json, p.phone, p.website, p.photo_url, p.status,
             p.source, p.source_id, p.manually_edited,
             (SELECT AGG_LIST(category_id) FROM point_categories WHERE point_id = p.id) AS cats
      FROM points AS p
      WHERE p.source = $source AND p.source_id = $source_id;
    `;
    return session.executeQuery(query, {
      $source: TypedValues.utf8(source),
      $source_id: TypedValues.utf8(sourceId),
    });
  });

  const rows = result.resultSets[0]?.rows ?? [];
  if (rows.length === 0) return null;

  const r = rows[0].items as unknown as RawRow[];
  const data: PointRow = {
    id: r[0].textValue!,
    name: r[1].textValue!,
    address: r[2].textValue!,
    lat: r[3].doubleValue!,
    lng: r[4].doubleValue!,
    description: r[5].textValue ?? null,
    hours: r[6].textValue ?? null,
    schedule_json: r[7].textValue ?? null,
    phone: r[8].textValue ?? null,
    website: r[9].textValue ?? null,
    photo_url: r[10].textValue ?? null,
    status: r[11].textValue!,
    source: r[12].textValue!,
    source_id: r[13].textValue ?? null,
    categoryIds: (r[15].items?.map((i) => i.textValue!) ?? []) as CategoryId[],
  };

  return {
    id: data.id,
    manually_edited: r[14].boolValue ?? false,
    data,
  };
}

type RawRow = {
  textValue?: string;
  doubleValue?: number;
  boolValue?: boolean;
  int32Value?: number;
  items?: RawRow[];
};

export async function insertPoint(row: PointRow): Promise<void> {
  const driver = await getDriver();
  await driver.tableClient.withSession(async (session) => {
    const query = `
      DECLARE $id AS Utf8; DECLARE $name AS Utf8; DECLARE $address AS Utf8;
      DECLARE $lat AS Double; DECLARE $lng AS Double;
      DECLARE $hours AS Utf8?; DECLARE $phone AS Utf8?; DECLARE $website AS Utf8?;
      DECLARE $description AS Utf8?; DECLARE $schedule_json AS Json?;
      DECLARE $status AS Utf8; DECLARE $source AS Utf8; DECLARE $source_id AS Utf8?;
      DECLARE $photo_url AS Utf8?; DECLARE $ts AS Timestamp;
      UPSERT INTO points
        (id, name, address, lat, lng, hours, phone, website, description,
         schedule_json, status, source, source_id, photo_url,
         manually_edited, created_at, updated_at)
      VALUES
        ($id, $name, $address, $lat, $lng, $hours, $phone, $website, $description,
         $schedule_json, $status, $source, $source_id, $photo_url,
         false, $ts, $ts);
    `;
    await session.executeQuery(query, {
      $id: TypedValues.utf8(row.id),
      $name: TypedValues.utf8(row.name),
      $address: TypedValues.utf8(row.address),
      $lat: TypedValues.double(row.lat),
      $lng: TypedValues.double(row.lng),
      $hours: TypedValues.optional(TypedValues.utf8(row.hours ?? "")),
      $phone: TypedValues.optional(TypedValues.utf8(row.phone ?? "")),
      $website: TypedValues.optional(TypedValues.utf8(row.website ?? "")),
      $description: TypedValues.optional(TypedValues.utf8(row.description ?? "")),
      $schedule_json: TypedValues.optional(TypedValues.json(row.schedule_json ?? "null")),
      $status: TypedValues.utf8(row.status),
      $source: TypedValues.utf8(row.source),
      $source_id: TypedValues.optional(TypedValues.utf8(row.source_id ?? "")),
      $photo_url: TypedValues.optional(TypedValues.utf8(row.photo_url ?? "")),
      $ts: TypedValues.timestamp(new Date()),
    });
  });
  await replacePointCategories(row.id, row.categoryIds);
}

export async function updatePoint(row: PointRow): Promise<void> {
  const driver = await getDriver();
  await driver.tableClient.withSession(async (session) => {
    const query = `
      DECLARE $id AS Utf8; DECLARE $name AS Utf8; DECLARE $address AS Utf8;
      DECLARE $lat AS Double; DECLARE $lng AS Double;
      DECLARE $hours AS Utf8?; DECLARE $phone AS Utf8?; DECLARE $website AS Utf8?;
      DECLARE $description AS Utf8?; DECLARE $schedule_json AS Json?;
      DECLARE $photo_url AS Utf8?; DECLARE $ts AS Timestamp;
      UPDATE points SET
        name = $name, address = $address, lat = $lat, lng = $lng,
        hours = $hours, phone = $phone, website = $website, description = $description,
        schedule_json = $schedule_json, photo_url = $photo_url, updated_at = $ts
      WHERE id = $id;
    `;
    await session.executeQuery(query, {
      $id: TypedValues.utf8(row.id),
      $name: TypedValues.utf8(row.name),
      $address: TypedValues.utf8(row.address),
      $lat: TypedValues.double(row.lat),
      $lng: TypedValues.double(row.lng),
      $hours: TypedValues.optional(TypedValues.utf8(row.hours ?? "")),
      $phone: TypedValues.optional(TypedValues.utf8(row.phone ?? "")),
      $website: TypedValues.optional(TypedValues.utf8(row.website ?? "")),
      $description: TypedValues.optional(TypedValues.utf8(row.description ?? "")),
      $schedule_json: TypedValues.optional(TypedValues.json(row.schedule_json ?? "null")),
      $photo_url: TypedValues.optional(TypedValues.utf8(row.photo_url ?? "")),
      $ts: TypedValues.timestamp(new Date()),
    });
  });
  await replacePointCategories(row.id, row.categoryIds);
}

async function replacePointCategories(pointId: string, categoryIds: string[]): Promise<void> {
  const driver = await getDriver();
  await driver.tableClient.withSession(async (session) => {
    await session.executeQuery(
      `DECLARE $pid AS Utf8; DELETE FROM point_categories WHERE point_id = $pid;`,
      { $pid: TypedValues.utf8(pointId) },
    );
    for (const cid of categoryIds) {
      await session.executeQuery(
        `DECLARE $pid AS Utf8; DECLARE $cid AS Utf8;
         UPSERT INTO point_categories (point_id, category_id) VALUES ($pid, $cid);`,
        { $pid: TypedValues.utf8(pointId), $cid: TypedValues.utf8(cid) },
      );
    }
  });
}

export async function fetchRsborIdMap(): Promise<Map<number, CategoryId>> {
  const driver = await getDriver();
  const result = await driver.tableClient.withSession(async (session) =>
    session.executeQuery(`SELECT id, rsbor_id FROM categories WHERE rsbor_id IS NOT NULL;`),
  );
  const map = new Map<number, CategoryId>();
  for (const row of result.resultSets[0]?.rows ?? []) {
    const items = row.items as unknown as RawRow[];
    map.set(items[1].int32Value!, items[0].textValue! as CategoryId);
  }
  return map;
}
```

**Примечание по API YDB SDK v5:** точный shape `items`, `textValue`, `doubleValue`, `int32Value`, `boolValue` зависит от версии. Если при ручной проверке (Task 16) обнаружится рассинхрон — правим по реальному shape (SDK возвращает `IValue`-объекты). Это планируем как возможный фикс на шаге Task 16.

- [ ] **Step 6: Запустить все тесты — PASS (добавили только pure-функцию, остальное — обёртки)**

```bash
npm test
```

- [ ] **Step 7: Commit**

```bash
git add lib/ydb-points.ts lib/ydb-points.test.ts
git commit -m "feat(phase-b): YDB points repository (upsert + category sync)"
```

---

## Task 9 — Email-клиент `lib/email.ts`

**Files:**
- Modify: `package.json` (добавить `resend`)
- Create: `lib/email.ts`
- Create: `lib/email.test.ts`

- [ ] **Step 1: Установить Resend SDK**

```bash
npm install resend
```

- [ ] **Step 2: Написать failing-тест (только HTML-рендер, не реальную отправку)**

Создать `lib/email.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { renderReportHtml, type ImportStats } from "./email";

const baseStats: ImportStats = {
  started_at: "2026-04-26T03:00:00.000Z",
  duration_ms: 872_000,
  created: 12,
  updated: 47,
  skipped_manual: 3,
  unchanged: 4428,
  errors: [
    { pointId: 4521, reason: "HTTP 500 after 3 attempts" },
    { pointId: 5113, reason: "Invalid JSON in details" },
  ],
};

describe("renderReportHtml", () => {
  it("contains all stat values", () => {
    const html = renderReportHtml(baseStats);
    expect(html).toContain("12"); // created
    expect(html).toContain("47"); // updated
    expect(html).toContain("4428"); // unchanged
    expect(html).toContain("pointId 4521");
  });

  it("formats duration as minutes/seconds", () => {
    const html = renderReportHtml(baseStats);
    expect(html).toMatch(/14 мин\s+32 сек/);
  });

  it("shows '✓ Без ошибок' when errors empty", () => {
    const html = renderReportHtml({ ...baseStats, errors: [] });
    expect(html).toContain("Без ошибок");
  });
});
```

- [ ] **Step 3: Запустить — FAIL**

```bash
npm test -- lib/email.test.ts
```

- [ ] **Step 4: Реализовать `lib/email.ts`**

```ts
import { Resend } from "resend";

export type ImportStats = {
  started_at: string; // ISO
  duration_ms: number;
  created: number;
  updated: number;
  skipped_manual: number;
  unchanged: number;
  errors: { pointId: number; reason: string }[];
};

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const FROM = "RecycleMap <onboarding@resend.dev>";
const ADMIN_URL = "https://bbaosmjuhscbpji6n847.containers.yandexcloud.net/admin";

function formatDuration(ms: number): string {
  const sec = Math.floor(ms / 1000);
  return `${Math.floor(sec / 60)} мин ${sec % 60} сек`;
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&quot;",
  );
}

export function renderReportHtml(stats: ImportStats): string {
  const errorsBlock =
    stats.errors.length === 0
      ? `<p style="color:#2e7d32;">✓ Без ошибок</p>`
      : `<ul>${stats.errors
          .map((e) => `<li>pointId ${e.pointId} — ${esc(e.reason)}</li>`)
          .join("")}</ul>`;

  return `<!doctype html>
<html lang="ru"><body style="font-family:system-ui,sans-serif;max-width:640px;margin:auto;">
<h2>RecycleMap — еженедельный импорт</h2>
<p>${new Date(stats.started_at).toLocaleString("ru-RU")}<br>
Длительность: ${formatDuration(stats.duration_ms)}</p>
<table style="border-collapse:collapse;">
<tr><td>Новых точек:</td><td><b>${stats.created}</b></td></tr>
<tr><td>Обновлено:</td><td><b>${stats.updated}</b></td></tr>
<tr><td>Пропущено (ручные):</td><td><b>${stats.skipped_manual}</b></td></tr>
<tr><td>Без изменений:</td><td>${stats.unchanged}</td></tr>
<tr><td>Ошибки:</td><td><b>${stats.errors.length}</b></td></tr>
</table>
<h3>Ошибки</h3>
${errorsBlock}
<p><a href="${ADMIN_URL}/points" style="display:inline-block;padding:8px 16px;background:#2e7d32;color:#fff;text-decoration:none;border-radius:4px;">Открыть админку</a></p>
</body></html>`;
}

export async function sendImportReport(stats: ImportStats): Promise<void> {
  if (!resend) {
    console.warn("RESEND_API_KEY not set — skipping email");
    return;
  }
  const to = (process.env.IMPORT_REPORT_TO ?? "").split(",").filter(Boolean);
  if (to.length === 0) {
    console.warn("IMPORT_REPORT_TO not set — skipping email");
    return;
  }
  await resend.emails.send({
    from: FROM,
    to,
    subject: `RecycleMap импорт: +${stats.created} новых, ${stats.updated} изменений`,
    html: renderReportHtml(stats),
  });
}

export async function sendImportFailure(error: Error): Promise<void> {
  if (!resend) return;
  const to = (process.env.IMPORT_REPORT_TO ?? "").split(",").filter(Boolean);
  if (to.length === 0) return;
  await resend.emails.send({
    from: FROM,
    to,
    subject: "❌ RecycleMap импорт упал",
    html: `<pre style="background:#fee;padding:16px;">${esc(error.stack ?? error.message)}</pre>`,
  });
}
```

- [ ] **Step 5: Запустить — PASS**

```bash
npm test
```

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json lib/email.ts lib/email.test.ts
git commit -m "feat(phase-b): Resend email client + HTML report template"
```

---

## Task 10 — Import-оркестратор `lib/importers/rsbor.ts`

**Files:**
- Create: `lib/importers/rsbor.ts`
- Create: `lib/importers/rsbor.test.ts`

- [ ] **Step 1: Написать тесты для чистых функций**

Создать `lib/importers/rsbor.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { transformDetailsToPoint } from "./rsbor";
import type { RSBorPointDetails } from "../rsbor/types";

const detailsFixture: RSBorPointDetails = {
  geom: "POINT(30.420172 59.879528)",
  pointId: 3,
  pointType: "RC",
  address: "Россия, Санкт-Петербург, Варфоломеевская улица, 18Д",
  addressDescription: "",
  pointDescription: "Любой металл",
  precise: true,
  restricted: false,
  title: "Пункт приёма",
  scheduleDescription: null,
  fractions: [{ id: 4, name: "METALL", type: "RC", color: "#E83623", icon: "metall.svg" }],
  photos: [{ photo_id: 4, order: 1, path: "258_123.jpg", thumb: null }],
  rating: { likes: 0, dislikes: 0, score: 0 },
  businesHoursState: { state: "open", nextStateTime: "", expired: false },
  numberOfComments: 0,
  schedule: [{ dow: 0, opens: ["10:00"], closes: ["19:00"] }],
  validDates: [],
  operator: {
    operatorId: 3,
    title: "Метал-проект",
    address: "Варфоломеевская ул., 18",
    phones: ["88123208340", "89219609111"],
    emails: [],
    sites: ["https://metall-lom.ru"],
  },
  partner: null,
  lastUpdate: "2025-08-05",
  moderators: [],
  comments: [],
};

describe("transformDetailsToPoint", () => {
  const rsborMap = new Map([[4, "metal" as const]]);

  it("maps basic fields", () => {
    const p = transformDetailsToPoint(detailsFixture, rsborMap);
    expect(p.id).toBe("rsbor-3");
    expect(p.name).toBe("Пункт приёма");
    expect(p.address).toBe("Россия, Санкт-Петербург, Варфоломеевская улица, 18Д");
    expect(p.lat).toBeCloseTo(59.879528);
    expect(p.lng).toBeCloseTo(30.420172);
    expect(p.description).toBe("Любой металл");
  });

  it("picks first phone and website from operator", () => {
    const p = transformDetailsToPoint(detailsFixture, rsborMap);
    expect(p.phone).toBe("88123208340");
    expect(p.website).toBe("https://metall-lom.ru");
  });

  it("formats schedule and stores raw JSON", () => {
    const p = transformDetailsToPoint(detailsFixture, rsborMap);
    expect(p.hours).toBe("Пн 10:00–19:00");
    expect(p.schedule_json).toContain('"dow":0');
  });

  it("maps fraction.id to our category id", () => {
    const p = transformDetailsToPoint(detailsFixture, rsborMap);
    expect(p.categoryIds).toEqual(["metal"]);
  });

  it("handles null operator", () => {
    const p = transformDetailsToPoint({ ...detailsFixture, operator: null }, rsborMap);
    expect(p.phone).toBeNull();
    expect(p.website).toBeNull();
  });

  it("handles empty photos", () => {
    const p = transformDetailsToPoint({ ...detailsFixture, photos: [] }, rsborMap);
    expect(p.photo_url).toBeNull();
  });

  it("skips unknown fraction ids with warning", () => {
    const p = transformDetailsToPoint(
      { ...detailsFixture, fractions: [{ id: 999, name: "UNKNOWN", type: "RC", color: "#000", icon: "x.svg" }] },
      rsborMap,
    );
    expect(p.categoryIds).toEqual([]);
  });
});
```

- [ ] **Step 2: Запустить — FAIL**

```bash
npm test -- lib/importers/rsbor.test.ts
```

- [ ] **Step 3: Создать `lib/importers/rsbor.ts`**

```ts
import { fetchFractions, fetchPointsPage, fetchPointDetails } from "../rsbor/api";
import type { RSBorPointDetails } from "../rsbor/types";
import { formatSchedule, isSpbAddress, isSpbBbox, parseGeom } from "../rsbor/transform";
import type { CategoryId } from "../types";
import {
  fetchRsborIdMap,
  findBySource,
  insertPoint,
  pointsEqual,
  updatePoint,
  type PointRow,
} from "../ydb-points";
import { sendImportFailure, sendImportReport, type ImportStats } from "../email";

const BBOX_SPB = "29.0,59.5,31.0,60.3";
const PAGE_SIZE = 100;
const DETAIL_THROTTLE_MS = 200; // 5 req/sec

export function transformDetailsToPoint(
  d: RSBorPointDetails,
  rsborIdMap: Map<number, CategoryId>,
): PointRow {
  const { lat, lng } = parseGeom(d.geom);
  const categoryIds: CategoryId[] = [];
  for (const f of d.fractions) {
    const ours = rsborIdMap.get(f.id);
    if (ours) categoryIds.push(ours);
    else console.warn(`[import] unknown fraction id=${f.id} (${f.name}) on point ${d.pointId}`);
  }

  return {
    id: `rsbor-${d.pointId}`,
    name: d.title || "Пункт приёма",
    address: d.address,
    lat,
    lng,
    description: d.pointDescription || null,
    hours: formatSchedule(d.schedule),
    schedule_json: JSON.stringify(d.schedule),
    phone: d.operator?.phones[0] ?? null,
    website: d.operator?.sites[0] ?? null,
    photo_url: d.photos[0]?.path ?? null,
    status: "active",
    source: "rsbor",
    source_id: String(d.pointId),
    categoryIds,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function runImport(): Promise<ImportStats> {
  const startedAt = Date.now();
  const stats: ImportStats = {
    started_at: new Date(startedAt).toISOString(),
    duration_ms: 0,
    created: 0,
    updated: 0,
    skipped_manual: 0,
    unchanged: 0,
    errors: [],
  };

  try {
    console.log("[import] fetching fractions and categories map…");
    const [fractions, rsborIdMap] = await Promise.all([fetchFractions(), fetchRsborIdMap()]);
    console.log(`[import] fractions=${fractions.length}, categories mapped=${rsborIdMap.size}`);

    console.log("[import] paginating points list…");
    const allItems: { pointId: number; address: string; lat: number; lng: number }[] = [];
    for (let page = 0; ; page++) {
      const res = await fetchPointsPage({ bbox: BBOX_SPB, page, size: PAGE_SIZE });
      if (res.points.length === 0) break;
      for (const p of res.points) {
        const { lat, lng } = parseGeom(p.geom);
        allItems.push({ pointId: p.pointId, address: p.address, lat, lng });
      }
      console.log(`[import]   page=${page} cumulative=${allItems.length}`);
    }
    console.log(`[import] total list=${allItems.length}`);

    const spbItems = allItems.filter(
      (p) => isSpbAddress(p.address) || (p.address === "" && isSpbBbox(p.lat, p.lng)),
    );
    console.log(`[import] after SPb filter=${spbItems.length}`);

    for (let i = 0; i < spbItems.length; i++) {
      const { pointId } = spbItems[i];
      if (i > 0) await sleep(DETAIL_THROTTLE_MS);
      try {
        const details = await fetchPointDetails(pointId);
        const row = transformDetailsToPoint(details, rsborIdMap);
        const existing = await findBySource(row.source, row.source_id ?? "");

        if (!existing) {
          await insertPoint(row);
          stats.created++;
        } else if (existing.manually_edited) {
          stats.skipped_manual++;
        } else if (pointsEqual(row, existing.data)) {
          stats.unchanged++;
        } else {
          await updatePoint(row);
          stats.updated++;
        }

        if ((i + 1) % 100 === 0) {
          console.log(
            `[import] progress ${i + 1}/${spbItems.length} (created=${stats.created}, updated=${stats.updated}, unchanged=${stats.unchanged})`,
          );
        }
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        console.error(`[import] pointId=${pointId} failed: ${reason}`);
        stats.errors.push({ pointId, reason });
      }
    }

    stats.duration_ms = Date.now() - startedAt;
    console.log(`[import] done in ${stats.duration_ms}ms`, stats);

    await sendImportReport(stats);
    return stats;
  } catch (err) {
    stats.duration_ms = Date.now() - startedAt;
    const e = err instanceof Error ? err : new Error(String(err));
    console.error(`[import] FATAL`, e);
    await sendImportFailure(e);
    throw e;
  }
}
```

- [ ] **Step 4: Запустить — PASS**

```bash
npm test
```

Ожидаемо: `transformDetailsToPoint` тесты зелёные; остальные задачи тоже.

- [ ] **Step 5: Commit**

```bash
git add lib/importers/
git commit -m "feat(phase-b): RSBor import orchestrator"
```

---

## Task 11 — HTTP endpoint `/api/cron/import-rsbor`

**Files:**
- Create: `app/api/cron/import-rsbor/route.ts`

- [ ] **Step 1: Создать route handler**

```ts
import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { runImport } from "@/lib/importers/rsbor";

// Max duration 15 minutes (Vercel-совместимый синтаксис; YC Container почитает
// revision-execution-timeout из deploy.yml, см. Task 12).
export const maxDuration = 900;
export const dynamic = "force-dynamic";

function authOk(req: Request): boolean {
  const expected = process.env.IMPORT_SECRET;
  if (!expected) return false;
  const header = req.headers.get("authorization") ?? "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
  const a = Buffer.from(bearer);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  if (!authOk(req)) {
    return new NextResponse(null, { status: 401 });
  }

  try {
    const stats = await runImport();
    return NextResponse.json({ ok: true, stats });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET() {
  // Disallow GET to prevent accidental triggers through browser / link preview.
  return new NextResponse(null, { status: 405 });
}
```

- [ ] **Step 2: Проверить, что `npm run build` проходит**

```bash
npm run build
```

Ожидаемо: успешная сборка, в логе видно новый route `/api/cron/import-rsbor`.

- [ ] **Step 3: Commit**

```bash
git add app/api/cron/import-rsbor/route.ts
git commit -m "feat(phase-b): POST /api/cron/import-rsbor endpoint with Bearer auth"
```

---

## Task 12 — Обновление `deploy.yml` (timeout 900s + новые env)

**Files:**
- Modify: `.github/workflows/deploy.yml`

- [ ] **Step 1: Увеличить `revision-execution-timeout` и добавить env**

Заменить строку `revision-execution-timeout: 60s` и секцию `revision-env` в `.github/workflows/deploy.yml`:

```yaml
          revision-execution-timeout: 900s
          public: true
          revision-env: |
            AUTH_SECRET=${{ secrets.NEXTAUTH_SECRET }}
            AUTH_URL=${{ secrets.NEXTAUTH_URL }}
            AUTH_TRUST_HOST=true
            AUTH_YANDEX_ID=${{ secrets.YANDEX_CLIENT_ID }}
            AUTH_YANDEX_SECRET=${{ secrets.YANDEX_CLIENT_SECRET }}
            YANDEX_CLIENT_ID=${{ secrets.YANDEX_CLIENT_ID }}
            YANDEX_CLIENT_SECRET=${{ secrets.YANDEX_CLIENT_SECRET }}
            YDB_ENDPOINT=${{ secrets.YDB_ENDPOINT }}
            YDB_DATABASE=${{ secrets.YDB_DATABASE }}
            YC_SERVICE_ACCOUNT_ID=${{ secrets.YC_SERVICE_ACCOUNT_ID }}
            IMPORT_SECRET=${{ secrets.IMPORT_SECRET }}
            RESEND_API_KEY=${{ secrets.RESEND_API_KEY }}
            IMPORT_REPORT_TO=${{ secrets.IMPORT_REPORT_TO }}
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/deploy.yml
git commit -m "ci: extend container timeout to 900s, add import/resend env vars"
```

---

## Task 13 — Скрипт скачивания SVG-иконок РС

**Files:**
- Create: `scripts/fetch-rsbor-icons.sh`

- [ ] **Step 1: Разведать точный CDN-путь иконок РС**

В браузере открыть `https://recyclemap.ru/`, открыть DevTools → Network → фильтр по `.svg`. Обновить страницу. Найти запросы вида `https://recyclemap.ru/assets/.../<something>.svg`. Записать точный префикс.

**Ожидаемые имена файлов** (из `/api/public/fractions`): `paper, plastic, glass, metall, tetrapack, clothes, lightbulbs, caps, appliances, battery, tires, dangerous, other` — всего 13.

- [ ] **Step 2: Создать скрипт (подставить найденный префикс)**

```bash
#!/usr/bin/env bash
set -euo pipefail

# Base URL уточнить по шагу 1 (предполагаемо /assets/images/fractions/).
BASE_URL="https://recyclemap.ru/assets/images/fractions"
DEST="public/icons/fractions"
mkdir -p "$DEST"

ICONS=(paper plastic glass metall tetrapack clothes lightbulbs caps appliances battery tires dangerous other)

for f in "${ICONS[@]}"; do
  echo "→ $f.svg"
  curl -sfL "${BASE_URL}/${f}.svg" -o "${DEST}/${f}.svg"
done

echo "✓ Downloaded $(ls "$DEST" | wc -l) SVG icons into $DEST/"
```

- [ ] **Step 3: Сделать исполняемым и запустить**

```bash
chmod +x scripts/fetch-rsbor-icons.sh
bash scripts/fetch-rsbor-icons.sh
```

Ожидаемо: 13 SVG-файлов в `public/icons/fractions/`. Если скрипт падает с 404 — найденный на Step 1 BASE_URL неверный, скорректировать.

**Fallback, если CDN-путь не удаётся найти:** открыть их Angular-бандл `main.*.js`, искать `fraction`-токены, зачастую там видно относительный путь типа `"assets/fractions/${name}.svg"` — подставить в скрипт.

- [ ] **Step 4: Проверить, что SVG валидны**

```bash
file public/icons/fractions/*.svg | head -3
```

Ожидаемо: `SVG Scalable Vector Graphics image`.

- [ ] **Step 5: Commit**

```bash
git add scripts/fetch-rsbor-icons.sh public/icons/fractions/
git commit -m "assets(phase-b): 13 RSBor category icons + fetch script"
```

---

## Task 14 — GitHub Secrets + Resend регистрация (ручные шаги)

**Files:** (нет — операционный шаг)

- [ ] **Step 1: Зарегистрироваться в Resend**

1. Открыть https://resend.com/signup
2. Войти через Google (`victorovi4@gmail.com`) или email
3. Пропустить onboarding (domain setup) — пока шлём с sandbox
4. В левой панели → **API Keys** → **Create API Key** → имя `recyclemap-import`, permission **Sending access**
5. **Скопировать ключ** (начинается с `re_`). Ключ показывается ровно один раз — если потеряешь, создавай новый.

- [ ] **Step 2: Сгенерировать IMPORT_SECRET**

```bash
openssl rand -hex 32
```

Скопировать вывод — это будет `IMPORT_SECRET`.

- [ ] **Step 3: Положить секреты в GitHub**

В корне репозитория:

```bash
gh secret set RESEND_API_KEY --body "re_...<your-key>..."
gh secret set IMPORT_SECRET --body "<hex-из-openssl>"
gh secret set IMPORT_REPORT_TO --body "victorovi4@gmail.com"
```

- [ ] **Step 4: Проверить, что все 3 секрета появились**

```bash
gh secret list
```

Ожидаемо: видишь `RESEND_API_KEY`, `IMPORT_SECRET`, `IMPORT_REPORT_TO` плюс существующие из Phase A.

- [ ] **Step 5: Сохранить IMPORT_SECRET в безопасное место**

`gh secret set` не отдаёт значение обратно — нам пригодится сам `IMPORT_SECRET` на Task 16 для `curl`. Сохранить в пароль-менеджер или временно в локальный файл (`echo "IMPORT_SECRET=<hex>" >> ~/.recyclemap.secret && chmod 600 ~/.recyclemap.secret`, потом удалить).

---

## Task 15 — Применить YDB-миграции (ручной шаг)

**Files:** (нет — выполнение существующих SQL)

- [ ] **Step 1: Запушить в main и дождаться деплоя**

```bash
git push origin main
```

Смотреть `.github/actions` → деплой должен пройти за ~3–5 минут. Важно, чтобы перед ручным прогоном контейнер был с новой версией (c endpoint `/api/cron/import-rsbor` и новыми env).

- [ ] **Step 2: Применить миграцию 006 (categories)**

```bash
GRPC_DNS_RESOLVER=native ydb --profile recyclemap-spb yql --file sql/006_migrate_categories_rsbor.sql
```

Ожидаемо: без ошибок. Проверить:

```bash
GRPC_DNS_RESOLVER=native ydb --profile recyclemap-spb yql -s 'SELECT COUNT(*) FROM categories;'
```

Ожидаемо: `13`.

- [ ] **Step 3: Применить миграцию 007 (schedule_json)**

```bash
GRPC_DNS_RESOLVER=native ydb --profile recyclemap-spb yql --file sql/007_migrate_points_schedule.sql
```

Ожидаемо: без ошибок. Проверить:

```bash
GRPC_DNS_RESOLVER=native ydb --profile recyclemap-spb yql -s 'DESCRIBE points;' | grep schedule_json
```

Ожидаемо: `schedule_json Json`.

---

## Task 16 — Первый ручной прогон импорта

**Files:** (нет — выполнение endpoint)

- [ ] **Step 1: Убедиться, что контейнер переразвернулся с новыми env**

```bash
yc serverless container revision list --container-name recyclemap-spb --format yaml | head -20
```

Ожидаемо: последняя revision — сегодня, `execution_timeout: 900s`, в `environment` виден `IMPORT_SECRET`.

- [ ] **Step 2: Прогнать импорт через curl (ждём ~15 минут)**

```bash
IMPORT_SECRET="<из Task 14 step 5>"
URL="https://bbaosmjuhscbpji6n847.containers.yandexcloud.net"

time curl -X POST "$URL/api/cron/import-rsbor" \
  -H "Authorization: Bearer $IMPORT_SECRET" \
  -H "Content-Type: application/json" \
  --max-time 1000 \
  -w "\nHTTP %{http_code}\n"
```

Ожидаемо: HTTP 200, JSON со статистикой:
```json
{"ok":true,"stats":{"created":~4500,"updated":0,"skipped_manual":0,"unchanged":0,"errors":[]}}
```

**Если видишь `401`** — не совпал Bearer. Сравни `IMPORT_SECRET` локально с тем, что в GitHub Secrets → env контейнера.

**Если видишь `500`** — читай `yc serverless container logs --container-name recyclemap-spb --follow` в соседнем терминале.

**Если YDB-ошибка про `int32Value`/`textValue`** — в `lib/ydb-points.ts` shape `IValue` ридеров не совпадает с SDK v5. Открой одну реальную строку через `driver.tableClient.withSession(s => s.executeQuery("SELECT * FROM categories LIMIT 1"))` в временном скрипте, подстрой `RawRow` под факт, и пушь.

- [ ] **Step 3: Проверить YDB**

```bash
GRPC_DNS_RESOLVER=native ydb --profile recyclemap-spb yql -s \
  "SELECT COUNT(*) FROM points WHERE source='rsbor';"
```

Ожидаемо: ~4000–4800 (точное число варьируется).

```bash
GRPC_DNS_RESOLVER=native ydb --profile recyclemap-spb yql -s \
  "SELECT id, name, address, hours, phone FROM points WHERE source='rsbor' LIMIT 10;"
```

Глазами проверить: адреса содержат «Санкт-Петербург», `hours` распарсен разумно.

```bash
GRPC_DNS_RESOLVER=native ydb --profile recyclemap-spb yql -s \
  "SELECT category_id, COUNT(*) FROM point_categories GROUP BY category_id ORDER BY category_id;"
```

Ожидаемо: 13 строк, топ — `plastic`, `batteries`, `paper` (тысячи каждая).

- [ ] **Step 4: Проверить email**

Открыть почту `victorovi4@gmail.com` (проверить Spam тоже). Ожидаемо: письмо `RecycleMap импорт: +4500 новых, 0 изменений`.

- [ ] **Step 5: Повторный прогон — проверка идемпотентности**

```bash
time curl -X POST "$URL/api/cron/import-rsbor" \
  -H "Authorization: Bearer $IMPORT_SECRET" --max-time 1000
```

Ожидаемо: `{"created":0,"updated":0,"unchanged":~4500,"errors":[]}`. Это подтверждает, что импорт идемпотентен.

- [ ] **Step 6 (если что-то пошло не так): откат**

```bash
GRPC_DNS_RESOLVER=native ydb --profile recyclemap-spb yql -s \
  "DELETE FROM point_categories WHERE point_id IN (SELECT id FROM points WHERE source='rsbor');
   DELETE FROM points WHERE source='rsbor';"
```

Потом чинить код, пушить, повторять Step 2.

---

## Task 17 — Создание YC Trigger для еженедельного cron

**Files:** (нет — YC CLI команда)

- [ ] **Step 1: Создать Trigger**

```bash
yc serverless trigger create timer \
  --name recyclemap-rsbor-import-weekly \
  --cron-expression "0 0 3 ? * SUN *" \
  --invoke-container-id bbaosmjuhscbpji6n847 \
  --invoke-container-path "/api/cron/import-rsbor" \
  --invoke-container-service-account-id ajehuicrfcm511prdpvh \
  --retry-attempts 0
```

Ожидаемо: вывод YAML с `id: <trigger-id>`, `rule.timer.cron_expression: "0 0 3 ? * SUN *"`.

**Проблема:** Trigger не умеет напрямую пробрасывать `Authorization` header в HTTP-вызов контейнера на 2026-04. Workaround ниже.

- [ ] **Step 2: Проверить, прокидывает ли Trigger Authorization header**

Если документация YC указывает флаг `--invoke-container-header "Authorization=Bearer $IMPORT_SECRET"` или аналог — использовать его. Если нет — см. Step 3 workaround.

- [ ] **Step 3: Workaround — вторичный эндпоинт с IAM-валидацией**

Если Trigger не умеет Authorization header, то endpoint должен принимать YC IAM-token из заголовка `X-Yc-Iam-Token` (его Trigger подставляет автоматически). В `app/api/cron/import-rsbor/route.ts` добавить параллельный auth-путь:

```ts
function authOk(req: Request): boolean {
  // Path 1: Bearer secret (для ручного curl)
  const expected = process.env.IMPORT_SECRET;
  const header = req.headers.get("authorization") ?? "";
  if (expected && header.startsWith("Bearer ")) {
    const a = Buffer.from(header.slice(7));
    const b = Buffer.from(expected);
    if (a.length === b.length && timingSafeEqual(a, b)) return true;
  }
  // Path 2: YC IAM token от Trigger-а (наличие заголовка + SA-id совпадает)
  const iamToken = req.headers.get("x-yc-iam-token");
  const triggerSa = req.headers.get("x-yc-service-account-id");
  if (iamToken && triggerSa === process.env.YC_SERVICE_ACCOUNT_ID) {
    return true;
  }
  return false;
}
```

(Обернуть в отдельный коммит `fix(import): accept YC Trigger IAM token as auth`.)

- [ ] **Step 4: Проверить Trigger в действии — форсированный запуск**

```bash
# YC Trigger нельзя «форсировать», но можно понизить cron на 5 минут вперёд
# для тестового запуска. В этом варианте — просто ждём ближайшего воскресенья
# 03:00 МСК либо временно меняем расписание:
yc serverless trigger update timer recyclemap-rsbor-import-weekly \
  --cron-expression "$(date -u -v+5M '+%M %H %d %m * *')"
```

Через 5 минут проверить `yc serverless container logs --container-name recyclemap-spb --since 10m`. Ожидаемо: видны `[import] fetching fractions…` и дальше прогресс.

После проверки — **вернуть расписание**:

```bash
yc serverless trigger update timer recyclemap-rsbor-import-weekly \
  --cron-expression "0 0 3 ? * SUN *"
```

---

## Task 18 — Обновить CHANGELOG.md и закрыть фазу

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Переместить запись из `[Unreleased]` в `[0.2.0-phase-b]`**

Заменить в `CHANGELOG.md` после строки `## [Unreleased] — следующая фаза`:

```markdown
## [Unreleased] — следующая фаза

_Phase C: Фронт — с JSON на API + Яндекс Карты._

---

## [0.2.0-phase-b] — 2026-04-22 — Data import pipeline

**Итог фазы:** YDB заполнена ~4500 точками из публичного API recyclemap.ru,
еженедельный автоимпорт через YC Trigger с email-отчётами работает. Справочник
категорий расширен с 8 до 13 под таксономию «Раздельного Сбора», визуал — их
цвета и SVG-иконки.

### Added

- **REST-клиент API recyclemap** (`lib/rsbor/api.ts`) с rate-limit 5 req/sec и 3 retry.
- **Import-оркестратор** (`lib/importers/rsbor.ts`) — пагинация, фильтр СПб по адресу/bbox, upsert в YDB, уважение к `manually_edited`.
- **Endpoint** `POST /api/cron/import-rsbor` с Bearer-auth (IMPORT_SECRET) и 900-сек таймаутом.
- **Resend-интеграция** (`lib/email.ts`) — HTML-отчёт после импорта + алёрт при падении.
- **YC Trigger** `recyclemap-rsbor-import-weekly` — воскресенье 03:00 МСК.
- **5 новых категорий**: `lamps`, `caps`, `tires`, `hazardous`, `other`.
- **Иконки РС** в `public/icons/fractions/` (13 SVG).
- **Vitest** — юнит-тесты transform/api/email (29 тестов).
- **SQL-миграции** 006 (categories) и 007 (points.schedule_json).

### Changed

- `CategoryId` расширен с 8 до 13 значений.
- `categories` — добавлены колонки `rsbor_id Int32` и `icon_path Utf8`; цвета переписаны на палитру РС.
- `points` — добавлена колонка `schedule_json Json`.
- `deploy.yml` — `revision-execution-timeout: 60s → 900s`, добавлены env `IMPORT_SECRET`, `RESEND_API_KEY`, `IMPORT_REPORT_TO`.

### Gotchas и уроки

1. **rsbor.ru и recyclemap.ru — один и тот же проект** (НКО «Раздельный Сбор»). У их Angular-карты есть открытый JSON API `/api/public/*`, найденный в бандле `main.*.js`. Скрейпинг HTML не нужен.
2. **API отдаёт 10 точек за страницу дефолтно, но принимает `?size=100`** — пагинация ~45 запросов вместо 450.
3. **bbox в query-string — `lng,lat,lng,lat`** (не `lat,lng,...`). Источник ошибки на 40 минут разведки.
4. **YC Container default timeout 60s** — для 15-минутного импорта надо `revision-execution-timeout: 900s`.
5. **YC Trigger → container не умеет Authorization header** (на 2026-04). Workaround: endpoint принимает и Bearer (для ручного curl), и IAM-token в `X-Yc-Iam-Token` (Trigger подставляет автоматически).

### Ключевые коммиты

(заполняется при закрытии фазы)
```

- [ ] **Step 2: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs: Phase B → v0.2.0 changelog entry"
git push origin main
```

---

## Self-review checklist (автоматический на этом плане)

Делается один раз по окончании всех задач:

- [ ] `npm test` — все тесты зелёные (≥ 25 тестов)
- [ ] `npm run build` — сборка проходит без ошибок и warnings по новым файлам
- [ ] `git log --oneline` показывает ~17 коммитов с осмысленными сообщениями
- [ ] Ручной прогон (Task 16) завершился без ошибок, YDB содержит ~4500 точек
- [ ] Email-отчёт пришёл
- [ ] YC Trigger создан и в Step 4 Task 17 проверен в действии (опционально, можно ждать воскресенья)
- [ ] CHANGELOG.md отражает все изменения
- [ ] Спецификация `docs/superpowers/specs/2026-04-22-phase-b-rsbor-import-design.md` не противоречит реализации (если обнаруживаем расхождение — правим спек задним числом комментарием «реализация отклонилась потому что X»)

---

## Ожидаемое время выполнения

| Блок | Тасков | Часов |
|---|---|---|
| Setup + transform helpers (1–3) | 3 | 1.0 |
| API-клиент + types (4–5) | 2 | 1.5 |
| SQL-миграции (6–7) | 2 | 0.3 |
| YDB-repository (8) | 1 | 2.0 |
| Email (9) | 1 | 0.8 |
| Оркестратор + route (10–11) | 2 | 1.5 |
| CI + иконки (12–13) | 2 | 0.8 |
| Ручные шаги (14–17) | 4 | 2.0 |
| CHANGELOG (18) | 1 | 0.2 |
| Debug-запас | — | 1.9 |
| **Итого** | **18** | **~12** |

---

**План готов. Что дальше:**

**1. Subagent-Driven Execution (рекомендовано)** — дисптачим по одному сабагенту на задачу, между задачами делаем ревью, быстрая итерация.

**2. Inline Execution** — выполняем задачи в текущей сессии через `executing-plans`, батчами с чекпоинтами.

**Какой подход?**
