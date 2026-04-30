# Phase D-2 — Point Details Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Заменить Leaflet-balloon полноценным сайдбаром деталей (десктоп) и bottom-sheet через `vaul` (мобильный), с прямой URL-ссылкой `?p=<point-id>` через `nuqs`. Открыл точку → можно поделиться ссылкой; auto-pan карты на точку с zoom ≥14.

**Architecture:** `HomeClient` владеет `?p=` стейтом через 4-й `useQueryState`. Через `points.find` получает `selectedPoint`, рендерит **оба** обёрточных компонента (`PointDetailsSidebar` для desktop с slide-in, `PointDetailsSheet` через vaul для mobile) — CSS-классами `hidden md:block` / `md:hidden` они разводятся по экранам. Контент общий (`PointDetails`). `MapView` расширяется prop'ом `forcePoint`: при наличии — вызывает `setView` с `animate: true` и `zoom = max(current, 14)`, защита от петли через `lastApplied.current.key`. Leaflet `<Popup>` удаляется; клик `<Marker>` через `eventHandlers` зовёт `onPointClick(id)` → `setP(id)`.

**Tech Stack:** Next.js 16 RSC + Client Components · TypeScript · Tailwind v4 · `nuqs@^2.8` · `vaul@^1.1` (новая зависимость) · `react-leaflet@5` + `leaflet.markercluster` · vitest для юнитов.

**Spec:** [docs/superpowers/specs/2026-04-29-phase-d2-point-details-design.md](../specs/2026-04-29-phase-d2-point-details-design.md)

---

## File Structure

**Создаются:**
- `components/PointDetails.tsx` — презентационная панель (контент: фото/название/адрес/бэйджи/часы/тел/сайт/описание + крестик закрытия).
- `components/PointDetailsSidebar.tsx` — desktop overlay 360px справа со slide-in анимацией.
- `components/PointDetailsSheet.tsx` — mobile bottom-sheet через `vaul.Drawer` со snap-точками `[0.4, 0.92]`.

**Меняются:**
- `lib/url-state.ts` — добавляется `pointParser` (одна строка через `parseAsString`).
- `lib/url-state.test.ts` — добавляются 2 теста для `pointParser`.
- `components/MapView.tsx` — добавляется prop `forcePoint`; единый `lastApplied.current.key` защищает от петли в обоих режимах.
- `components/Map.tsx` — добавляются props `onPointClick`, `forcePoint`, проброс в MapInner.
- `components/MapInner.tsx` — удаляется `<Popup>` и его импорт; `<Marker>` получает `eventHandlers={{ click }}`; `<MapView>` получает `forcePoint`.
- `components/HomeClient.tsx` — добавляется 4-й `useQueryState("p")`, `selectedPoint`, `categoryById`, `forcePoint` derived value, useEffect для очистки невалидного id, ESC keydown listener, рендер `<PointDetailsSidebar>` (внутри section карты) и `<PointDetailsSheet>` (вне layout).
- `package.json`, `package-lock.json` — добавляется `vaul`.
- `docs/superpowers/specs/2026-04-22-recyclemap-spb-full-design.md` — отметка о закрытии D-2.
- `CHANGELOG.md` — новая версия `[0.5.0-phase-d-2]`.

**Удаляются:**
- `components/PointPopup.tsx` — контент переезжает в `PointDetails.tsx`. Удаляем после того, как все импорты переключены на новый компонент (Task 8).

---

## Task 1: Установить `vaul` + добавить `pointParser`

**Files:**
- Modify: `package.json`, `package-lock.json`
- Modify: `lib/url-state.ts`
- Modify: `lib/url-state.test.ts`

- [ ] **Step 1: Установить `vaul`**

```bash
npm install vaul
```

Expected: `vaul@^1.1.x` (например `1.1.2`) добавлен в `dependencies`. Никаких peer-warnings про React 19 (vaul их поддерживает).

- [ ] **Step 2: Написать failing-тесты для `pointParser`**

Открой `lib/url-state.test.ts`. В конец файла (после блока `describe("zoomParser", ...)`) добавь:

```ts
import { pointParser } from "./url-state";

describe("pointParser", () => {
  it("parses string id", () => {
    expect(pointParser.parse("rsbor-1234")).toBe("rsbor-1234");
  });
  it("parses any non-empty string", () => {
    expect(pointParser.parse("manual-foo-59.9")).toBe("manual-foo-59.9");
  });
});
```

⚠️ Удали отдельный `import { pointParser }` если в верху файла уже есть `import { ... } from "./url-state"` — добавь `pointParser` в существующий импорт-блок. Если нет такого блока — оставь как separate import (vitest не возражает).

- [ ] **Step 3: Запустить тест — должен упасть**

