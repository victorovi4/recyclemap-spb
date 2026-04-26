# Phase C — Frontend reads from YDB Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Переключить публичный фронт с `data/points.json` (30 mock-точек) на чтение из YDB через React Server Components, расширить фильтр до 13 категорий, перейти на маркер-«бусы» с кластеризацией. Движок карты остаётся Leaflet+OSM.

**Architecture:** `app/page.tsx` становится async Server Component, читает YDB напрямую (`fetchAllPoints`, `fetchAllCategories`), отдаёт props в новый клиентский компонент `HomeClient` с фильтр-стейтом. Маркер `L.divIcon` рисует HTML-«бусы» (max 5 + хвост `+N`); `react-leaflet-cluster` группирует близкие. 30 mock-точек мигрируют в YDB как `source='manual'` с дедупликацией по координатам ≤150м.

**Tech Stack:** Next.js 16 (App Router, RSC) · TypeScript · Tailwind v4 · YDB (через `ydb-sdk` + `lib/ydb.ts` singleton) · `react-leaflet@5` + `leaflet@1.9` · `react-leaflet-cluster` (новая зависимость) · vitest для юнитов.

**Spec:** [docs/superpowers/specs/2026-04-26-phase-c-frontend-api-design.md](../specs/2026-04-26-phase-c-frontend-api-design.md)

---

## File Structure

**Создаются:**
- `components/HomeClient.tsx` — клиентская обёртка с фильтр-стейтом
- `components/beadMarker.ts` — pure helper, генерация HTML маркера
- `components/beadMarker.test.ts` — юнит на helper
- `lib/categories.ts` — `fetchAllCategories()`
- `lib/categories.test.ts` — юнит
- `lib/ydb-points.fetchAll.test.ts` — юнит для `fetchAllPoints()`
- `scripts/migrate-legacy-points.ts` — одноразовая миграция
- `scripts/migrate-legacy-points.test.ts` — юнит на `findDuplicateByRadius`

**Меняются:**
- `app/page.tsx` — Server Component, читает YDB
- `app/globals.css` — CSS для `.bead-marker`
- `lib/types.ts` — добавляются `PublicPoint`, `PublicCategory`
- `lib/ydb-points.ts` — добавляется `fetchAllPoints()`
- `components/Map.tsx` — типы props
- `components/MapInner.tsx` — bead-маркер, обёртка `MarkerClusterGroup`
- `components/FilterPanel.tsx` — типы props
- `components/PointPopup.tsx` — поля `PublicPoint`, фото, иконки
- `package.json` — новые зависимости
- `docs/superpowers/specs/2026-04-22-recyclemap-spb-full-design.md` — отметка о смене карты на Leaflet
- `CHANGELOG.md` — запись о Phase C

**Удаляются (Task 12, после успеха на проде):**
- `data/points.json`
- `data/categories.json`
- `lib/data.ts`
- старые `Point`, `Category` из `lib/types.ts`

---

## Task 1: Добавить типы `PublicPoint` и `PublicCategory`

Новые типы добавляем рядом со старыми `Point`/`Category`, чтобы компиляция оставалась зелёной до конца Task 9. Старые удалим в Task 12.

**Files:**
- Modify: `lib/types.ts`

- [ ] **Step 1: Добавить типы в `lib/types.ts`**

В конец файла добавить:

```ts
export type PublicCategory = {
  id: CategoryId;
  label: string;
  color: string;          // HEX
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
  categoryIds: CategoryId[]; // в порядке вставки в YDB; сортировка по sortOrder — на стороне рендера
  hours: string | null;
  phone: string | null;
  website: string | null;
  description: string | null;
  photoUrl: string | null;
};
```

- [ ] **Step 2: Проверить компиляцию**

Run: `npx tsc --noEmit`
Expected: без ошибок (новые типы пока никем не используются).

- [ ] **Step 3: Запустить существующие тесты**

Run: `npm test`
Expected: все 39 предыдущих тестов из Phase B зелёные.

- [ ] **Step 4: Commit**

```bash
git add lib/types.ts
git commit -m "feat(phase-c): add PublicPoint and PublicCategory types"
```

---

## Task 2: `fetchAllPoints()` в `lib/ydb-points.ts` + юнит

Возвращает все точки из YDB с массивом `categoryIds` для каждой. Используем 2 отдельных SELECT и склеиваем в JS — `AGG_LIST` в subquery ломает YQL (см. Phase B fix `lib/ydb-points.ts:findBySource`). Соберу `photoUrl` с префиксом RSBor CDN.

**Files:**
- Modify: `lib/ydb-points.ts`
- Test: `lib/ydb-points.fetchAll.test.ts`

- [ ] **Step 1: Написать failing-тест `lib/ydb-points.fetchAll.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Мокаем getDriver — мы тестируем чистую сборку из YDB-rows в PublicPoint[].
const executeQuery = vi.fn();
vi.mock("./ydb", () => ({
  getDriver: async () => ({
    tableClient: {
      withSession: async (cb: (s: unknown) => Promise<unknown>) =>
        cb({ executeQuery }),
    },
  }),
  TypedValues: {},
}));

import { fetchAllPoints } from "./ydb-points";

beforeEach(() => {
  executeQuery.mockReset();
});

describe("fetchAllPoints", () => {
  it("сводит points + point_categories в PublicPoint[] и формирует photoUrl", async () => {
    // Первый вызов — points; второй — point_categories.
    executeQuery
      .mockResolvedValueOnce({
        resultSets: [
          {
            rows: [
              {
                items: [
                  { textValue: "rsbor-1" },                    // id
                  { textValue: "Экоцентр" },                   // name
                  { textValue: "СПб, ул. Тестовая, 1" },       // address
                  { doubleValue: 59.94 },                      // lat
                  { doubleValue: 30.31 },                      // lng
                  { textValue: "Описание" },                   // description
                  { textValue: "Пн-Пт 10-19" },                // hours
                  { textValue: null },                         // phone
                  { textValue: "https://example.org" },        // website
                  { textValue: "258_20161004-124814_1.jpg" },  // photo_url
                ],
              },
              {
                items: [
                  { textValue: "manual-x" },
                  { textValue: "Локальная" },
                  { textValue: "СПб, ул. Местная, 2" },
                  { doubleValue: 59.95 },
                  { doubleValue: 30.32 },
                  { textValue: null },
                  { textValue: null },
                  { textValue: null },
                  { textValue: null },
                  { textValue: null },
                ],
              },
            ],
          },
        ],
      })
      .mockResolvedValueOnce({
        resultSets: [
          {
            rows: [
              { items: [{ textValue: "rsbor-1" }, { textValue: "paper" }] },
              { items: [{ textValue: "rsbor-1" }, { textValue: "plastic" }] },
              { items: [{ textValue: "manual-x" }, { textValue: "glass" }] },
            ],
          },
        ],
      });

    const result = await fetchAllPoints();

    expect(result).toHaveLength(2);

    const rsbor = result.find((p) => p.id === "rsbor-1")!;
    expect(rsbor.name).toBe("Экоцентр");
    expect(rsbor.lat).toBe(59.94);
    expect(rsbor.categoryIds.sort()).toEqual(["paper", "plastic"]);
    expect(rsbor.photoUrl).toBe("https://recyclemap.ru/images/258_20161004-124814_1.jpg");
    expect(rsbor.phone).toBeNull();

    const manual = result.find((p) => p.id === "manual-x")!;
    expect(manual.categoryIds).toEqual(["glass"]);
    expect(manual.photoUrl).toBeNull();
  });

  it("возвращает пустой массив, если в points нет строк", async () => {
    executeQuery
      .mockResolvedValueOnce({ resultSets: [{ rows: [] }] })
      .mockResolvedValueOnce({ resultSets: [{ rows: [] }] });
    expect(await fetchAllPoints()).toEqual([]);
  });
});
```

