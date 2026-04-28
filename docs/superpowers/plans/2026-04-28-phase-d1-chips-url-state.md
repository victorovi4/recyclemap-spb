# Phase D-1 — Chips + URL State Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Заменить чекбоксы на filled-чипы и синхронизировать выбор категорий + центр/зум карты с URL через `nuqs`. Добавить нативную мобильную панель `<details>` с теми же чипами.

**Architecture:** `HomeClient` владеет всем URL-стейтом через 3 `useQueryState` hook'а (`f`, `ll`, `z`). Парсеры — в `lib/url-state.ts`, чистые функции с тестами. Карта получает `center`, `zoom`, `onMoveEnd` props; внутри `MapInner` — два internal-компонента `MapView` (синхронизирует props → leaflet) и `MapEventsBridge` (debounced moveend → колбэк в HomeClient → URL).

**Tech Stack:** Next.js 16 RSC + Client Components · TypeScript · Tailwind v4 · `nuqs` ^2.8 · `react-leaflet@5` + `leaflet.markercluster` · vitest для юнитов парсеров.

**Spec:** [docs/superpowers/specs/2026-04-28-phase-d1-chips-url-state-design.md](../specs/2026-04-28-phase-d1-chips-url-state-design.md)

---

## File Structure

**Создаются:**
- `lib/url-state.ts` — парсеры nuqs (`fractionsParser`, `llParser`, `zoomParser`) + `sanitizeFractions` helper.
- `lib/url-state.test.ts` — юниты на парсеры.
- `components/CategoryChip.tsx` — презентационный филлед-чип.
- `components/MobileFilterDrawer.tsx` — `<details>` для mobile.
- `components/MapView.tsx` — useEffect с `map.setView(center, zoom)`.
- `components/MapEventsBridge.tsx` — `useMapEvents({ moveend })` с debounce 300ms.

**Меняются:**
- `app/layout.tsx` — оборачивает children в `<NuqsAdapter>`.
- `components/HomeClient.tsx` — useState → useQueryState; новый layout `flex-col md:flex-row`; передаёт `center/zoom/onMoveEnd` в Map.
- `components/FilterPanel.tsx` — `<input type=checkbox>` → `<CategoryChip>` во flex-wrap.
- `components/Map.tsx` — пробрасывает новые props.
- `components/MapInner.tsx` — принимает `center/zoom/onMoveEnd` props; вставляет `<MapView>` и `<MapEventsBridge>` внутрь `<MapContainer>`.
- `app/globals.css` — стили `details[open]` стрелочки (если Tailwind не умеет открыто).
- `package.json`, `package-lock.json` — добавится `nuqs`.

---

## Task 1: Установить `nuqs` и обернуть в `<NuqsAdapter>`

**Files:**
- Modify: `package.json`, `package-lock.json`
- Modify: `app/layout.tsx`

- [ ] **Step 1: Установить пакет**

```bash
npm install nuqs
```

Expected: `nuqs@^2.8.x` добавлен в `dependencies`.

- [ ] **Step 2: Обернуть `<RootLayout>` children в `<NuqsAdapter>`**

В `app/layout.tsx` добавить импорт:

```tsx
import { NuqsAdapter } from "nuqs/adapters/next/app";
```

Заменить тело `<body>` так:

```tsx
<body className="min-h-full flex flex-col">
  <NuqsAdapter>
    <Header />
    {children}
  </NuqsAdapter>
</body>
```

(Header внутри adapter, чтобы при будущих надобностях он тоже мог использовать URL-state — пока ему не нужно, но это не вредно.)

- [ ] **Step 3: Прогон tsc + тестов**

Run: `npx tsc --noEmit && npm test`
Expected: tsc clean, 46 тестов зелёные (без изменений в логике).

- [ ] **Step 4: Локально dev запускается**

```bash
export YDB_ACCESS_TOKEN_CREDENTIALS=$(yc iam create-token)
export YDB_ENDPOINT="grpcs://ydb.serverless.yandexcloud.net:2135"
export YDB_DATABASE="/ru-central1/b1gllfcopm13aodjgmkb/etnsnfn8f18mv9mjomar"
export NEXTAUTH_URL="http://localhost:3000"
export NEXTAUTH_SECRET="$(openssl rand -hex 32)"
export AUTH_TRUST_HOST=true
rm -rf .next
GRPC_DNS_RESOLVER=native npm run dev
```

Expected: `Ready in <Xms>` без ошибок про nuqs.

Не нужно ничего проверять в браузере — мы пока не используем nuqs hook'и, просто проверяем что adapter не сломал рендер. `Ctrl+C` после успешного запуска.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json app/layout.tsx
git commit -m "feat(phase-d-1): add nuqs + NuqsAdapter wrapper"
```

---

## Task 2: Парсеры URL-state в `lib/url-state.ts` + юниты

**Files:**
- Create: `lib/url-state.ts`
- Test: `lib/url-state.test.ts`

- [ ] **Step 1: Написать failing-тест `lib/url-state.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import {
  fractionsParser,
  llParser,
  zoomParser,
  sanitizeFractions,
} from "./url-state";