Run: `npx vitest run lib/url-state.test.ts -t "pointParser"`
Expected: FAIL — `pointParser is not exported from "./url-state"`.

- [ ] **Step 4: Реализовать `pointParser` в `lib/url-state.ts`**

В конец файла (после `zoomParser`) добавить:

```ts
/**
 * pointParser — id выбранной точки. Просто string; реальная валидация
 * происходит в HomeClient через `points.find(p => p.id === pointId)`.
 * Невалидный id → setP(null) тихо очищает URL.
 */
export const pointParser = parseAsString.withOptions(COMMON);
```

⚠️ Убедись, что `parseAsString` уже импортирован в верху файла (он импортируется как часть `parseAsArrayOf(parseAsString, ",")`). Если по какой-то причине импорт неполный — добавь в существующий `import { ... } from "nuqs"` блок.

- [ ] **Step 5: Запустить тест — должен пройти**

Run: `npx vitest run lib/url-state.test.ts -t "pointParser"`
Expected: PASS, оба кейса.

- [ ] **Step 6: Прогон всех тестов и tsc**

Run: `npm test && npx tsc --noEmit`
Expected: всё зелёное. Должно быть **65 тестов** (63 + 2 новых).

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json lib/url-state.ts lib/url-state.test.ts
git commit -m "feat(phase-d-2): add vaul + pointParser for ?p= URL state"
```

Sign with: `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.

---

## Task 2: Компонент `PointDetails` (общий контент)

**Files:**
- Create: `components/PointDetails.tsx`

(Юнит-тестов не пишем — пресентационный компонент, проверяется в smoke-тесте Task 9.)

- [ ] **Step 1: Создать `components/PointDetails.tsx`**

```tsx
"use client";

import type { PublicPoint, PublicCategory, CategoryId } from "@/lib/types";

type Props = {
  point: PublicPoint;
  categoryById: Map<CategoryId, PublicCategory>;
  onClose: () => void;
};

export default function PointDetails({ point, categoryById, onClose }: Props) {
  const sortedCats = point.categoryIds
    .map((id) => categoryById.get(id))
    .filter((c): c is PublicCategory => c !== undefined)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div className="relative h-full overflow-y-auto p-4">
      <button
        type="button"
        onClick={onClose}
        aria-label="Закрыть"
        className="absolute right-3 top-3 w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-600 z-10 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
      >
        ×
      </button>

      {point.photoUrl && (
        <img
          src={point.photoUrl}
          alt=""
          className="w-full h-40 object-cover rounded mb-3"
          loading="lazy"
        />
      )}

      <h2 className="font-semibold text-lg mb-1 pr-8">{point.name}</h2>
      <p className="text-sm text-gray-700 mb-3">{point.address}</p>

      <div className="flex flex-wrap gap-1 mb-3">
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
        <div className="mb-2 text-sm">
          <span className="text-gray-500">Часы:</span> {point.hours}
        </div>
      )}
      {point.phone && (
        <div className="mb-2 text-sm">
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
        <div className="mb-2 text-sm">
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
        <div className="mt-3 text-sm text-gray-700">{point.description}</div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Прогон tsc**

Run: `npx tsc --noEmit`
Expected: clean (компонент пока никем не используется, типы должны резолвиться).

- [ ] **Step 3: Прогон тестов**

Run: `npm test`
Expected: 65 тестов (без regressions).

- [ ] **Step 4: Commit**

```bash
git add components/PointDetails.tsx
git commit -m "feat(phase-d-2): PointDetails component (shared content for sidebar+sheet)"
```

---

## Task 3: Компонент `PointDetailsSidebar` (desktop)

**Files:**
- Create: `components/PointDetailsSidebar.tsx`

- [ ] **Step 1: Создать `components/PointDetailsSidebar.tsx`**

```tsx
"use client";

import type { PublicPoint, PublicCategory, CategoryId } from "@/lib/types";
import PointDetails from "./PointDetails";

type Props = {
  point: PublicPoint | null;
  categoryById: Map<CategoryId, PublicCategory>;
  onClose: () => void;
};

/**
 * Desktop sidebar — overlay поверх правой части карты, ширина 360px.
 * Slide-in анимация через transform: translateX. Виден только на ≥md
 * через `hidden md:block`. Когда point=null — sidebar остаётся в DOM,
 * но сдвинут вправо за пределы видимости (`translate-x-full`).
 */