- [ ] **Step 2: Убедиться что тест падает**

Run: `npx vitest run lib/ydb-points.fetchAll.test.ts`
Expected: FAIL — `fetchAllPoints is not a function`.

- [ ] **Step 3: Реализовать `fetchAllPoints` в `lib/ydb-points.ts`**

В конец файла (после `fetchRsborIdMap`) добавить:

```ts
import type { PublicPoint } from "./types";

const RSBOR_PHOTO_PREFIX = "https://recyclemap.ru/images/";

export async function fetchAllPoints(): Promise<PublicPoint[]> {
  const driver = await getDriver();

  // Два отдельных запроса, потому что AGG_LIST в correlated subquery ломает
  // YQL-парсер ("missing '::' at 'AGG_LIST'") — см. Phase B/findBySource.
  const pointsResult = await driver.tableClient.withSession(async (session) => {
    const query = `
      SELECT id, name, address, lat, lng, description, hours,
             phone, website, photo_url
      FROM points;
    `;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (session as any).executeQuery(query, {});
  });

  const catsResult = await driver.tableClient.withSession(async (session) => {
    const query = `SELECT point_id, category_id FROM point_categories;`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (session as any).executeQuery(query, {});
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pointRows = (pointsResult as any).resultSets[0]?.rows ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const catRows = (catsResult as any).resultSets[0]?.rows ?? [];

  const catsByPoint = new Map<string, CategoryId[]>();
  for (const r of catRows) {
    const pid = r.items[0].textValue as string;
    const cid = r.items[1].textValue as CategoryId;
    const list = catsByPoint.get(pid);
    if (list) list.push(cid);
    else catsByPoint.set(pid, [cid]);
  }

  const points: PublicPoint[] = [];
  for (const r of pointRows) {
    const items = r.items;
    const id = items[0].textValue as string;
    const photoRaw: string | null = items[9]?.textValue ?? null;
    points.push({
      id,
      name: items[1].textValue ?? "",
      address: items[2].textValue ?? "",
      lat: items[3].doubleValue ?? 0,
      lng: items[4].doubleValue ?? 0,
      description: items[5]?.textValue ?? null,
      hours: items[6]?.textValue ?? null,
      phone: items[7]?.textValue ?? null,
      website: items[8]?.textValue ?? null,
      photoUrl: photoRaw ? `${RSBOR_PHOTO_PREFIX}${photoRaw}` : null,
      categoryIds: catsByPoint.get(id) ?? [],
    });
  }

  return points;
}
```

- [ ] **Step 4: Запустить тест — должен пройти**

Run: `npx vitest run lib/ydb-points.fetchAll.test.ts`
Expected: PASS, оба кейса.

- [ ] **Step 5: Проверить весь vitest и tsc**

Run: `npm test && npx tsc --noEmit`
Expected: все тесты зелёные, типы согласованы.

- [ ] **Step 6: Commit**

```bash
git add lib/ydb-points.ts lib/ydb-points.fetchAll.test.ts
git commit -m "feat(phase-c): fetchAllPoints reads YDB into PublicPoint[]"
```

---

## Task 3: `fetchAllCategories()` в новом `lib/categories.ts` + юнит

Используется существующий паттерн из `lib/admin-stats.ts:getCategoriesWithCounts`, но без point-counts.

**Files:**
- Create: `lib/categories.ts`
- Test: `lib/categories.test.ts`

- [ ] **Step 1: Написать failing-тест `lib/categories.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const executeQuery = vi.fn();
vi.mock("./ydb", () => ({
  getDriver: async () => ({
    tableClient: {
      withSession: async (cb: (s: unknown) => Promise<unknown>) =>
        cb({ executeQuery }),
    },
  }),
}));

import { fetchAllCategories } from "./categories";

beforeEach(() => executeQuery.mockReset());

describe("fetchAllCategories", () => {
  it("преобразует YDB-rows в PublicCategory[], сохраняет порядок sort_order", async () => {
    executeQuery.mockResolvedValueOnce({
      resultSets: [
        {
          rows: [
            {
              items: [
                { textValue: "paper" },
                { textValue: "Бумага и картон" },
                { textValue: "#4085F3" },
                { textValue: "📄" },
                { textValue: "/icons/fractions/paper.svg" },
                { int32Value: 1 },
              ],
            },
            {
              items: [
                { textValue: "plastic" },
                { textValue: "Пластик" },
                { textValue: "#ED671C" },
                { textValue: "🧴" },
                { textValue: null },
                { int32Value: 2 },
              ],
            },
          ],
        },
      ],
    });

    const result = await fetchAllCategories();

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      id: "paper",
      label: "Бумага и картон",
      color: "#4085F3",
      emoji: "📄",
      iconPath: "/icons/fractions/paper.svg",
      sortOrder: 1,
    });
    expect(result[1].iconPath).toBeNull();
  });
});
```