describe("fractionsParser", () => {
  it("parses comma-separated list", () => {
    expect(fractionsParser.parse("plastic,glass,paper")).toEqual([
      "plastic", "glass", "paper",
    ]);
  });

  it("parses empty string as empty array", () => {
    expect(fractionsParser.parse("")).toEqual([]);
  });

  it("serializes array to comma-separated string", () => {
    expect(fractionsParser.serialize(["plastic", "glass"])).toBe(
      "plastic,glass",
    );
  });
});

describe("sanitizeFractions", () => {
  it("returns null for null input", () => {
    expect(sanitizeFractions(null)).toBeNull();
  });

  it("filters out unknown ids", () => {
    expect(sanitizeFractions(["plastic", "evil-id", "glass"])).toEqual([
      "plastic", "glass",
    ]);
  });

  it("returns empty array as-is", () => {
    expect(sanitizeFractions([])).toEqual([]);
  });

  it("keeps all 13 known ids", () => {
    const all = [
      "plastic", "glass", "paper", "metal", "batteries", "electronics",
      "tetrapak", "textile", "lamps", "caps", "tires", "hazardous", "other",
    ];
    expect(sanitizeFractions(all)).toEqual(all);
  });
});

describe("llParser", () => {
  it("parses 'lat,lng' to tuple", () => {
    expect(llParser.parse("59.94,30.31")).toEqual([59.94, 30.31]);
  });

  it("returns null for malformed input", () => {
    expect(llParser.parse("garbage")).toBeNull();
    expect(llParser.parse("59.94")).toBeNull();
    expect(llParser.parse("59.94,30.31,extra")).toBeNull();
  });

  it("returns null for non-numeric parts", () => {
    expect(llParser.parse("abc,30.31")).toBeNull();
    expect(llParser.parse("59.94,xyz")).toBeNull();
  });

  it("returns null for out-of-range latitude", () => {
    expect(llParser.parse("99,30.31")).toBeNull();
    expect(llParser.parse("-99,30.31")).toBeNull();
  });

  it("returns null for out-of-range longitude", () => {
    expect(llParser.parse("59.94,200")).toBeNull();
    expect(llParser.parse("59.94,-200")).toBeNull();
  });

  it("serializes tuple to 4-decimal string", () => {
    expect(llParser.serialize([59.93861234, 30.31412345])).toBe(
      "59.9386,30.3141",
    );
  });
});

describe("zoomParser", () => {
  it("parses integer in range", () => {
    expect(zoomParser.parse("11")).toBe(11);
    expect(zoomParser.parse("8")).toBe(8);
    expect(zoomParser.parse("18")).toBe(18);
  });

  it("returns null for out-of-range zoom", () => {
    expect(zoomParser.parse("7")).toBeNull();
    expect(zoomParser.parse("19")).toBeNull();
    expect(zoomParser.parse("0")).toBeNull();
  });

  it("returns null for non-integer", () => {
    expect(zoomParser.parse("abc")).toBeNull();
  });

  it("serializes integer to string", () => {
    expect(zoomParser.serialize(11)).toBe("11");
  });
});
```

- [ ] **Step 2: Запустить тест — должен упасть**

Run: `npx vitest run lib/url-state.test.ts`
Expected: FAIL — `Cannot find module './url-state'`.

- [ ] **Step 3: Реализовать `lib/url-state.ts`**

```ts
import {
  parseAsArrayOf,
  parseAsString,
  createParser,
} from "nuqs";
import type { CategoryId } from "./types";

const VALID_CATS: ReadonlySet<CategoryId> = new Set([
  "plastic",
  "glass",
  "paper",
  "metal",
  "batteries",
  "electronics",
  "tetrapak",
  "textile",
  "lamps",
  "caps",
  "tires",
  "hazardous",
  "other",
]);

const COMMON = { history: "replace" as const, shallow: true };

/**
 * fractionsParser — список выбранных категорий через запятую.
 * - "plastic,glass" → ["plastic", "glass"]
 * - "" → [] (явно пустой выбор)
 * - параметр отсутствует → null (HomeClient интерпретирует как «все включены»)
 */
export const fractionsParser = parseAsArrayOf(
  parseAsString,
  ",",
).withOptions(COMMON);

/**
 * Постфильтрация: отбрасываем id, которых нет в нашем словаре.
 * Защита от мусорных URL.
 */
export function sanitizeFractions(arr: string[] | null): CategoryId[] | null {
  if (arr === null) return null;
  return arr.filter((x): x is CategoryId =>
    VALID_CATS.has(x as CategoryId),
  );
}

/**
 * llParser — координаты центра карты "lat,lng" с 4 знаками после запятой.
 * Невалидные значения, выход за диапазон → null.
 */