export default function PointDetailsSidebar({
  point,
  categoryById,
  onClose,
}: Props) {
  return (
    <aside
      className={
        "hidden md:block absolute right-0 top-0 bottom-0 w-[360px] bg-white " +
        "shadow-[-4px_0_12px_rgba(0,0,0,0.1)] transition-transform duration-300 ease-out " +
        "z-[1000] " +
        (point ? "translate-x-0" : "translate-x-full")
      }
      aria-hidden={!point}
    >
      {point && (
        <PointDetails
          point={point}
          categoryById={categoryById}
          onClose={onClose}
        />
      )}
    </aside>
  );
}
```

- [ ] **Step 2: Прогон tsc + тестов**

Run: `npx tsc --noEmit && npm test`
Expected: clean. 65 тестов зелёные.

- [ ] **Step 3: Commit**

```bash
git add components/PointDetailsSidebar.tsx
git commit -m "feat(phase-d-2): PointDetailsSidebar (desktop overlay with slide-in)"
```

---

## Task 4: Компонент `PointDetailsSheet` (mobile)

**Files:**
- Create: `components/PointDetailsSheet.tsx`

- [ ] **Step 1: Создать `components/PointDetailsSheet.tsx`**

```tsx
"use client";

import { Drawer } from "vaul";
import type { PublicPoint, PublicCategory, CategoryId } from "@/lib/types";
import PointDetails from "./PointDetails";

type Props = {
  point: PublicPoint | null;
  categoryById: Map<CategoryId, PublicCategory>;
  onClose: () => void;
};

/**
 * Mobile bottom-sheet через vaul. Snap-точки [0.4, 0.92] — peek и full.
 * Закрывается свайпом вниз ниже peek (vaul вызывает onOpenChange(false)).
 * На десктопе скрыт через md:hidden (overlay и content) — vaul не рендерит
 * Portal-элементы когда open=false.
 */