- [ ] **Step 2: Запустить тест — должен упасть**

Run: `npx vitest run lib/categories.test.ts`
Expected: FAIL — module `./categories` не существует.

- [ ] **Step 3: Реализовать `lib/categories.ts`**

```ts
import type { CategoryId } from "./types";
import type { PublicCategory } from "./types";
import { getDriver } from "./ydb";

export async function fetchAllCategories(): Promise<PublicCategory[]> {
  const driver = await getDriver();
  const result = await driver.tableClient.withSession(async (session) => {
    const query = `
      SELECT id, label, color, icon, icon_path, sort_order
      FROM categories
      ORDER BY sort_order;
    `;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (session as any).executeQuery(query, {});
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (result as any).resultSets[0]?.rows ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return rows.map((r: any) => ({
    id: r.items[0].textValue as CategoryId,
    label: r.items[1].textValue as string,
    color: r.items[2].textValue as string,
    emoji: r.items[3].textValue as string,
    iconPath: (r.items[4]?.textValue as string | null) ?? null,
    sortOrder: (r.items[5].int32Value as number | undefined) ?? 0,
  }));
}
```

- [ ] **Step 4: Запустить тест — должен пройти**

Run: `npx vitest run lib/categories.test.ts`
Expected: PASS.

- [ ] **Step 5: Прогон всех тестов и tsc**

Run: `npm test && npx tsc --noEmit`
Expected: всё зелёное.

- [ ] **Step 6: Commit**

```bash
git add lib/categories.ts lib/categories.test.ts
git commit -m "feat(phase-c): fetchAllCategories returns PublicCategory[]"
```

---

## Task 4: Скрипт миграции `scripts/migrate-legacy-points.ts` + тест на дедупликацию

Скрипт читает `data/points.json` (30 mock), для каждой ищет дубль в YDB ≤150 м и либо пропускает, либо вставляет как `source='manual'`.

**Files:**
- Create: `scripts/migrate-legacy-points.ts`
- Create: `scripts/migrate-legacy-points.test.ts`

- [ ] **Step 1: Написать failing-тест `scripts/migrate-legacy-points.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { findDuplicateByRadius, haversineMeters } from "./migrate-legacy-points";

describe("haversineMeters", () => {
  it("одинаковые координаты → 0 м", () => {
    expect(haversineMeters(59.94, 30.31, 59.94, 30.31)).toBe(0);
  });

  it("известный отрезок: 0.001° по широте ≈ 111 м", () => {
    const d = haversineMeters(59.94, 30.31, 59.941, 30.31);
    expect(d).toBeGreaterThan(105);
    expect(d).toBeLessThan(115);
  });
});

describe("findDuplicateByRadius", () => {
  const haystack = [
    { id: "rsbor-1", lat: 59.94, lng: 30.31 },
    { id: "rsbor-2", lat: 59.95, lng: 30.32 },
    { id: "rsbor-3", lat: 59.9395, lng: 30.31 }, // ~55 м к rsbor-1
  ];

  it("находит ближайший в радиусе 150 м", () => {
    const r = findDuplicateByRadius({ lat: 59.94, lng: 30.31 }, haystack, 150);
    expect(r?.id).toBe("rsbor-1");
    expect(r?.distanceMeters).toBeLessThan(1);
  });

  it("предпочитает ближайший, если в радиусе двое", () => {
    // Точка ровно посередине между rsbor-1 и rsbor-3
    const r = findDuplicateByRadius({ lat: 59.93975, lng: 30.31 }, haystack, 150);
    // Дистанция до обоих ~28 м; функция возвращает любой ближайший
    expect(["rsbor-1", "rsbor-3"]).toContain(r?.id);
  });

  it("возвращает null если ничего в радиусе", () => {
    const r = findDuplicateByRadius({ lat: 60.0, lng: 30.5 }, haystack, 150);
    expect(r).toBeNull();
  });

  it("возвращает null для пустого haystack", () => {
    const r = findDuplicateByRadius({ lat: 59.94, lng: 30.31 }, [], 150);
    expect(r).toBeNull();
  });
});
```

- [ ] **Step 2: Запустить тест — должен упасть**

Run: `npx vitest run scripts/migrate-legacy-points.test.ts`
Expected: FAIL — модуль не существует.

- [ ] **Step 3: Реализовать `scripts/migrate-legacy-points.ts`**

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { PointRow } from "../lib/ydb-points";
import { fetchAllPoints, insertPoint } from "../lib/ydb-points";
import type { CategoryId } from "../lib/types";

type LegacyPoint = {
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
};

export function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6_371_000; // м
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function findDuplicateByRadius(
  needle: { lat: number; lng: number },
  haystack: { id: string; lat: number; lng: number }[],
  radiusMeters: number,
): { id: string; distanceMeters: number } | null {
  let best: { id: string; distanceMeters: number } | null = null;
  for (const h of haystack) {
    const d = haversineMeters(needle.lat, needle.lng, h.lat, h.lng);
    if (d <= radiusMeters && (!best || d < best.distanceMeters)) {
      best = { id: h.id, distanceMeters: d };
    }
  }
  return best;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[а-я]/g, (c) => {
      const map: Record<string, string> = {
        а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ж: "zh", з: "z",
        и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p",
        р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts", ч: "ch",
        ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
      };
      return map[c] ?? "";
    })
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

async function main() {
  const file = resolve(process.cwd(), "data/points.json");
  const legacy = JSON.parse(readFileSync(file, "utf-8")) as LegacyPoint[];
  console.log(`📥 Loaded ${legacy.length} legacy points from data/points.json`);

  const existing = await fetchAllPoints();
  console.log(`🗄  YDB сейчас содержит ${existing.length} точек`);

  let created = 0;
  let skipped = 0;

  for (const m of legacy) {
    const dup = findDuplicateByRadius(m, existing, 150);
    if (dup) {
      console.log(
        `⊘ "${m.name}" — дубль с ${dup.id} (${dup.distanceMeters.toFixed(0)} м), пропуск`,
      );
      skipped++;
      continue;
    }

    const id = `manual-${slugify(m.name)}-${m.lat.toFixed(4)}`;
    const row: PointRow = {
      id,
      name: m.name,
      address: m.address,
      lat: m.lat,
      lng: m.lng,
      description: m.description || null,
      hours: m.hours || null,
      schedule_json: null,
      phone: m.phone || null,
      website: m.website || null,
      photo_url: null,
      status: "active",
      source: "manual",
      source_id: null,
      categoryIds: m.categories,
    };

    await insertPoint(row);
    console.log(`+ "${m.name}" → ${id}`);
    created++;
  }

  console.log(`\n✅ Migration done: created ${created}, skipped ${skipped}`);
}