export const llParser = createParser({
  parse(v: string): [number, number] | null {
    const parts = v.split(",");
    if (parts.length !== 2) return null;
    const lat = Number(parts[0]);
    const lng = Number(parts[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
    return [lat, lng];
  },
  serialize(v: [number, number]): string {
    return `${v[0].toFixed(4)},${v[1].toFixed(4)}`;
  },
}).withOptions(COMMON);

/**
 * zoomParser — целочисленный zoom в диапазоне 8..18.
 * Вне диапазона / нечисло → null.
 */
export const zoomParser = createParser({
  parse(v: string): number | null {
    if (!/^-?\d+$/.test(v)) return null;
    const n = parseInt(v, 10);
    if (!Number.isFinite(n)) return null;
    if (n < 8 || n > 18) return null;
    return n;
  },
  serialize(v: number): string {
    return String(v);
  },
}).withOptions(COMMON);
```

- [ ] **Step 4: Запустить тест — должен пройти**

Run: `npx vitest run lib/url-state.test.ts`
Expected: PASS, ~17 кейсов.

- [ ] **Step 5: Прогон всех тестов и tsc**

Run: `npm test && npx tsc --noEmit`
Expected: всё зелёное. Должно быть **63 теста** (46 + 17 новых).

- [ ] **Step 6: Commit**

```bash
git add lib/url-state.ts lib/url-state.test.ts
git commit -m "feat(phase-d-1): URL-state parsers (fractions, ll, zoom)"
```

---

## Task 3: Компонент `CategoryChip`

**Files:**
- Create: `components/CategoryChip.tsx`

(Юнит-тестов не пишем — компонент чистый-пресентационный, проверим в smoke-тесте Task 9.)

- [ ] **Step 1: Создать `components/CategoryChip.tsx`**

```tsx
"use client";

import type { PublicCategory } from "@/lib/types";

type Props = {
  category: PublicCategory;
  active: boolean;
  onClick: () => void;
};

export default function CategoryChip({ category, active, onClick }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs " +
        "font-medium border border-transparent transition-colors cursor-pointer " +
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 " +
        (active
          ? "text-white"
          : "bg-gray-200 text-gray-700 hover:bg-gray-300")
      }
      style={active ? { backgroundColor: category.color } : undefined}
    >
      <span aria-hidden>{category.emoji}</span>
      {category.label}
    </button>
  );
}
```

- [ ] **Step 2: Прогон tsc**

Run: `npx tsc --noEmit`
Expected: clean (компонент пока никем не используется, но типы PublicCategory должны резолвиться).

- [ ] **Step 3: Commit**

```bash
git add components/CategoryChip.tsx
git commit -m "feat(phase-d-1): CategoryChip component (filled, accessible)"
```

---

## Task 4: Переписать `FilterPanel` под чипы

**Files:**
- Modify: `components/FilterPanel.tsx`

- [ ] **Step 1: Полностью заменить содержимое `components/FilterPanel.tsx`**

```tsx
"use client";

import type { PublicCategory, CategoryId } from "@/lib/types";
import CategoryChip from "./CategoryChip";

type Props = {
  categories: PublicCategory[];
  selected: Set<CategoryId>;
  onToggle: (id: CategoryId) => void;
  onSelectAll: () => void;
  onReset: () => void;
  pointCount: number;
};