export default function PointDetailsSheet({
  point,
  categoryById,
  onClose,
}: Props) {
  return (
    <Drawer.Root
      open={point !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      snapPoints={[0.4, 0.92]}
      defaultSnap={0.4}
    >
      <Drawer.Portal>
        <Drawer.Overlay className="md:hidden fixed inset-0 bg-black/20 z-[1001]" />
        <Drawer.Content className="md:hidden fixed bottom-0 left-0 right-0 z-[1002] bg-white rounded-t-xl flex flex-col max-h-[92vh]">
          <Drawer.Title className="sr-only">
            {point?.name ?? "Точка приёма"}
          </Drawer.Title>
          <div className="mx-auto w-10 h-1 bg-gray-300 rounded-full my-2 shrink-0" />
          <div className="flex-1 overflow-y-auto">
            {point && (
              <PointDetails
                point={point}
                categoryById={categoryById}
                onClose={onClose}
              />
            )}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
```

⚠️ `Drawer.Title` нужен для accessibility (vaul/Radix-pattern). `sr-only` скрывает визуально, оставляя для screen-reader'ов.

- [ ] **Step 2: Прогон tsc + тестов**

Run: `npx tsc --noEmit && npm test`
Expected: clean. 65 тестов зелёные.

- [ ] **Step 3: Commit**

```bash
git add components/PointDetailsSheet.tsx
git commit -m "feat(phase-d-2): PointDetailsSheet (mobile bottom-sheet via vaul)"
```

---

## Task 5: Расширить `MapView` prop'ом `forcePoint`

**Files:**
- Modify: `components/MapView.tsx`

- [ ] **Step 1: Полностью заменить `components/MapView.tsx`**

```tsx
"use client";

import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";

type Props = {
  center: [number, number];
  zoom: number;
  forcePoint: { lat: number; lng: number } | null;
};

/**
 * Применяет внешние center/zoom к карте. Если задан forcePoint, имеет
 * приоритет: setView на координаты точки с zoom = max(current, 14)
 * и animate: true (плавный pan).
 *
 * Защита от петли URL ↔ карта:
 *   `lastApplied.current.key` — единый строковый ключ для обоих режимов.
 *   Если ключ совпадает с предыдущим — setView НЕ вызывается.
 *
 * Сценарий открытия точки:
 *   1. Пользователь кликает маркер → setP(id) → forcePoint появляется.
 *   2. MapView вызывает setView({ animate: true }), карта плавно едет.
 *   3. После анимации Leaflet генерит moveend → MapEventsBridge через 300ms
 *      пишет ?ll&z в URL.
 *   4. На следующем рендере MapView видит ТОТ ЖЕ forcePoint → key не
 *      изменился → setView не вызывается. Петли нет.
 *   5. Пользователь нажимает × → setP(null) → forcePoint станет null →
 *      MapView переключается на view-mode. center/zoom уже актуальные
 *      (Leaflet знает свою позицию), так что setView будет no-op либо
 *      минимальная перерисовка без анимации.
 */
export default function MapView({ center, zoom, forcePoint }: Props) {
  const map = useMap();
  const lastApplied = useRef<{ key: string }>({ key: "" });

  useEffect(() => {
    if (forcePoint) {
      const newZoom = Math.max(map.getZoom(), 14);
      const key = `pt:${forcePoint.lat},${forcePoint.lng},${newZoom}`;
      if (lastApplied.current.key === key) return;
      lastApplied.current.key = key;
      map.setView([forcePoint.lat, forcePoint.lng], newZoom, {
        animate: true,
      });
      return;
    }
    const key = `view:${center[0]},${center[1]},${zoom}`;
    if (lastApplied.current.key === key) return;
    lastApplied.current.key = key;
    map.setView(center, zoom, { animate: false });
  }, [center, zoom, forcePoint, map]);

  return null;
}
```

⚠️ Не запускай tsc сейчас — ниже по цепочке `MapInner` пока не передаёт `forcePoint`. Это исправится в Task 6.

- [ ] **Step 2: Commit (без tsc)**

```bash
git add components/MapView.tsx
git commit -m "feat(phase-d-2): MapView accepts forcePoint with auto-pan + zoom"
```

---

## Task 6: `MapInner` без `<Popup>`, с `eventHandlers` и `forcePoint`

**Files:**
- Modify: `components/Map.tsx`
- Modify: `components/MapInner.tsx`

⚠️ **ВАЖНО:** после этой задачи `Map.tsx` будет требовать новые props (`onPointClick`, `forcePoint`), но `HomeClient` их пока не передаёт — будет TypeScript-ошибка. Это **ожидаемо**: Task 7 фиксит HomeClient. **НЕ запускай tsc после Task 6** — он покажет ошибку в HomeClient.

- [ ] **Step 1: Обновить `components/Map.tsx`**

Полностью заменить содержимое:

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
  onPointClick: (id: string) => void;
  forcePoint: { lat: number; lng: number } | null;
};

export default function Map(props: Props) {
  return <MapInner {...props} />;
}
```

- [ ] **Step 2: Обновить `components/MapInner.tsx`**

Полностью заменить содержимое:

```tsx
"use client";

import {
  MapContainer,
  TileLayer,
  Marker,
  AttributionControl,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import MarkerClusterGroup from "react-leaflet-cluster";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import type { PublicPoint, PublicCategory, CategoryId } from "@/lib/types";
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
  onPointClick: (id: string) => void;
  forcePoint: { lat: number; lng: number } | null;
};

export default function MapInner({
  points,
  categories,
  center,
  zoom,
  onMoveEnd,
  onPointClick,
  forcePoint,
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
      <MapView center={center} zoom={zoom} forcePoint={forcePoint} />
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
              eventHandlers={{ click: () => onPointClick(p.id) }}
            />
          );
        })}
      </MarkerClusterGroup>
    </MapContainer>
  );
}
```

⚠️ Что изменилось:
1. Удалён импорт `Popup` из `react-leaflet` и `PointPopup` из `./PointPopup`.
2. `<Marker>` больше не имеет `<Popup>` внутри — это самозакрывающийся тег.
3. `<Marker>` получает `eventHandlers={{ click: () => onPointClick(p.id) }}`.
4. `<MapView>` получает `forcePoint={forcePoint}`.
5. Props расширены: `onPointClick`, `forcePoint`.

- [ ] **Step 3: Commit (БЕЗ tsc — HomeClient ещё не обновлён)**

```bash
git add components/Map.tsx components/MapInner.tsx
git commit -m "feat(phase-d-2): MapInner removes <Popup>, adds eventHandlers + forcePoint"
```

---

## Task 7: `HomeClient` — `?p=`, `selectedPoint`, ESC, рендер sidebar+sheet

**Files:**
- Modify: `components/HomeClient.tsx`

- [ ] **Step 1: Полностью заменить `components/HomeClient.tsx`**

```tsx
"use client";

import { useEffect, useMemo } from "react";
import { useQueryState } from "nuqs";
import type { PublicCategory, PublicPoint, CategoryId } from "@/lib/types";
import {
  fractionsParser,
  llParser,
  zoomParser,
  pointParser,
  sanitizeFractions,
} from "@/lib/url-state";
import Map from "@/components/Map";
import FilterPanel from "@/components/FilterPanel";
import MobileFilterDrawer from "@/components/MobileFilterDrawer";
import PointDetailsSidebar from "@/components/PointDetailsSidebar";
import PointDetailsSheet from "@/components/PointDetailsSheet";

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

  const categoryById = useMemo(
    () => new Map<CategoryId, PublicCategory>(categories.map((c) => [c.id, c])),
    [categories],
  );

  const [rawFractions, setFractions] = useQueryState("f", fractionsParser);
  const [llRaw, setLL] = useQueryState("ll", llParser);
  const [zRaw, setZ] = useQueryState("z", zoomParser);
  const [pointId, setPoint] = useQueryState("p", pointParser);

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

  // Текущая выбранная точка — null если ?p= нет в URL ИЛИ id невалиден.
  const selectedPoint = useMemo(
    () => (pointId ? points.find((p) => p.id === pointId) ?? null : null),
    [points, pointId],
  );

  // Тихая очистка невалидного ?p= (например, точку удалили из импорта)
  useEffect(() => {
    if (pointId && !selectedPoint) {
      setPoint(null);
    }
  }, [pointId, selectedPoint, setPoint]);

  // ESC закрывает sidebar/sheet на десктопе. (Vaul сам ловит ESC для шита.)
  useEffect(() => {
    if (!pointId) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPoint(null);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [pointId, setPoint]);

  const center: [number, number] = llRaw ?? DEFAULT_CENTER;
  const zoom: number = zRaw ?? DEFAULT_ZOOM;
  const forcePoint = selectedPoint
    ? { lat: selectedPoint.lat, lng: selectedPoint.lng }
    : null;

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

  const onPointClick = (id: string) => {
    setPoint(id);
  };

  const onCloseDetails = () => {
    setPoint(null);
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
        {/* Desktop-only sidebar (filters) */}
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

        {/* Карта + desktop point details sidebar (overlay) */}
        <section className="flex-1 relative">
          <Map
            points={filteredPoints}
            categories={categories}
            center={center}
            zoom={zoom}
            onMoveEnd={onMoveEnd}
            onPointClick={onPointClick}
            forcePoint={forcePoint}
          />
          <PointDetailsSidebar
            point={selectedPoint}
            categoryById={categoryById}
            onClose={onCloseDetails}
          />
        </section>
      </div>

      {/* Mobile bottom-sheet — снаружи layout, использует Portal */}
      <PointDetailsSheet
        point={selectedPoint}
        categoryById={categoryById}
        onClose={onCloseDetails}
      />
    </div>
  );
}
```

- [ ] **Step 2: Прогон tsc и тестов**

Run: `npx tsc --noEmit && npm test`
Expected: clean. 65 тестов зелёные.

⚠️ Если tsc жалуется на `PointPopup` где-то — это нормально, мы удалим его в Task 8.

- [ ] **Step 3: Commit**

```bash
git add components/HomeClient.tsx
git commit -m "feat(phase-d-2): HomeClient owns ?p= state + sidebar/sheet rendering"
```

---

## Task 8: Удалить `PointPopup.tsx` (legacy)

**Files:**
- Delete: `components/PointPopup.tsx`

- [ ] **Step 1: Убедиться что нигде нет импортов `PointPopup`**

Run: `grep -rn "PointPopup" app components lib scripts || true`
Expected: пусто. Если результат не пустой — STOP, разберись где импорт.

- [ ] **Step 2: Удалить файл**

```bash
git rm components/PointPopup.tsx
```

- [ ] **Step 3: Прогон tsc и тестов**

Run: `npm test && npx tsc --noEmit`
Expected: всё зелёное. 65 тестов.

- [ ] **Step 4: Commit**

```bash
git commit -m "chore(phase-d-2): retire PointPopup.tsx (replaced by PointDetails)"
```

---

## Task 9: Smoke-тест локально

**Интерактивно с автором.** Subagent должен запустить dev-сервер и попросить автора прокликать чек-лист.

**Files:** только верификация.

- [ ] **Step 1: Подготовить env и запустить dev**

```bash
pkill -f "next dev" 2>/dev/null; pkill -f "next-server" 2>/dev/null; sleep 1
export YDB_ACCESS_TOKEN_CREDENTIALS=$(yc iam create-token)
export YDB_ENDPOINT="grpcs://ydb.serverless.yandexcloud.net:2135"
export YDB_DATABASE="/ru-central1/b1gllfcopm13aodjgmkb/etnsnfn8f18mv9mjomar"
export NEXTAUTH_URL="http://localhost:3000"
export NEXTAUTH_SECRET="$(openssl rand -hex 32)"
export AUTH_SECRET="$NEXTAUTH_SECRET"
export AUTH_URL="$NEXTAUTH_URL"
export AUTH_TRUST_HOST=true
rm -rf .next
GRPC_DNS_RESOLVER=native nohup npm run dev > /tmp/d2-smoke.log 2>&1 &
```

Дождись `Ready in <Xms>` в логе.

- [ ] **Step 2: Desktop — открыть сайдбар через клик маркера**

Открыть http://localhost:3000.

Проверить:
- [ ] URL = `/`. Сайдбар деталей не виден (off-screen справа).
- [ ] Кликнуть на любой маркер.
- [ ] URL получил `?p=...`. Сайдбар выехал справа с анимацией.
- [ ] Карта плавно сцентрировалась на точке. Если изначальный zoom был < 14 — поднялся до 14.
- [ ] В сайдбаре: фото (если есть), название, адрес, цветные бэйджи с иконками РС, часы (если есть), телефон (кликабельный), сайт (ссылка), описание, крестик `×` в правом верхнем углу.

- [ ] **Step 3: Desktop — закрытие через `×` и ESC**

- [ ] Клик `×` → сайдбар уехал, URL очистился от `?p=`. Карта осталась в текущем положении.
- [ ] Кликнуть другой маркер → сайдбар открыт. Нажать ESC → сайдбар закрылся, URL очистился.
- [ ] Кликнуть маркер. Кликнуть по карте мимо маркера (на пустое место) → сайдбар **остаётся открытым** (правильно по дизайну).

- [ ] **Step 4: Desktop — переключение между точками**

- [ ] При открытом сайдбаре кликнуть другой маркер → контент сайдбара сменился, карта плавно сцентрировалась на новой точке.

- [ ] **Step 5: Desktop — shared URL**

Открыть в новой вкладке (любая видимая точка с `rsbor-` префиксом подходит — посмотри один id через DevTools или возьми из существующего сайдбара):

```
http://localhost:3000/?p=rsbor-37990&f=plastic
```

(Если `rsbor-37990` нет в БД — попробуй `manual-konteyner-spasibo-na-gorohovoy-59.9261` или любой другой id точки.)

Expected:
- [ ] Сайдбар сразу с этой точкой.
- [ ] Чип «Пластик» активен (остальные 12 серые).
- [ ] Карта на zoom ≥14 на координатах точки.

- [ ] **Step 6: Desktop — невалидный `?p=`**

Открыть `http://localhost:3000/?p=evil-id-99999`.

Expected:
- [ ] Сайдбар не виден.
- [ ] URL автоматически очистился до `/` через ~1 рендер.

- [ ] **Step 7: Mobile — bottom-sheet через DevTools responsive**

Открыть DevTools → Responsive mode → 375×667 (iPhone SE).

- [ ] Сайдбар скрыт (через `hidden md:block`).
- [ ] Tap по маркеру → bottom-sheet выехал снизу на ~40% высоты экрана. Виден handle (узкий серый язычок), название, адрес, бэйджи, часы, телефон. Карта частично видна сверху.
- [ ] Свайп вверх по handle (drag mouse от handle вверх в DevTools) → шит расширяется до ~92%. Видно фото, описание полностью.
- [ ] Свайп вниз → возврат на 40%.
- [ ] Tap `×` (внутри content) → шит закрылся, URL очистился.
- [ ] Открыть снова → tap drag вниз ниже 40% → шит закрылся.

- [ ] **Step 8: Регрессия Phase D-1**

- [ ] Чипы фильтров работают (toggle, select all, reset).
- [ ] Drag/zoom карты обновляет `?ll&z`.
- [ ] Mobile filter drawer (`<details>` под header) работает.

- [ ] **Step 9: Регрессия Phase A/B/C**

- [ ] `/admin` работает (вход через Яндекс).
- [ ] Кластеры на zoom 11 видны.
- [ ] Никаких ошибок в console (кроме nuqs/Leaflet warnings, если есть).

- [ ] **Step 10: Если что-то не работает**

Возможные проблемы и их фиксы:

- **Сайдбар не выезжает** → проверь class `translate-x-0` vs `translate-x-full` в `PointDetailsSidebar`. CSS работает через transform — может не перерисовать без `transition-transform`.
- **Двойная петля URL** (карта дёргается бесконечно при открытии точки) → `lastApplied.current.key` в MapView не обновляется; добавь логирование.
- **Bottom-sheet не открывается** → проверь импорт `Drawer` из `vaul`, и что vaul реально установлен (`npm ls vaul`).
- **Bottom-sheet открывается на десктопе** → пропущен `md:hidden` на `Drawer.Overlay` или `Drawer.Content`.
- **Авто-pan не работает** → проверь `forcePoint` в HomeClient (должен быть `{ lat, lng }` объект, не tuple).

- [ ] **Step 11: Остановить dev**

```bash
pkill -f "next dev" 2>/dev/null
```

Никаких git-изменений — только верификация.

---

## Task 10: Деплой и прод-верификация

**Интерактивно с автором.**

- [ ] **Step 1: Push в main**

```bash
git push origin main
```

- [ ] **Step 2: Дождаться зелёного workflow**

```bash
gh run watch --workflow deploy.yml --exit-status
```

Ожидание ~1.5 минуты.

- [ ] **Step 3: Прод-чеклист**

Открыть https://bbaosmjuhscbpji6n847.containers.yandexcloud.net и пройти **тот же** smoke-чеклист, что в Task 9 (Steps 2-9).

Дополнительно:
- [ ] Скопировать ссылку с `?p=...` и открыть в incognito-вкладке — сайдбар должен открыться сразу.
- [ ] `/admin` работает.

- [ ] **Step 4: Если на проде проблема**

- Регрессия только на проде, не локально → почти наверняка env (см. `.github/workflows/deploy.yml`, проверь YDB_ENDPOINT, YDB_DATABASE).
- Совсем плохо → откат: `git revert HEAD~8..HEAD; git push` (отменит коммиты Phase D-2).

---

## Task 11: Обновить документацию

**Files:**
- Modify: `docs/superpowers/specs/2026-04-22-recyclemap-spb-full-design.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Обновить Phase D row в `full-design.md` фазовой таблице**

Найти строку (она была обновлена в Phase D-1):

```
| **D** ◔ | UX-клон recyclemap.ru. Часть 1 (чипы + URL-стейт + mobile drawer) ✅ закрыта 2026-04-28. Части 2 (сайдбар точки) и 3 (маршруты/share/`/point/:id`) — впереди. | 25–30 | Полный UX recyclemap.ru |
```

Заменить на:

```
| **D** ◔ | UX-клон recyclemap.ru. Часть 1 (чипы + URL-стейт + mobile drawer) ✅ закрыта 2026-04-28. Часть 2 (сайдбар точки + bottom-sheet + ?p= URL) ✅ закрыта 2026-04-29. Часть 3 (маршруты/share) — впереди. | 25–30 | Полный UX recyclemap.ru |
```

- [ ] **Step 2: Дополнить `CHANGELOG.md`**

Прочитай текущий `CHANGELOG.md`. Заменить секцию `[Unreleased]`:

```markdown
## [Unreleased] — следующая фаза

_Phase D, часть 2: сайдбар точки / bottom-sheet (vaul) / `/point/:id` route._
```

на новый блок (новая [Unreleased] вверху + новая закрытая версия [0.5.0-phase-d-2] под ней). Старые версии (`[0.4.0-phase-d-1]`, `[0.3.0-phase-c]`, ...) остаются нетронутыми ниже.

```markdown
## [Unreleased] — следующая фаза

_Phase D, часть 3: кнопки «🗺 Маршрут (Яндекс/Google)» и «🔗 Поделиться» через native Web Share API._

---

## [0.5.0-phase-d-2] — 2026-04-29 — Детали точки + URL `?p=`

**Итог мини-фазы:** клик по маркеру теперь открывает полноценную панель деталей: сайдбар справа на десктопе (overlay 360px со slide-in анимацией) или bottom-sheet снизу на мобиле (vaul, 2 snap-точки 40%/92%). Прямые ссылки на точки через URL: `/?p=rsbor-1234` восстанавливает state, карта плавно центрируется на точке с zoom ≥14. Leaflet balloon убран — единый источник истины.

### Added

- `components/PointDetails.tsx` — общий пресентационный компонент (контент сайдбара/шита). Фото, название, адрес, бэйджи, часы, телефон-ссылка, сайт-ссылка, описание + крестик закрытия с `aria-label`.
- `components/PointDetailsSidebar.tsx` — desktop overlay 360px справа. Slide-in через `transition-transform`, всегда в DOM (управляется через `translate-x-0/full`), `aria-hidden` для accessibility.
- `components/PointDetailsSheet.tsx` — mobile bottom-sheet через `vaul.Drawer`. Snap-точки `[0.4, 0.92]`, default 0.4 (peek). `Drawer.Title` с `sr-only` для accessibility. Overlay `bg-black/20`.
- `lib/url-state.ts` + `pointParser` — `parseAsString.withOptions({ history: "replace", shallow: true })`.
- `vaul@^1.1` (новая зависимость, ~10 KB).
- 2 юнит-теста для `pointParser` в `lib/url-state.test.ts`.
- `useEffect` в HomeClient для тихой очистки невалидного `?p=` через `setPoint(null)`.
- `useEffect` в HomeClient для ESC keydown listener (закрывает sidebar/sheet на десктопе).

### Changed

- `components/MapView.tsx` — добавлен prop `forcePoint: { lat, lng } | null`. Когда задан — `setView` с `animate: true` и `zoom = max(currentZoom, 14)`. Защита от петли через единый `lastApplied.current.key` (строковый ключ, разный для force-режима и view-режима).
- `components/Map.tsx` + `components/MapInner.tsx` — добавлены props `onPointClick: (id: string) => void` и `forcePoint`. Проброс в MapView.
- `components/MapInner.tsx`:
  - **Удалён** Leaflet `<Popup>` и его импорт.
  - `<Marker>` теперь самозакрывающийся, получает `eventHandlers={{ click: () => onPointClick(p.id) }}`.
- `components/HomeClient.tsx`:
  - 4-й `useQueryState("p", pointParser)`.
  - `selectedPoint` через `points.find(p => p.id === pointId)`.
  - `categoryById` Map переехала из `MapInner` в `HomeClient` (передаётся в Sidebar и Sheet).
  - `forcePoint` derived value (передаётся в Map).
  - useEffect для очистки невалидного id и для ESC.
  - Рендер `<PointDetailsSidebar>` (внутри `<section>` карты, через `position: absolute`) и `<PointDetailsSheet>` (вне layout, через Portal vaul).

### Removed

- `components/PointPopup.tsx` — контент переехал в `PointDetails.tsx`. История в git.

### Поведение URL

| Состояние | URL |
|---|---|
| Точка открыта на карте | `/?p=rsbor-37990` |
| + сохраняются фильтры | `/?f=plastic,glass&p=rsbor-37990` |
| + сохраняется центр/зум | `/?p=rsbor-37990&ll=59.94,30.31&z=14` |
| Невалидный id (точку удалили) | автоматически чистится до `/` |
| Закрытие через × или ESC | `?p=` уходит, остальное остаётся |

### Решения, отступившие от full-design.md

- **`?p=<id>` через nuqs, не `/point/:id` route.** Семантически URL менее «честный» (это не отдельная страница, а параметр), но проще и автоматически сохраняет существующие `?f`/`?ll`/`?z`. Если в Phase G решим, что нужен SEO для отдельных страниц точек — добавим redirect-route поверх.
- **Auto-pan переопределяет `?ll/z` при наличии `?p=`.** Спека позволяла оба варианта — выбран более user-friendly: ссылка «эта точка» гарантирует что точка видна на карте, даже если из URL пришли другие координаты.
- **Один источник истины — сайдбар/шит, без Leaflet `<Popup>`.** На recyclemap.ru то же самое.
- **Без выделения активного маркера** (border/scale/glow) — отложено в D-3 или позже.

### Gotchas и уроки

1. **`vaul.Drawer.Title` с `sr-only` обязателен** для accessibility. Без него vaul выдаёт console warning. Если нет осмысленного заголовка — `<Drawer.Title className="sr-only">{point?.name ?? "Точка приёма"}</Drawer.Title>`.
2. **Защита от петли URL ↔ карта в MapView v2.** Использовать единый `key`-ref, а не отдельные refs для center/zoom и forcePoint. Иначе при переключении из view-режима в force-режим (открытие точки) refs из старого режима устаревают и петля возвращается.
3. **`md:hidden` на `Drawer.Overlay` И на `Drawer.Content`** — без второго vaul рендерит content в Portal даже на десктопе (хотя overlay скрыт), что не блокирует UI, но выглядит как утечка DOM-узлов.
4. **`eventHandlers={{ click }}` на `<Marker>` срабатывает и на тач-устройствах** — react-leaflet@5 транслирует tap в click. Если будут проблемы — добавить `touchend`.
5. **Свайп вниз ниже peek (40%) автоматически закрывает шит** — vaul внутренний механизм. Не надо ловить отдельно.

### Ключевые коммиты

```
549bf47 docs: Phase D-2 design — point details sidebar + bottom-sheet + URL
... (8 коммитов имплементации, заполнятся при выполнении плана)
```

---
```

⚠️ Проверь: блок `## [0.4.0-phase-d-1]` ниже остаётся неизменным.

- [ ] **Step 3: Commit и push**

```bash
git add docs/superpowers/specs/2026-04-22-recyclemap-spb-full-design.md CHANGELOG.md
git commit -m "docs: Phase D-2 closed — point details sidebar + bottom-sheet shipped"
git push origin main
```

(Доки-only коммит, дождаться зелёного деплоя — но критичной разницы для прода нет.)

- [ ] **Step 4: Phase D-2 закрыта**

Проверочные критерии (spec §8):
- [ ] Клик маркера на десктопе открывает сайдбар справа.
- [ ] Клик маркера на мобиле открывает bottom-sheet на 40%.
- [ ] URL содержит `?p=...` после открытия.
- [ ] Auto-pan на zoom ≥14 при открытии.
- [ ] Shared-URL `/?p=...` восстанавливает state.
- [ ] Невалидный `?p=...` тихо очищается.
- [ ] ESC и `×` закрывают; клик мимо — не закрывает.
- [ ] Кнопка «Назад» браузера закрывает сайдбар.
- [ ] 65 тестов зелёные.
- [ ] Прод-смок-тест зелёный.
- [ ] CHANGELOG и full-design.md обновлены.

🎉 Готово. Следующая мини-фаза — Phase D-3 (кнопки «Маршрут» и «Поделиться» прямо в сайдбаре/шите).