// Запускаем main() только когда файл вызван как CLI (а не импортирован тестом).
// `process.argv[1]` — путь к стартовому скрипту; tsx сохраняет имя файла.
const startedAsCli =
  typeof process !== "undefined" &&
  typeof process.argv?.[1] === "string" &&
  /migrate-legacy-points\.ts$/.test(process.argv[1]);

if (startedAsCli) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
```

- [ ] **Step 4: Запустить тест — должен пройти**

Run: `npx vitest run scripts/migrate-legacy-points.test.ts`
Expected: PASS, все 5 кейсов.

- [ ] **Step 5: Проверить весь vitest и tsc**

Run: `npm test && npx tsc --noEmit`
Expected: всё зелёное.

- [ ] **Step 6: Commit**

```bash
git add scripts/migrate-legacy-points.ts scripts/migrate-legacy-points.test.ts
git commit -m "feat(phase-c): migrate-legacy-points script with dedup by radius"
```

---

## Task 5: Запустить миграцию локально

Эта задача — **интерактивная с автором**, не subagent. Subagent должен остановиться и попросить автора подтвердить запуск.

**Files:** только данные в YDB.

- [ ] **Step 1: Получить YC IAM-token и установить env**

Автор выполняет в терминале:

```bash
export YDB_ACCESS_TOKEN_CREDENTIALS=$(yc iam create-token)
export YDB_ENDPOINT="grpcs://ydb.serverless.yandexcloud.net:2135"
export YDB_DATABASE="/ru-central1/b1gllfcopm13aodjgmkb/etnsnfn8f18mv9mjomar"
```

`YDB_ACCESS_TOKEN_CREDENTIALS` — то, что распознаёт `getCredentialsFromEnv()` в [lib/ydb.ts:38](../../../lib/ydb.ts).

- [ ] **Step 2: Запустить миграцию**

```bash
GRPC_DNS_RESOLVER=native npx tsx scripts/migrate-legacy-points.ts
```

Expected: лог по каждой из 30 точек: либо `+` (created), либо `⊘` (skipped). В конце строка типа `✅ Migration done: created 12, skipped 18` (точные числа зависят от пересечения с RSBor-точками).

- [ ] **Step 3: Проверить YDB глазами**

```bash
GRPC_DNS_RESOLVER=native ydb -e $YDB_ENDPOINT -d $YDB_DATABASE \
  yql -q "SELECT source, COUNT(*) FROM points GROUP BY source;"
```

Expected: примерно
```
rsbor   101
manual  N      (где N = created из шага 2)
```

- [ ] **Step 4: Спот-чек одной точки**

```bash
GRPC_DNS_RESOLVER=native ydb -e $YDB_ENDPOINT -d $YDB_DATABASE \
  yql -q "SELECT id, name, address FROM points WHERE source = 'manual' LIMIT 3;"
```

Expected: имена/адреса из `data/points.json`.

- [ ] **Step 5: Если запуск рухнул на середине**

Скрипт идемпотентен — стабильный `id="manual-${slug}-${lat}"`. Можно перезапустить, дубли он сам пропустит.

- [ ] **Step 6: Этот шаг данных не коммитит**

Это изменение только в YDB, файлов в репо не было. Переходим к Task 6.

---

## Task 6: `app/page.tsx` → Server Component + новый `components/HomeClient.tsx`

**Files:**
- Modify: `app/page.tsx`
- Create: `components/HomeClient.tsx`

- [ ] **Step 1: Создать `components/HomeClient.tsx`**

```tsx
"use client";

import { useMemo, useState } from "react";
import type { PublicCategory, PublicPoint, CategoryId } from "@/lib/types";
import Map from "@/components/Map";
import FilterPanel from "@/components/FilterPanel";

type Props = {
  points: PublicPoint[];
  categories: PublicCategory[];
};