export default function FilterPanel({
  categories,
  selected,
  onToggle,
  onSelectAll,
  onReset,
  pointCount,
}: Props) {
  return (
    <div className="flex flex-col h-full">
      <h2 className="font-semibold mb-3">Фильтры</h2>

      <div className="flex flex-wrap gap-1.5 mb-4">
        {categories.map((c) => (
          <CategoryChip
            key={c.id}
            category={c}
            active={selected.has(c.id)}
            onClick={() => onToggle(c.id)}
          />
        ))}
      </div>

      <div className="flex gap-2 mb-4">
        <button
          type="button"
          onClick={onSelectAll}
          className="text-sm px-3 py-1 border border-gray-300 rounded hover:bg-gray-50 transition-colors"
        >
          Выбрать все
        </button>
        <button
          type="button"
          onClick={onReset}
          className="text-sm px-3 py-1 border border-gray-300 rounded hover:bg-gray-50 transition-colors"
        >
          Сбросить
        </button>
      </div>

      <div className="text-sm text-gray-600">
        Найдено: <span className="font-semibold">{pointCount}</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Прогон tsc + тестов**

Run: `npx tsc --noEmit && npm test`
Expected: clean. Тесты остаются 63 (без изменений).

- [ ] **Step 3: Commit**

```bash
git add components/FilterPanel.tsx
git commit -m "refactor(phase-d-1): FilterPanel uses CategoryChip instead of checkboxes"
```

---

## Task 5: Компонент `MobileFilterDrawer`

**Files:**
- Create: `components/MobileFilterDrawer.tsx`
- Modify: `app/globals.css` (стиль стрелочки)

- [ ] **Step 1: Создать `components/MobileFilterDrawer.tsx`**

```tsx
"use client";

type Props = {
  selectedCount: number;
  totalCount: number;
  pointCount: number;
  children: React.ReactNode;
};

export default function MobileFilterDrawer({
  selectedCount,
  totalCount,
  pointCount,
  children,
}: Props) {
  return (
    <details className="md:hidden bg-white border-b border-gray-200">
      <summary
        className="flex items-center justify-between px-4 py-3 cursor-pointer list-none select-none"
      >
        <span className="font-medium text-sm">
          🎯 Фильтры
          {selectedCount < totalCount && (
            <span className="ml-1 text-emerald-700">({selectedCount})</span>
          )}
        </span>
        <span className="text-xs text-gray-500">
          Найдено: {pointCount}
          <span className="filter-arrow ml-2 inline-block transition-transform">
            ▾
          </span>
        </span>
      </summary>
      <div className="px-4 pb-4 pt-1 border-t border-gray-100">
        {children}
      </div>
    </details>
  );
}
```

- [ ] **Step 2: Добавить CSS для стрелочки в `app/globals.css`**

В конец файла добавить:

```css
/* Phase D-1: rotate the chevron when <details> is open */
details[open] > summary .filter-arrow {
  transform: rotate(180deg);
}

/* Hide native details marker (Safari shows triangle by default even with list-none) */
details > summary::-webkit-details-marker {
  display: none;
}
```

- [ ] **Step 3: Прогон tsc**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add components/MobileFilterDrawer.tsx app/globals.css
git commit -m "feat(phase-d-1): MobileFilterDrawer (native <details> with chevron)"
```

---

## Task 6: Компоненты `MapView` и `MapEventsBridge`

**Files:**
- Create: `components/MapView.tsx`
- Create: `components/MapEventsBridge.tsx`

(Юнит-тестов не пишем — оба компонента сильно завязаны на Leaflet runtime, проверим в smoke-тесте.)

- [ ] **Step 1: Создать `components/MapView.tsx`**

```tsx
"use client";

import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";

type Props = {
  center: [number, number];
  zoom: number;
};

/**
 * Применяет внешние center/zoom (из URL) к карте, не вызывая событий moveend
 * (animate: false). Защита от петли URL → карта → URL: храним последнюю
 * применённую позицию и пропускаем повторное setView, если props не менялись.
 */
export default function MapView({ center, zoom }: Props) {
  const map = useMap();
  const lastApplied = useRef<{ center: [number, number]; zoom: number }>({
    center,
    zoom,
  });

  useEffect(() => {
    const same =
      lastApplied.current.center[0] === center[0] &&
      lastApplied.current.center[1] === center[1] &&
      lastApplied.current.zoom === zoom;
    if (same) return;
    lastApplied.current = { center, zoom };
    map.setView(center, zoom, { animate: false });
  }, [center, zoom, map]);

  return null;
}
```

- [ ] **Step 2: Создать `components/MapEventsBridge.tsx`**

```tsx
"use client";

import { useEffect, useRef } from "react";
import { useMapEvents } from "react-leaflet";

type Props = {
  onMoveEnd: (center: [number, number], zoom: number) => void;
};

/**
 * Слушает leaflet 'moveend' (drag/zoom закончился), debounce 300ms,
 * округляет координаты до 4 знаков и зовёт onMoveEnd. Колбэк, в свою
 * очередь, обновит URL через nuqs.
 */
export default function MapEventsBridge({ onMoveEnd }: Props) {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const map = useMapEvents({
    moveend: () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        const c = map.getCenter();
        onMoveEnd(
          [
            Math.round(c.lat * 10000) / 10000,
            Math.round(c.lng * 10000) / 10000,
          ],
          map.getZoom(),
        );
      }, 300);
    },
  });

  // Cleanup pending debounce on unmount
  useEffect(
    () => () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    },
    [],
  );

  return null;
}
```

- [ ] **Step 3: Прогон tsc**

Run: `npx tsc --noEmit`
Expected: clean. Эти компоненты пока никем не используются, но типы должны резолвиться.

- [ ] **Step 4: Commit**

```bash
git add components/MapView.tsx components/MapEventsBridge.tsx
git commit -m "feat(phase-d-1): MapView + MapEventsBridge for URL ↔ map sync"
```

---

## Task 7: Интегрировать `MapView`/`MapEventsBridge` в `MapInner`, проброс props через `Map`

**Files:**
- Modify: `components/Map.tsx`
- Modify: `components/MapInner.tsx`

- [ ] **Step 1: Обновить `components/Map.tsx`**

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
  center: [number, number];
  zoom: number;
  onMoveEnd: (center: [number, number], zoom: number) => void;
};

export default function Map(props: Props) {
  return <MapInner {...props} />;
}
```

- [ ] **Step 2: Обновить `components/MapInner.tsx`**

Заменить блок Props и тело компонента (импорты ниже остаются):

```tsx
"use client";

import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  AttributionControl,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import MarkerClusterGroup from "react-leaflet-cluster";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import type { PublicPoint, PublicCategory, CategoryId } from "@/lib/types";
import PointPopup from "./PointPopup";
import { buildBeadHtml } from "./beadMarker";
import MapView from "./MapView";
import MapEventsBridge from "./MapEventsBridge";

function beadIcon(colors: string[]): L.DivIcon {
  return L.divIcon({
    className: "",
    html: buildBeadHtml(colors),
    iconAnchor: [9, 9],
  });
}

type Props = {
  points: PublicPoint[];
  categories: PublicCategory[];
  center: [number, number];
  zoom: number;
  onMoveEnd: (center: [number, number], zoom: number) => void;
};

export default function MapInner({
  points,
  categories,
  center,
  zoom,
  onMoveEnd,
}: Props) {
  const categoryById = new Map<CategoryId, PublicCategory>(
    categories.map((c) => [c.id, c]),
  );

  return (
    <MapContainer
      center={center}
      zoom={zoom}
      className="h-full w-full"
      scrollWheelZoom
      attributionControl={false}
    >
      <MapView center={center} zoom={zoom} />
      <MapEventsBridge onMoveEnd={onMoveEnd} />
      <AttributionControl prefix={false} />
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
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
            <Marker
              key={p.id}
              position={[p.lat, p.lng]}
              icon={beadIcon(colors)}
            >
              <Popup>
                <PointPopup point={p} categoryById={categoryById} />
              </Popup>
            </Marker>
          );
        })}
      </MarkerClusterGroup>
    </MapContainer>
  );
}
```

⚠️ В этом шаге `Map.tsx` уже требует новые props (`center`, `zoom`, `onMoveEnd`), но `HomeClient` их пока не передаёт — будет TypeScript-ошибка. Это **ожидаемо**: следующая задача (Task 8) исправит HomeClient. Поэтому tsc на этом шаге запускать **не будем** — иначе подумаем что что-то сломали.

- [ ] **Step 3: Commit (без tsc — HomeClient ещё не обновлён)**

```bash
git add components/Map.tsx components/MapInner.tsx
git commit -m "feat(phase-d-1): MapInner accepts center/zoom/onMoveEnd props"
```

---

## Task 8: Переписать `HomeClient` под `nuqs` + новый layout

**Files:**
- Modify: `components/HomeClient.tsx`

- [ ] **Step 1: Полностью заменить `components/HomeClient.tsx`**

```tsx
"use client";

import { useMemo } from "react";
import { useQueryState } from "nuqs";
import type { PublicCategory, PublicPoint, CategoryId } from "@/lib/types";
import {
  fractionsParser,
  llParser,
  zoomParser,
  sanitizeFractions,
} from "@/lib/url-state";
import Map from "@/components/Map";
import FilterPanel from "@/components/FilterPanel";
import MobileFilterDrawer from "@/components/MobileFilterDrawer";

type Props = {
  points: PublicPoint[];
  categories: PublicCategory[];
};

const DEFAULT_CENTER: [number, number] = [59.9386, 30.3141];
const DEFAULT_ZOOM = 11;

export default function HomeClient({ points, categories }: Props) {
  const allCategoryIds = useMemo<CategoryId[]>(
    () => categories.map((c) => c.id),
    [categories],
  );

  const [rawFractions, setFractions] = useQueryState("f", fractionsParser);
  const [llRaw, setLL] = useQueryState("ll", llParser);
  const [zRaw, setZ] = useQueryState("z", zoomParser);

  const sanitized = useMemo(
    () => sanitizeFractions(rawFractions),
    [rawFractions],
  );

  // null (параметра нет) → все 13 включены; [] → ничего; [...] → как есть.
  const selected = useMemo<Set<CategoryId>>(() => {
    return sanitized === null
      ? new Set(allCategoryIds)
      : new Set(sanitized);
  }, [sanitized, allCategoryIds]);

  const filteredPoints = useMemo(
    () => points.filter((p) => p.categoryIds.some((c) => selected.has(c))),
    [points, selected],
  );

  const center: [number, number] = llRaw ?? DEFAULT_CENTER;
  const zoom: number = zRaw ?? DEFAULT_ZOOM;

  const toggle = (id: CategoryId) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);

    if (next.size === allCategoryIds.length) {
      setFractions(null); // все включены → URL чистый
    } else {
      setFractions([...next]); // в порядке вставки
    }
  };

  const selectAll = () => setFractions(null);
  const reset = () => setFractions([]);

  const onMoveEnd = (c: [number, number], z: number) => {
    setLL(c);
    setZ(z);
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Mobile-only: <details> со списком чипов под header */}
      <MobileFilterDrawer
        selectedCount={selected.size}
        totalCount={allCategoryIds.length}
        pointCount={filteredPoints.length}
      >
        <FilterPanel
          categories={categories}
          selected={selected}
          onToggle={toggle}
          onSelectAll={selectAll}
          onReset={reset}
          pointCount={filteredPoints.length}
        />
      </MobileFilterDrawer>

      <div className="flex flex-1 min-h-0">
        {/* Desktop-only sidebar */}
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
          <Map
            points={filteredPoints}
            categories={categories}
            center={center}
            zoom={zoom}
            onMoveEnd={onMoveEnd}
          />
        </section>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Прогон tsc и тестов**

Run: `npx tsc --noEmit && npm test`
Expected: clean. 63 теста зелёные. Никаких изменений в логике тестов — только URL-парсеры.

- [ ] **Step 3: Commit**

```bash
git add components/HomeClient.tsx
git commit -m "feat(phase-d-1): HomeClient owns URL state via nuqs (f/ll/z)"
```

---

## Task 9: Smoke-тест локально

**Интерактивно с автором.** Subagent должен запустить dev-сервер и попросить автора прокликать чек-лист.

**Files:** только верификация.

- [ ] **Step 1: Подготовить env и запустить dev**

```bash
export YDB_ACCESS_TOKEN_CREDENTIALS=$(yc iam create-token)
export YDB_ENDPOINT="grpcs://ydb.serverless.yandexcloud.net:2135"
export YDB_DATABASE="/ru-central1/b1gllfcopm13aodjgmkb/etnsnfn8f18mv9mjomar"
export NEXTAUTH_URL="http://localhost:3000"
export NEXTAUTH_SECRET="$(openssl rand -hex 32)"
export AUTH_SECRET="$NEXTAUTH_SECRET"
export AUTH_URL="$NEXTAUTH_URL"
export AUTH_TRUST_HOST=true
rm -rf .next
GRPC_DNS_RESOLVER=native npm run dev
```

Expected: `Ready in <Xms>` на http://localhost:3000.

- [ ] **Step 2: Desktop smoke-test (≥768px)**

Открыть http://localhost:3000 в обычном окне браузера.

Проверить:
- [ ] В сайдбаре слева видно 13 цветных чипов (filled), все активны (закрашены своими цветами).
- [ ] Над сайдбаром написано «Фильтры», под чипами «Выбрать все», «Сбросить», «Найдено: 125».
- [ ] URL: `http://localhost:3000/` (без параметров).