export default function HomeClient({ points, categories }: Props) {
  const allCategoryIds = useMemo<CategoryId[]>(
    () => categories.map((c) => c.id),
    [categories],
  );

  const [selected, setSelected] = useState<Set<CategoryId>>(
    () => new Set(allCategoryIds),
  );

  const filteredPoints = useMemo(
    () => points.filter((p) => p.categoryIds.some((c) => selected.has(c))),
    [points, selected],
  );

  const toggle = (id: CategoryId) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(allCategoryIds));
  const reset = () => setSelected(new Set());

  return (
    <div className="flex flex-1 min-h-0">
      <aside className="hidden md:flex md:flex-col w-64 shrink-0 border-r border-gray-200 p-4 overflow-y-auto bg-white">
        <FilterPanel
          categories={categories}
          selected={selected}
          onToggle={toggle}
          onSelectAll={selectAll}
          onReset={reset}
          pointCount={filteredPoints.length}
        />
      </aside>

      <section className="flex-1">
        <Map points={filteredPoints} categories={categories} />
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Перевести `app/page.tsx` в Server Component**

Полностью заменить содержимое:

```tsx
import { fetchAllPoints } from "@/lib/ydb-points";
import { fetchAllCategories } from "@/lib/categories";
import HomeClient from "@/components/HomeClient";

export const revalidate = 300; // Next.js 16: данные кешируются на 5 минут

export default async function Home() {
  const [points, categories] = await Promise.all([
    fetchAllPoints(),
    fetchAllCategories(),
  ]);
  return <HomeClient points={points} categories={categories} />;
}
```

Заметь: больше нет `"use client"`, нет `useState`, нет JSON-импортов. Всё на сервере.

- [ ] **Step 3: Обновить `components/Map.tsx` под новые типы**

Заменить блок типов:

```tsx
"use client";

import dynamic from "next/dynamic";
import type { PublicPoint, PublicCategory } from "@/lib/types";

const MapInner = dynamic(() => import("./MapInner"), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full flex items-center justify-center text-gray-500">
      Загрузка карты…
    </div>
  ),
});

type Props = {
  points: PublicPoint[];
  categories: PublicCategory[];
};

export default function Map(props: Props) {
  return <MapInner {...props} />;
}
```

- [ ] **Step 4: Обновить `components/FilterPanel.tsx` под новые типы**

В импортах поменять `Category` → `PublicCategory`:

```tsx
"use client";

import type { PublicCategory, CategoryId } from "@/lib/types";

type Props = {
  categories: PublicCategory[];
  selected: Set<CategoryId>;
  onToggle: (id: CategoryId) => void;
  onSelectAll: () => void;
  onReset: () => void;
  pointCount: number;
};
```

Тело компонента **остаётся тем же**: он рендерит чекбоксы по `categories`. Поскольку YDB-таблица содержит 13 категорий — на фронте автоматически будет 13 чекбоксов.

Поле `c.icon` → теперь это `c.emoji` в PublicCategory: заменить в JSX:

```tsx
<span className="text-sm">
  {c.emoji} {c.label}
</span>
```

(остальное — без изменений).

- [ ] **Step 5: Обновить `components/MapInner.tsx` (минимально, только типы) — bead и кластеры в Task 7-8**

В блоке импортов:

```tsx
import type { PublicPoint, PublicCategory, CategoryId } from "@/lib/types";
```

Тип Props:

```tsx
type Props = {
  points: PublicPoint[];
  categories: PublicCategory[];
};
```

Внутри компонента: `categoryById` → `Map<CategoryId, PublicCategory>`. Маркер пока остаётся старым `coloredIcon` (заменим в Task 7); он использует `category.color` — это поле есть и у `PublicCategory`. Но обращение к `p.categories` (старое поле) → `p.categoryIds`.

Убедись что строка строится так:

```tsx
const primary = categoryById.get(p.categoryIds[0]);
```

- [ ] **Step 6: Проверка типов**

Run: `npx tsc --noEmit`
Expected: без ошибок. Если жалуется на `lib/data.ts` — оставь его как есть, мы удалим в Task 12.

⚠️ Если `lib/data.ts` ругается на отсутствие старого `Point`/`Category` — это неожиданно (мы их пока не удаляли). В случае конфликта — поправь, ничего не упирай.

- [ ] **Step 7: Smoke-тест локально (опционально, оставим до Task 10)**

Сейчас не запускаем `npm run dev` — компоненты MapInner ещё не доделаны. Доведём в Task 7-8.

- [ ] **Step 8: Commit**

```bash
git add app/page.tsx components/HomeClient.tsx components/Map.tsx components/FilterPanel.tsx components/MapInner.tsx
git commit -m "feat(phase-c): app/page.tsx as Server Component + HomeClient"
```

---

## Task 7: Маркер «бусы» — `components/beadMarker.ts` + замена в `MapInner.tsx`

**Files:**
- Create: `components/beadMarker.ts`
- Create: `components/beadMarker.test.ts`
- Modify: `components/MapInner.tsx`
- Modify: `app/globals.css`

- [ ] **Step 1: Написать failing-тест `components/beadMarker.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { buildBeadHtml } from "./beadMarker";

describe("buildBeadHtml", () => {
  it("3 цвета — 3 span'а без хвоста", () => {
    const html = buildBeadHtml(["#aabbcc", "#112233", "#ffeedd"]);
    expect(html).toBe(
      `<div class="bead-marker"><span style="background:#aabbcc"></span><span style="background:#112233"></span><span style="background:#ffeedd"></span></div>`,
    );
  });

  it("8 цветов — первые 5 + хвост +3", () => {
    const html = buildBeadHtml(
      ["#1", "#2", "#3", "#4", "#5", "#6", "#7", "#8"].map((c) => `#${c.replace("#", "").padStart(6, "0")}`),
    );
    const spans = html.match(/<span style="background:/g) ?? [];
    expect(spans).toHaveLength(5);
    expect(html).toContain(`<span class="more">+3</span>`);
  });

  it("0 цветов — пустой div", () => {
    expect(buildBeadHtml([])).toBe(`<div class="bead-marker"></div>`);
  });

  it("отбрасывает невалидный цвет (XSS-инъекция в style)", () => {
    const html = buildBeadHtml([
      "#aabbcc",
      'red; background-image: url("/evil")',
      "#112233",
    ]);
    expect(html).toContain(`style="background:#aabbcc"`);
    expect(html).toContain(`style="background:#112233"`);
    expect(html).not.toContain("evil");
    expect(html).not.toContain("background-image");
  });
});
```

- [ ] **Step 2: Запустить тест — должен упасть**

Run: `npx vitest run components/beadMarker.test.ts`
Expected: FAIL — модуль не существует.

- [ ] **Step 3: Реализовать `components/beadMarker.ts`**

```ts
const HEX_COLOR = /^#[0-9a-fA-F]{3,8}$/;

function isValidColor(c: string): boolean {
  return HEX_COLOR.test(c);
}