- [ ] **Step 3: Toggle одного чипа**

Кликнуть на чип «Бумага».

Проверить:
- [ ] Чип «Бумага» стал серым (`bg-gray-200`).
- [ ] URL стал `?f=plastic,glass,metal,batteries,electronics,tetrapak,textile,lamps,caps,tires,hazardous,other` (12 категорий).
- [ ] Счётчик «Найдено» уменьшился (точно сколько — зависит от данных, но должно быть < 125).

- [ ] **Step 4: Сбросить и выбрать все**

Кликнуть «Сбросить».

- [ ] Все чипы серые.
- [ ] URL стал `?f=` (после `?` явно пустая `f`).
- [ ] Счётчик «Найдено: 0», маркеров на карте нет.

Кликнуть «Выбрать все».

- [ ] Все чипы снова закрашены.
- [ ] URL очистился до `/`.
- [ ] Счётчик «Найдено: 125».

- [ ] **Step 5: Drag/zoom карты**

Перетащить карту на ~200px вправо, дождаться ~500ms.

- [ ] URL получил `?ll=...&z=11` (или `?ll=...` если `z` дефолтный).
- [ ] Drag не вызывает дрожание URL — он обновляется один раз через ~300ms после остановки.

- [ ] **Step 6: Открыть shared-ссылку**

В новой вкладке открыть `http://localhost:3000/?f=batteries&ll=59.9386,30.3141&z=14`.

Expected:
- [ ] Карта открылась в указанном центре с зумом 14.
- [ ] Только чип «Батарейки» активен (закрашен оранжевым), остальные 12 серые.
- [ ] Счётчик «Найдено» показывает количество точек с категорией «батарейки».

- [ ] **Step 7: Кнопка «Назад» браузера**

В этой вкладке (после shared-URL):
1. Кликнуть пару раз на разные чипы (toggle).
2. Поперетаскивать карту.
3. Нажать «Назад» в браузере.

Expected: предыдущее состояние URL (тот state что был до последнего изменения). История содержит **тоько разумные** изменения, не каждый пиксель drag'а.

- [ ] **Step 8: Mobile smoke-test (<768px)**

Открыть DevTools → Responsive mode → 375×667 (iPhone SE).

- [ ] Сайдбар скрыт.
- [ ] Под header — `<details>` с надписью «🎯 Фильтры (13)» (если все включены, скобки могут отсутствовать) и «Найдено: 125 ▾».
- [ ] Tap по summary → раскрывается, видны все 13 чипов.
- [ ] Tap чип «Стекло» → стал серым, счётчик в шапке `<details>` обновился (например «🎯 Фильтры (12) · Найдено: 110 ▾»).
- [ ] URL `?f=plastic,paper,metal,...` (12 без glass).
- [ ] Стрелочка `▾` повернута на 180° (открытое состояние).
- [ ] Tap по summary снова → `<details>` закрывается. Стрелочка вернулась.

- [ ] **Step 9: ESC и keyboard nav**

Открыть `<details>` (Tab → Enter на summary).

- [ ] Tab по чипам — focus-ring (зелёный) виден.
- [ ] Enter/Space на чипе — toggle работает.
- [ ] ESC — `<details>` закрывается (нативное поведение).