export function buildBeadHtml(colors: string[], maxBeads = 5): string {
  const valid = colors.filter(isValidColor);
  const visible = valid.slice(0, maxBeads);
  const overflow = valid.length - visible.length;
  const beads = visible
    .map((c) => `<span style="background:${c}"></span>`)
    .join("");
  const more = overflow > 0 ? `<span class="more">+${overflow}</span>` : "";
  return `<div class="bead-marker">${beads}${more}</div>`;
}
```

- [ ] **Step 4: Запустить тест — должен пройти**

Run: `npx vitest run components/beadMarker.test.ts`
Expected: PASS, все 4 кейса.

- [ ] **Step 5: Добавить CSS в `app/globals.css`**

Прочитать текущий файл, в конец добавить:

```css
/* Phase C: маркер «бусы» */
.bead-marker {
  display: flex;
  gap: 2px;
  padding: 4px;
  background: white;
  border-radius: 14px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
  align-items: center;
  width: fit-content;
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

- [ ] **Step 6: Заменить маркер в `components/MapInner.tsx`**

Удалить функцию `coloredIcon` целиком. Заменить блок маркеров так, чтобы для каждой точки строился bead-маркер по цветам её категорий, отсортированных по `sortOrder`.

В верх файла добавить импорт:

```tsx
import { buildBeadHtml } from "./beadMarker";
```

Внутри `MapInner`:

```tsx
function beadIcon(colors: string[]): L.DivIcon {
  return L.divIcon({
    className: "",
    html: buildBeadHtml(colors),
    iconAnchor: [9, 9],
  });
}
```

И в маркерах:

```tsx
{points.map((p) => {
  const sortedCats = p.categoryIds
    .map((id) => categoryById.get(id))
    .filter((c): c is PublicCategory => c !== undefined)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const colors = sortedCats.map((c) => c.color);
  return (
    <Marker key={p.id} position={[p.lat, p.lng]} icon={beadIcon(colors)}>
      <Popup>
        <PointPopup point={p} categoryById={categoryById} />
      </Popup>
    </Marker>
  );
})}
```

⚠️ Не удалай старый импорт `import L from "leaflet"` — он нужен для `L.divIcon`.

- [ ] **Step 7: Прогон тестов и tsc**

Run: `npm test && npx tsc --noEmit`
Expected: всё зелёное (PointPopup пока ругается на старые поля? — поправим в Task 9; если ругается, продолжай к Task 8 и зайди к этому в Task 9).

- [ ] **Step 8: Commit**

```bash
git add components/beadMarker.ts components/beadMarker.test.ts components/MapInner.tsx app/globals.css
git commit -m "feat(phase-c): bead marker shows all categories on a single pin"
```

---

## Task 8: Кластеризация — `react-leaflet-cluster`

**Files:**
- Modify: `package.json`, `package-lock.json`
- Modify: `components/MapInner.tsx`

- [ ] **Step 1: Установить зависимости**

```bash
npm install leaflet.markercluster react-leaflet-cluster
npm install -D @types/leaflet.markercluster
```

Expected: пакеты добавлены, нет peer-warnings про `react-leaflet@5`. Если есть peer-warning несовместимости — продолжаем (npm не блокирует), и проверим работу в Task 10.

- [ ] **Step 2: Обернуть маркеры в `<MarkerClusterGroup>` в `components/MapInner.tsx`**

Добавить импорты:

```tsx
import MarkerClusterGroup from "react-leaflet-cluster";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
```

В JSX обернуть рендер маркеров:

```tsx
<MarkerClusterGroup
  chunkedLoading
  maxClusterRadius={50}
  spiderfyOnMaxZoom
  showCoverageOnHover={false}
  disableClusteringAtZoom={15}
>
  {points.map((p) => {
    const sortedCats = p.categoryIds
      .map((id) => categoryById.get(id))
      .filter((c): c is PublicCategory => c !== undefined)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const colors = sortedCats.map((c) => c.color);
    return (
      <Marker key={p.id} position={[p.lat, p.lng]} icon={beadIcon(colors)}>
        <Popup>
          <PointPopup point={p} categoryById={categoryById} />
        </Popup>
      </Marker>
    );
  })}
</MarkerClusterGroup>
```

- [ ] **Step 3: Прогон tsc**

Run: `npx tsc --noEmit`
Expected: типы согласованы.

- [ ] **Step 4: Commit**

```bash
git add components/MapInner.tsx package.json package-lock.json
git commit -m "feat(phase-c): cluster nearby markers with react-leaflet-cluster"
```

---

## Task 9: `components/PointPopup.tsx` под `PublicPoint` (фото, иконки, 13 категорий)

**Files:**
- Modify: `components/PointPopup.tsx`

- [ ] **Step 1: Полностью заменить `components/PointPopup.tsx`**

```tsx
import type { PublicPoint, PublicCategory, CategoryId } from "@/lib/types";

type Props = {
  point: PublicPoint;
  categoryById: Map<CategoryId, PublicCategory>;
};

export default function PointPopup({ point, categoryById }: Props) {
  const sortedCats = point.categoryIds
    .map((id) => categoryById.get(id))
    .filter((c): c is PublicCategory => c !== undefined)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div className="text-sm max-w-xs">
      {point.photoUrl && (
        <img
          src={point.photoUrl}
          alt=""
          className="w-full h-32 object-cover rounded mb-2"
          loading="lazy"
        />
      )}

      <div className="font-semibold text-base mb-1">{point.name}</div>
      <div className="text-gray-700 mb-2">{point.address}</div>

      <div className="flex flex-wrap gap-1 mb-2">
        {sortedCats.map((cat) => (
          <span
            key={cat.id}
            className="text-xs px-2 py-0.5 rounded-full text-white inline-flex items-center gap-1"
            style={{ backgroundColor: cat.color }}
          >
            {cat.iconPath ? (
              <img
                src={cat.iconPath}
                alt=""
                className="w-3 h-3 invert"
                aria-hidden
              />
            ) : (
              <span aria-hidden>{cat.emoji}</span>
            )}
            {cat.label}
          </span>
        ))}
      </div>

      {point.hours && (
        <div className="mb-1">
          <span className="text-gray-500">Часы:</span> {point.hours}
        </div>
      )}
      {point.phone && (
        <div className="mb-1">
          <span className="text-gray-500">Телефон:</span>{" "}
          <a
            href={`tel:${point.phone}`}
            className="text-emerald-700 underline"
          >
            {point.phone}
          </a>
        </div>
      )}
      {point.website && (
        <div className="mb-1">
          <a
            href={point.website}
            target="_blank"
            rel="noopener noreferrer"
            className="text-emerald-700 underline"
          >
            Сайт
          </a>
        </div>
      )}
      {point.description && (
        <div className="mt-2 text-gray-700">{point.description}</div>
      )}
    </div>
  );
}
```

⚠️ Класс `invert` — Tailwind фильтр (черные SVG → белые на цветном фоне). Если SVG-иконки изначально цветные, и invert делает их странными — убрать `invert` вернись к этому шагу позднее (визуально можно править в Task 10).

- [ ] **Step 2: Проверка тестов и tsc**

Run: `npm test && npx tsc --noEmit`
Expected: всё зелёное.

- [ ] **Step 3: Commit**

```bash
git add components/PointPopup.tsx
git commit -m "feat(phase-c): popup shows photo, sorted categories with RSBor icons"
```

---

## Task 10: Smoke-тест локально

**Интерактивно с автором.** Subagent должен подготовить env, запустить `npm run dev` и попросить автора посмотреть в браузере.

**Files:** только проверка.

- [ ] **Step 1: Подготовить env**

```bash
export YC_TOKEN=$(yc iam create-token)
export YDB_ACCESS_TOKEN_CREDENTIALS=$YC_TOKEN
export YDB_ENDPOINT="grpcs://ydb.serverless.yandexcloud.net:2135"
export YDB_DATABASE="/ru-central1/b1gllfcopm13aodjgmkb/etnsnfn8f18mv9mjomar"
export NEXTAUTH_URL="http://localhost:3000"
export NEXTAUTH_SECRET="$(openssl rand -hex 32)"
export AUTH_TRUST_HOST=true
```

`YDB_ACCESS_TOKEN_CREDENTIALS` — то, что распознаёт `getCredentialsFromEnv()` в [lib/ydb.ts:38](../../../lib/ydb.ts) для локальной разработки. `NEXTAUTH_*` и `AUTH_TRUST_HOST` — формальные заглушки, чтобы NextAuth не падал на главной странице (мы её не авторизуем, но `proxy.ts` грузится).

- [ ] **Step 2: Запустить dev-сервер**

```bash
npm run dev
```

Expected: `Next.js 16.x.x — Local: http://localhost:3000`. Без падения.

- [ ] **Step 3: Открыть http://localhost:3000**

Expected:
- Слева 13 чекбоксов категорий с эмодзи.
- В центре карта Питера, на ней маркеры-«бусы» (можно увидеть через кластеры).
- Счётчик «Найдено: ~131» (или сколько после миграции в YDB).

- [ ] **Step 4: Кликнуть по маркеру**

Expected: попап с названием, адресом, бэйджами категорий с цветами и иконками. Если у точки фото — оно сверху.

- [ ] **Step 5: Менять фильтры**

Expected:
- Снять «Лампочки» — точки только с этой категорией исчезают.
- «Сбросить» → счётчик 0, маркеров нет.
- «Выбрать все» → счётчик возвращается к ~131.

- [ ] **Step 6: Зум + кластеры**

Expected:
- На zoom 11–12 видны бирюзовые кружки с числами.
- На zoom 15+ кластеры распадаются на индивидуальные маркеры.

- [ ] **Step 7: Если что-то не работает**

Возможные проблемы и фиксы:
- Карта не рендерит маркеры → проверить `npx tsc --noEmit`, лог консоли браузера.
- `react-leaflet-cluster` не работает с `react-leaflet@5` → fallback: переписать обёртку через ref + useEffect, используя `L.markerClusterGroup()` напрямую (см. README библиотеки).
- Иконки в попапе не отображаются → возможно `invert` искажает цветной SVG, убрать класс.

- [ ] **Step 8: Остановить dev-сервер**

`Ctrl+C`. На этом этапе нет коммита — изменений не делалось.

---

## Task 11: Деплой на прод и верификация

**Интерактивно с автором.**

- [ ] **Step 1: Push в main**

```bash
git push origin main
```

GitHub Actions запускает workflow `deploy.yml`, билдит Docker, пушит в YC Container Registry, деплоит в Serverless Container.

- [ ] **Step 2: Дождаться зелёного workflow**

Открыть `https://github.com/victorovi4/recyclemap-spb/actions`. Дождаться зелёной галки (~3-5 минут).

- [ ] **Step 3: Открыть прод**

```
https://bbaosmjuhscbpji6n847.containers.yandexcloud.net
```

- [ ] **Step 4: Прод-чеклист (см. spec §8)**

Для каждого пункта — глазами:

- [ ] На главной видны маркеры (не только 30 mock).
- [ ] На zoom 11 видны кластеры с числами.
- [ ] На zoom 15+ кластеры распадаются на индивидуальные маркеры.
- [ ] Многокатегорийные точки показывают ≥2 цветных бусины.
- [ ] Клик по маркеру → попап с названием, адресом, бэйджами, фото если есть.
- [ ] Чекбокс «Лампочки» (новая категория) скрывает/показывает точки.
- [ ] «Сбросить» → счётчик «Найдено: 0».
- [ ] «Выбрать все» → счётчик «Найдено: ~131».
- [ ] Админ-дашборд `/admin` продолжает работать.
- [ ] `npm test` локально зелёный (запустить ещё раз).

- [ ] **Step 5: Если на проде проблема**

- Регрессия только на проде, не локально → почти наверняка env (см. `.github/workflows/deploy.yml`, проверь YDB_ENDPOINT, YDB_DATABASE).
- Если совсем плохо → откат: `git revert HEAD~7..HEAD; git push` (отменит коммиты Phase C, фронт вернётся к JSON).

---

## Task 12: Удалить legacy JSON и старые типы

**Files:**
- Delete: `data/points.json`, `data/categories.json`, `lib/data.ts`
- Modify: `lib/types.ts`

⚠️ Этот шаг выполняется **только после** успешного Task 11.

- [ ] **Step 1: Убедиться что нигде нет импортов из `lib/data` или JSON**

Run: `grep -rn "from \"@/lib/data\"" app components lib scripts || true`
Expected: пусто.

Run: `grep -rn "data/points.json\|data/categories.json" app components lib scripts || true`
Expected: пусто (миграция-скрипт не считается — он в `scripts/`, и чтение он сделал один раз).

⚠️ Если в `scripts/migrate-legacy-points.ts` ещё есть `readFileSync("data/points.json")` — это OK, он одноразовый, мы его в этой задаче тоже удалим (см. Step 4).

- [ ] **Step 2: Удалить файлы**

```bash
git rm data/points.json data/categories.json lib/data.ts
```

- [ ] **Step 3: Удалить старые `Point` и `Category` из `lib/types.ts`**

В `lib/types.ts` оставить только:

```ts
export type CategoryId =
  | "plastic" | "glass" | "paper" | "metal"
  | "batteries" | "electronics" | "tetrapak" | "textile"
  | "lamps" | "caps" | "tires" | "hazardous" | "other";

export type PublicCategory = {
  id: CategoryId;
  label: string;
  color: string;
  iconPath: string | null;
  emoji: string;
  sortOrder: number;
};

export type PublicPoint = {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  categoryIds: CategoryId[];
  hours: string | null;
  phone: string | null;
  website: string | null;
  description: string | null;
  photoUrl: string | null;
};
```

(Удалить `Point` и `Category`.)

- [ ] **Step 4: Удалить миграционный скрипт и его тест (одноразовое использование)**

```bash
git rm scripts/migrate-legacy-points.ts scripts/migrate-legacy-points.test.ts
```

История остаётся в git — если когда-то понадобится переиграть, восстановим из коммита Task 4.

- [ ] **Step 5: Прогон tsc и тестов**

Run: `npm test && npx tsc --noEmit`
Expected: всё зелёное (на 4 теста меньше — `migrate-legacy-points.test.ts` ушёл).

- [ ] **Step 6: Smoke-тест прода ещё раз**

Открыть https://bbaosmjuhscbpji6n847.containers.yandexcloud.net (после деплоя нового коммита) и убедиться что точки на месте.

- [ ] **Step 7: Commit и push**

```bash
git commit -m "chore(phase-c): retire data/points.json, data/categories.json, lib/data.ts"
git push origin main
```

Дождаться зелёной деплой-галки и финальной проверки.

---

## Task 13: Обновить документацию

**Files:**
- Modify: `docs/superpowers/specs/2026-04-22-recyclemap-spb-full-design.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Обновить full-design.md, секция «Стек»**

Найти строку:
```
| **Карта** | Яндекс Карты JS API 3.0 через `@yandex/ymaps3-reactify` |
```

Заменить на:
```
| **Карта** | Leaflet + OpenStreetMap (см. Phase C — отказ от Яндекс Карт зафиксирован 2026-04-26) |
```

- [ ] **Step 2: Обновить full-design.md, секция «Лимиты Яндекс Карт»**

Удалить весь подраздел «Лимиты Яндекс Карт». Вместо него добавить короткое:

```
### Внешние карты-зависимости

После Phase C проект **не зависит ни от одного API-ключа на карты**. Геокодинг
для будущей формы Submit (Phase E) — Nominatim (открытый OSM-сервис, 1 req/sec).
```

- [ ] **Step 3: Обновить full-design.md, секция 4.1**

Найти строку про `ymaps3.Clusterer` в флоу «Посетитель смотрит карту» и заменить на:
```
3. Leaflet рисует маркеры, `react-leaflet-cluster` группирует близкие.
```

И заменить упоминание API-route:
```
2. Server Component читает YDB (creds серверные) → отдаёт HTML с уже встроенными точками.
```

- [ ] **Step 4: Обновить full-design.md, фазовая таблица — Phase C**

Найти строку:
```
| **C** | Фронт: с JSON на API + Яндекс Карты | 10–15 | Визуально близко к recyclemap.ru |
```

Заменить на:
```
| **C** ✅ | Фронт: с JSON на YDB через RSC, расширение до 13 категорий, кластеризация | 6–8 | Публика видит реальные точки РС — **готово 2026-04-27** |
```

- [ ] **Step 5: Обновить full-design.md, риски**

Найти таблицу рисков и удалить строку про «блокировку ключа Яндекс Карт».

- [ ] **Step 6: Дополнить `CHANGELOG.md`**

В разделе `[Unreleased]` (или создать новую версию `[0.3.0-phase-c]`) добавить:

```markdown
## [0.3.0-phase-c] — 2026-04-27 — Фронт читает YDB

**Итог фазы:** публика видит реальные точки приёма из YDB (101 RSBor + N migrated mock). Фильтр расширен до 13 категорий. Маркер показывает все категории «бусами», близкие группируются в кластеры. Движок карты остаётся Leaflet+OSM — миграция на Яндекс Карты отложена.

### Added

- `app/page.tsx` стал async Server Component — читает YDB через `fetchAllPoints()` и `fetchAllCategories()`.
- `components/HomeClient.tsx` — клиентская обёртка с фильтр-стейтом.
- `components/beadMarker.ts` — pure helper для генерации HTML «бус» с лимитом 5+«+N».
- `lib/categories.ts:fetchAllCategories()`.
- `lib/ydb-points.ts:fetchAllPoints()`.
- Кластеризация через `react-leaflet-cluster` (новая зависимость).
- 13 чекбоксов категорий (вместо 8) — таксономия из YDB.
- Попап точки расширен: фото, цветные бэйджи всех категорий, иконки РС.
- Скрипт миграции 30 mock-точек в YDB как `source='manual'` с дедупликацией ≤150 м (одноразовый, удалён после прогона).

### Changed

- `data/points.json`, `data/categories.json`, `lib/data.ts` — удалены, истории в git.
- `lib/types.ts`: старые `Point`/`Category` заменены на `PublicPoint`/`PublicCategory`.
- `docs/superpowers/specs/2026-04-22-recyclemap-spb-full-design.md`: карта остаётся Leaflet, чтение через RSC, Nominatim вместо Яндекс Геокодера.

### Решения, отступившие от full-design.md

- **Карта остаётся на Leaflet+OSM**, Яндекс Карты отложены без срока. Аргументы: Leaflet работает, ключ Яндекс несёт риск блокировки и сложность регистрации.
- **Чтение через RSC, не `/api/points`**. Внешних потребителей API нет. К endpoint'у вернёмся, когда появятся.
- **Чипы, сайдбар, URL-стейт, маршруты, share** — отложены в Phase D.

### Ключевые коммиты

```
30e1703 docs: Phase C design — frontend reads from YDB via RSC + Leaflet
... (после Task 13 будут перечислены коммиты)
```
```

- [ ] **Step 7: Commit**

```bash
git add docs/superpowers/specs/2026-04-22-recyclemap-spb-full-design.md CHANGELOG.md
git commit -m "docs: Phase C closed — Leaflet stays, RSC reads YDB, 13 categories"
git push origin main
```

- [ ] **Step 8: Phase C закрыта**

Проверочные критерии (spec §12):
- [ ] Прод показывает ≥100 точек из YDB.
- [ ] 13 чекбоксов фильтра.
- [ ] Маркер «бусы» работает.
- [ ] Кластеры на zoom 11.
- [ ] Попап показывает фото и категории.
- [ ] `data/points.json`, `data/categories.json`, `lib/data.ts` удалены.
- [ ] `npm test` зелёный.
- [ ] CHANGELOG и full-design обновлены.

🎉 Готово. Следующая фаза — Phase D (UX-клон recyclemap.ru: чипы, сайдбар, URL-стейт, маршруты).