- [ ] **Step 10: Регрессионная проверка попапа**

На зуме 15 кликнуть по любому одиночному маркеру.

- [ ] Открывается попап с фото (если есть), названием, бейджами категорий, часами, телефоном, описанием — как в Phase C.
- [ ] Закрытие попапа крестиком работает.

- [ ] **Step 11: Если что-то не работает**

Возможные проблемы и фиксы:
- Чипы не рендерятся / пустой сайдбар → проверить console на ошибки nuqs/`<NuqsAdapter>`.
- URL не обновляется при кликах на чип → проверить, что `setFractions(...)` вызывается; возможно ошибка типов в HomeClient.
- Drag карты вызывает дрожь URL → debounce 300ms не работает; проверить `MapEventsBridge` mount/unmount.
- При открытии shared-URL карта не сдвигается → проверить `MapView` useEffect (возможно `lastApplied.current` инициализирован тем же значением что props).
- На mobile стрелочка не крутится → проверить CSS `details[open] > summary .filter-arrow`.

Итеративно фиксим, перезапускаем dev, повторяем тест.

- [ ] **Step 12: Остановить dev**

`Ctrl+C`. Никаких git-изменений в этой задаче.

---

## Task 10: Деплой и прод-верификация

**Интерактивно с автором.**

- [ ] **Step 1: Push в main**

```bash
git push origin main
```

GitHub Actions запускает workflow `deploy.yml`.

- [ ] **Step 2: Дождаться зелёного workflow**

```bash
gh run watch --workflow deploy.yml --exit-status
```

Или открыть `https://github.com/victorovi4/recyclemap-spb/actions` и дождаться зелёной галки (~1.5 минуты).

- [ ] **Step 3: Прод-чеклист**

Открыть https://bbaosmjuhscbpji6n847.containers.yandexcloud.net и пройти **тот же** smoke-чеклист, что в Task 9 (Steps 2-10).

Дополнительно:
- [ ] Скопировать ссылку с фильтром (например `?f=batteries`) и открыть в incognito-вкладке — карта должна показать ту же фильтрацию.
- [ ] Проверить `/admin` — дашборд работает (Phase A/B регрессия).

- [ ] **Step 4: Если на проде проблема**

- Регрессия только на проде, не локально → почти наверняка env (см. `.github/workflows/deploy.yml`, проверь YDB_ENDPOINT, YDB_DATABASE).
- Если совсем плохо → откат: `git revert HEAD~7..HEAD; git push` (отменит коммиты Phase D-1, фронт вернётся к чекбоксам).

---

## Task 11: Обновить документацию

**Files:**
- Modify: `docs/superpowers/specs/2026-04-22-recyclemap-spb-full-design.md` (отметить D-1 как закрытую)
- Modify: `CHANGELOG.md` (новая версия)

- [ ] **Step 1: Обновить Phase D row в `full-design.md` фазовой таблице**

Найти строку:

```
| **D** | UX-клон (чипы, сайдбар, URL-стейт, маршруты, share, bottom-sheet) | 25–30 | Полный UX recyclemap.ru |
```

Заменить на:

```
| **D** ◔ | UX-клон recyclemap.ru. Часть 1 (чипы + URL-стейт + mobile drawer) ✅ закрыта 2026-04-28. Части 2 (сайдбар точки) и 3 (маршруты/share/`/point/:id`) — впереди. | 25–30 | Полный UX recyclemap.ru |
```

(Кружочек `◔` означает «частично завершено».)

- [ ] **Step 2: Дополнить `CHANGELOG.md`**

Заменить текущую секцию `[Unreleased]` следующим (вставляется выше всех старых версий, [Unreleased] остаётся как placeholder):

```markdown
## [Unreleased] — следующая фаза

_Phase D, часть 2: сайдбар точки / bottom-sheet (vaul) / `/point/:id` route._

---

## [0.4.0-phase-d-1] — 2026-04-28 — Чипы + URL-стейт

**Итог мини-фазы:** карта стала **shareable** — пользователь может выбрать категории, отпанорамировать в нужный район, скопировать URL и поделиться. Получатель ссылки откроет ту же карту с тем же фильтром, центром и зумом. На мобильном фильтры теперь доступны через нативный `<details>` под header.

### Added

- `lib/url-state.ts` — три парсера для `nuqs`: `fractionsParser` (массив category id через запятую), `llParser` (`lat,lng` с 4 знаками после запятой, валидация диапазонов), `zoomParser` (целое 8..18). Плюс `sanitizeFractions()` — отбрасывает невалидные id.
- `components/CategoryChip.tsx` — пресентационный filled-чип с `aria-pressed`, фокус-ring через `focus-visible`, фон через инлайн-style (`category.color`).
- `components/MobileFilterDrawer.tsx` — нативный `<details>` со счётчиком выбранных категорий и точек в шапке. Виден только на `<md`.
- `components/MapView.tsx` — `useMap()` + useEffect: применяет внешние `center`/`zoom` props к Leaflet через `setView(.., { animate: false })`. `lastApplied` ref защищает от петли URL → карта → URL.
- `components/MapEventsBridge.tsx` — `useMapEvents({ moveend })` с debounce 300ms; колбэк отдаёт округлённые координаты в HomeClient.
- `nuqs@^2.8` (новая зависимость, ~5 KB).
- `<NuqsAdapter>` обёртка в `app/layout.tsx`.
- 17 юнит-тестов в `lib/url-state.test.ts` (round-trip, граничные случаи, мусорные значения, валидация id'шников).

### Changed

- `components/HomeClient.tsx` полностью переписан: `useState` → 3 `useQueryState` hook'а из nuqs. Layout — `flex-col md:flex-row` с двумя FilterPanel (mobile drawer + desktop sidebar). Передаёт `center`/`zoom`/`onMoveEnd` в Map.
- `components/FilterPanel.tsx` — `<input type=checkbox>` → `<CategoryChip>` во `flex-wrap`. Принимает те же props.
- `components/Map.tsx`, `components/MapInner.tsx` — добавлены props `center`, `zoom`, `onMoveEnd`. Внутри `<MapContainer>` теперь `<MapView>` и `<MapEventsBridge>`.
- `app/globals.css` — стили `details[open] > summary .filter-arrow { transform: rotate(180deg) }` для крутящейся стрелочки на мобиле.

### Поведение URL

| Состояние | URL |
|---|---|
| Все 13 категорий, дефолтный вид | `/` |
| Только пластик и стекло, дефолтный вид | `/?f=plastic,glass` |
| Ничего не выбрано | `/?f=` |
| Все 13, центр на Невском, зум 13 | `/?ll=59.9311,30.3609&z=13` |
| Только батарейки, в Колпино, зум 14 | `/?f=batteries&ll=59.7508,30.5969&z=14` |

### Решения, отступившие от full-design.md

- **Чипы в сайдбаре, не сверху.** В full-design было размытое «фильтры (280px)»; на брейншторме D-1 решили сохранить колоночный layout — на чипах с emoji+text оба варианта выглядят OK, а сохранение текущей структуры экономит работу.
- **Короткие имена параметров** `f`/`ll`/`z` вместо `fractions`/`lat=&lng=`/`zoom`. URL компактнее в шаринге, конкретные имена в спеке зафиксированы.
- **Mobile через native `<details>`**, не bottom-sheet с `vaul`. Vaul придёт в D-2 вместе с сайдбаром деталей точки. `<details>` — нулевая сложность, нулевые библиотеки, accessible из коробки.

### Gotchas и уроки

1. **`nuqs` `parseAsArrayOf(parseAsString, ",")` без `.withDefault(null)` различает `null` (параметра нет) и `[]` (явный `?f=`).** Это и нужно для нашего поведения «нет параметра = все включены».
2. **`router.replace` (`history: "replace"`) обязателен.** Иначе каждый drag карты добавлял бы entry в browser history, и кнопка «Назад» дёрнула бы ESC по истории по точке за раз.
3. **`MapView` без `lastApplied` ref** — петля URL ↔ карта на первом же drag'e: setView запустит moveend, который запишет тот же URL, который снова триггерит useEffect.
4. **300ms debounce на moveend** — компромисс. <100ms — URL мерцает; >500ms — заметная задержка при шаринге.
5. **Tailwind v4 не имеет `group-open:` варианта** — нативный `<details>` управляется через CSS `details[open] > summary > .filter-arrow`. В globals.css.

### Ключевые коммиты

```
2c0b852 docs: Phase D-1 design — chips + URL state
... (12 коммитов имплементации, заполнятся при выполнении плана)
```

---
```

⚠️ Проверь: блок `## [0.3.0-phase-c]` ниже остаётся неизменным.

- [ ] **Step 3: Commit и push**

```bash
git add docs/superpowers/specs/2026-04-22-recyclemap-spb-full-design.md CHANGELOG.md
git commit -m "docs: Phase D-1 closed — chips + URL state shipped"
git push origin main
```

(Доки-only коммит, дождаться зелёного деплоя — но критичной разницы для прода нет.)

- [ ] **Step 4: Phase D-1 закрыта**

Проверочные критерии (spec §8):
- [ ] Чипы заменили чекбоксы; 13 чипов в сайдбаре, filled-стиль, эмодзи + текст.
- [ ] `?f=...` синхронизировано в обе стороны.
- [ ] `?ll=lat,lng&z=N` синхронизировано в обе стороны.
- [ ] Кнопка «Назад» не накапливает каждый drag.
- [ ] На mobile есть `<details>` под header; сайдбар скрыт.
- [ ] Локально и на проде — все шаги smoke-теста зелёные.
- [ ] Все 46 тестов Phase B/C продолжают проходить, новые юниты на парсеры зелёные (всего 63).
- [ ] CHANGELOG обновлён, full-design.md отмечает D-1 как закрытую часть Phase D.

🎉 Готово. Следующая мини-фаза — Phase D-2 (сайдбар точки + bottom-sheet через vaul + `/point/:id`).
