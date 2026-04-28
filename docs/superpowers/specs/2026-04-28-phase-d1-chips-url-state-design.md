# Phase D, часть 1 — Чипы + URL-стейт

**Дата:** 2026-04-28
**Автор:** Дмитрий Иоффе (через Claude)
**Статус:** утверждён к разработке
**Относится к:** [2026-04-22-recyclemap-spb-full-design.md](2026-04-22-recyclemap-spb-full-design.md) — Phase D
**Замещает в Phase D:** только первую часть (чипы, URL-стейт, мобильный триггер). Сайдбар точки, маршруты, share, `/point/:id` — будут отдельными мини-фазами D-2 и D-3.

---

## 1. Цель и scope

### Цель
Превратить публичную часть сайта в shareable-карту: пользователь может выбрать категории, отпанорамировать карту в нужный район — и поделиться этой ссылкой. На стороне получателя ссылка откроет ту же карту с теми же фильтрами и тем же центром/зумом.

### В scope
- **Чипы вместо чекбоксов** в фильтре категорий. Filled-стиль, фон активного = `category.color`, неактивный = `bg-gray-200`. Эмодзи + текст. 13 чипов во `flex-wrap` в колонке-сайдбаре 240px.
- **URL ↔ state синхронизация** через библиотеку [`nuqs`](https://nuqs.47ng.com/):
  - `?f=plastic,glass,paper` — список выбранных категорий (отсутствует, если выбраны все 13).
  - `?ll=59.94,30.31` — центр карты (lat,lng через запятую, 4 знака после точки = ~10м).
  - `?z=11` — целочисленный zoom (диапазон 8–18).
- **`router.replace`** при смене URL (не `push`) — чтобы кнопка «Назад» в браузере не накапливала каждое движение карты.
- **Debounce 300ms** на обновление `ll`/`z` после `moveend` Leaflet-карты.
- **Мобильный триггер** через нативный `<details>` под header. Виден только на `<md` (`md:hidden`), сайдбар скрывается на мобиле как сейчас. Внутри `<details>` — тот же `FilterPanel` со счётчиком и кнопками.
- **Защита от мусорных URL:** парсеры валидируют `f` против списка известных `CategoryId`, `ll` парсится как два валидных числа, `z` clamp'ится в 8–18. Невалидные значения тихо отбрасываются.

### Не в scope
- **Сайдбар деталей точки / `<vaul>` bottom-sheet** — Phase D-2.
- **`/point/:id` route** — Phase D-2.
- **Кнопка «Маршрут» / share-кнопка / deep-link на Яндекс.Карты** — Phase D-3.
- **Сохранение URL-состояния через NextAuth-redirect** (например, при логине в админку) — out of scope, проверим вручную.
- **Smooth-анимация перехода чипа из off → on** — не трогаем, переход через `transition-colors` хватает.
- **Кастомный иконка кластера** (сейчас бирюзовый дефолт) — не трогаем, возможно в Phase D-2 как кустарная задача.

### Аудитория и контекст
- Жители Петербурга, ищущие куда сдать вторсырьё. Часть из них откроет ссылку, присланную в мессенджере.
- Мобильный трафик — основной. На узком экране должна быть **читаемая первая версия** фильтров без полноценного bottom-sheet.

### Оценка
**~10–12 часов.** Большая часть — URL ↔ карта синхронизация и тесты. Чипы как UI — простые.

---

## 2. Архитектура

### 2.1. Поток данных

```
┌──────────────────────────────────────┐
│  app/page.tsx (RSC, force-dynamic)   │
│  - fetchAllPoints()                  │
│  - fetchAllCategories()              │
│  - render <HomeClient ... />         │
└──────────────────┬───────────────────┘
                   │ props: points, categories
                   ▼
┌──────────────────────────────────────┐
│  HomeClient (Client Component)       │
│                                      │
│  3 nuqs hooks:                       │
│   useQueryState("f", fractionsParser)│
│   useQueryState("ll", llParser)      │
│   useQueryState("z", zoomParser)     │
│                                      │
│  filteredPoints = useMemo(...)       │
│                                      │
│  Layout:                             │
│   <MobileFilterDrawer> (md:hidden)   │
│     <FilterPanel ... />              │
│   <aside hidden md:flex>             │
│     <FilterPanel ... />              │
│   <Map center={...} zoom={...}       │
│        onMoveEnd={...} />            │
└──────────────────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────┐
│  Map → MapInner                      │
│                                      │
│  <MapContainer center zoom>          │
│    <MapView center zoom />           │ (внутр. setView когда props меняются)
│    <MapEventsBridge onMoveEnd />     │ (debounced moveend → up)
│    <TileLayer ... />                 │
│    <MarkerClusterGroup>              │
│      {points.map(...)}               │
│    </MarkerClusterGroup>             │
│  </MapContainer>                     │
└──────────────────────────────────────┘
```

### 2.2. Парсеры URL (`lib/url-state.ts`)

```ts
import {
  parseAsArrayOf,
  parseAsString,
  parseAsInteger,
  createParser,
} from "nuqs";
import type { CategoryId } from "./types";

const VALID_CATS: ReadonlySet<CategoryId> = new Set([
  "plastic", "glass", "paper", "metal", "batteries", "electronics",
  "tetrapak", "textile", "lamps", "caps", "tires", "hazardous", "other",
]);

const COMMON = { history: "replace" as const, shallow: true };

// fractions: "plastic,glass" → ["plastic","glass"]; null если параметра нет.
// Невалидные id молча отбрасываем.
export const fractionsParser = parseAsArrayOf(parseAsString, ",")
  .withOptions(COMMON)
  // По умолчанию nuqs возвращает [] для "?f=" — нам нужно различать null vs []
  // (null = все включены; [] = ничего). Это поведение сохраняется
  // если просто не вызывать .withDefault(...).
  ;

// ll: "59.94,30.31" → [59.94, 30.31]; null если невалидно или отсутствует.
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

// z: целое 8..18; null если вне диапазона или невалидно.
export const zoomParser = createParser({
  parse(v: string): number | null {
    const n = parseInt(v, 10);
    if (!Number.isFinite(n)) return null;
    if (n < 8 || n > 18) return null;
    return n;
  },
  serialize(v: number): string {
    return String(v);
  },
}).withOptions(COMMON);

// Постфильтрация невалидных category id.
// Применяется в HomeClient после useQueryState.
export function sanitizeFractions(arr: string[] | null): CategoryId[] | null {
  if (arr === null) return null;
  return arr.filter((x): x is CategoryId => VALID_CATS.has(x as CategoryId));
}
```

### 2.3. Default-state логика

```ts
// HomeClient.tsx
const [rawFractions, setFractions] = useQueryState("f", fractionsParser);
const sanitized = useMemo(() => sanitizeFractions(rawFractions), [rawFractions]);

const selectedSet = useMemo<Set<CategoryId>>(() => {
  // null (параметра нет) → все 13 включены
  // [] (явно пустой) → ничего не выбрано
  // [...] → как есть
  return sanitized === null
    ? new Set(allCategoryIds)
    : new Set(sanitized);
}, [sanitized, allCategoryIds]);
```

При изменении выбора:

```ts
function toggle(id: CategoryId) {
  const next = new Set(selectedSet);
  if (next.has(id)) next.delete(id);
  else next.add(id);

  if (next.size === allCategoryIds.length) {
    // Все 13 → очищаем URL (null = все)
    setFractions(null);
  } else {
    setFractions([...next]);
  }
}

function selectAll() { setFractions(null); }
function reset()     { setFractions([]); }
```

### 2.4. URL ↔ карта синхронизация

**Поток URL → карта** (внешнее изменение через ссылку или кнопку «Назад»):

```tsx
function MapView({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap();
  const lastApplied = useRef({ center, zoom });

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

`lastApplied` — защита от петли: при каждой записи через onMoveEnd сохраняем что мы записали, и если `props.center/zoom` совпадает с последним записанным — `setView` не вызываем.

**Поток карта → URL** (пользователь панорамирует/зумит):

```tsx
function MapEventsBridge({ onMoveEnd }: {
  onMoveEnd: (center: [number, number], zoom: number) => void;
}) {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const map = useMapEvents({
    moveend: () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        const c = map.getCenter();
        onMoveEnd(
          [Math.round(c.lat * 10000) / 10000, Math.round(c.lng * 10000) / 10000],
          map.getZoom(),
        );
      }, 300);
    },
  });

  useEffect(() => () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }, []);

  return null;
}
```

300ms debounce — компромисс: достаточно быстро, чтобы URL обновлялся «живо», и достаточно медленно, чтобы не мусорить URL при swipe-панораме.

### 2.5. Default координаты при отсутствии URL

- `ll` отсутствует → центр СПб `[59.9386, 30.3141]` (из текущего `MapInner`).
- `z` отсутствует → `11`.

В HomeClient:

```ts
const [llRaw, setLL] = useQueryState("ll", llParser);
const [zRaw, setZ] = useQueryState("z", zoomParser);

const center: [number, number] = llRaw ?? [59.9386, 30.3141];
const zoom: number = zRaw ?? 11;
```

При первом панорамировании от пользователя `setLL(...)` запишет URL → дефолты больше не сработают.

---

## 3. UI/UX

### 3.1. Чип категории (`components/CategoryChip.tsx`)

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

- `<button>`, не `<input type="checkbox">` спрятанный за label — чище семантика и keyboard-управление.
- `aria-pressed` для screen-reader'ов.
- `focus-visible:ring-2 ring-emerald-500` — keyboard-фокус виден, click-фокус — нет.
- Активный фон через инлайн-style (Tailwind не поддерживает динамические значения цвета через class).

### 3.2. FilterPanel (`components/FilterPanel.tsx` — переписан)

```
┌─ Фильтры ────────────────┐
│  [📄 Бумага] [🧴 Пластик] │  ← flex-wrap, gap 6px
│  [🍾 Стекло] [🥫 Металл]  │
│  ...                      │
│  [Выбрать все] [Сбросить] │  ← существующие кнопки
│  Найдено: 87              │  ← счётчик
└───────────────────────────┘
```

Один и тот же `<FilterPanel>` рендерится:
- В desktop-сайдбаре `<aside class="hidden md:flex w-60 ...">` (как сейчас).
- Внутри `<MobileFilterDrawer>` (видим только на mobile).

Принимает:
```ts
type Props = {
  categories: PublicCategory[];
  selected: Set<CategoryId>;
  onToggle: (id: CategoryId) => void;
  onSelectAll: () => void;
  onReset: () => void;
  pointCount: number;
};
```

### 3.3. MobileFilterDrawer (`components/MobileFilterDrawer.tsx` — новый)

```tsx
"use client";

type Props = {
  selectedCount: number;
  pointCount: number;
  children: React.ReactNode;
};

export default function MobileFilterDrawer({
  selectedCount, pointCount, children,
}: Props) {
  return (
    <details className="md:hidden bg-white border-b border-gray-200 group">
      <summary className="flex items-center justify-between px-4 py-3 cursor-pointer list-none">
        <span className="font-medium text-sm">
          🎯 Фильтры
          {selectedCount < 13 && (
            <span className="ml-1 text-emerald-700">({selectedCount})</span>
          )}
        </span>
        <span className="text-xs text-gray-500">
          Найдено: {pointCount}
          <span className="ml-2 group-open:rotate-180 inline-block transition-transform">
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

- `list-none` убирает дефолтный треугольник браузера.
- `group-open:rotate-180` — Tailwind v4 group-state селектор крутит стрелочку при открытии.
- `(N)` показывается только когда выбрано **меньше** 13 (когда все — лишнее).
- Шапка содержит «Найдено: 87» — даже без раскрытия фильтров видно сколько точек на карте.

### 3.4. HomeClient layout

```tsx
return (
  <div className="flex flex-col flex-1 min-h-0">
    {/* Mobile-only: details со списком чипов под header */}
    <MobileFilterDrawer
      selectedCount={selectedSet.size}
      pointCount={filteredPoints.length}
    >
      <FilterPanel ... />
    </MobileFilterDrawer>

    <div className="flex flex-1 min-h-0">
      {/* Desktop-only sidebar */}
      <aside className="hidden md:flex md:flex-col w-60 shrink-0
                        border-r border-gray-200 p-4 overflow-y-auto bg-white">
        <FilterPanel ... />
      </aside>

      <section className="flex-1">
        <Map
          points={filteredPoints}
          categories={categories}
          center={center}
          zoom={zoom}
          onMoveEnd={(c, z) => { setLL(c); setZ(z); }}
        />
      </section>
    </div>
  </div>
);
```

Sidebar и MobileFilterDrawer показывают **тот же** `<FilterPanel>` — взаимоисключающее отображение через CSS `md:hidden` / `hidden md:flex`.

### 3.5. Поведение «Сбросить все»

Когда пользователь нажимает «Сбросить» внутри открытого `<details>` на mobile:
- Все 13 чипов становятся неактивными → `pointCount` = 0.
- Стрелка остаётся в раскрытом положении (`<details open>`), пользователь видит результат своего действия.
- URL: `?f=` (явный пустой массив).
- Если затем нажать «Выбрать все» — URL очищается, все чипы становятся активными.

### 3.6. Accessibility

- Чипы — `<button>` с `aria-pressed`, Tab-навигация работает.
- `focus-visible:ring-2` — фокус виден при keyboard, не лезет глаза при клике.
- ESC закрывает `<details>` — нативное поведение HTML.
- Контраст: filled-чип (белый текст на ярком фоне) — все 13 цветов проверены ≥4.5:1 для основного текста по WCAG AA.

---

## 4. Файлы

### 4.1. Создаются

| Файл | Назначение |
|---|---|
| `lib/url-state.ts` | Парсеры nuqs (fractions/ll/z), валидация id'шников и координат |
| `lib/url-state.test.ts` | Юнит-тесты на парсеры (round-trip, граничные случаи) |
| `components/CategoryChip.tsx` | Презентационный компонент, filled-стиль |
| `components/CategoryChip.test.tsx` | RTL-тест на active/inactive/click (если RTL установится без боли) |
| `components/MobileFilterDrawer.tsx` | Обёртка `<details>` |
| `components/MapEventsBridge.tsx` | `useMapEvents({ moveend })` с debounce |
| `components/MapView.tsx` | `setView(center, zoom)` при изменении props извне |

### 4.2. Меняются

| Файл | Что меняется |
|---|---|
| `app/page.tsx` | Без логических изменений (RSC + props в HomeClient) |
| `app/layout.tsx` | Оборачивает children в `<NuqsAdapter>` |
| `components/HomeClient.tsx` | useState → 3 useQueryState; добавляются `<MobileFilterDrawer>` и центр/зум-стейт; layout `flex-col md:flex-row` |
| `components/FilterPanel.tsx` | Чекбоксы → flex-wrap of `<CategoryChip>` |
| `components/Map.tsx` | Пробрасывает новые props `center`, `zoom`, `onMoveEnd` в MapInner |
| `components/MapInner.tsx` | `<MapView>`, `<MapEventsBridge>` внутри `<MapContainer>`; `MapContainer center={center} zoom={zoom}` управляется снаружи |
| `package.json` | + `nuqs` (~5KB) |

### 4.3. Не трогаются
- `lib/ydb-points.ts`, `lib/categories.ts`, `lib/types.ts`
- `components/PointPopup.tsx`, `components/Header.tsx`
- `app/admin/*`, `app/api/*`
- Все 46 тестов от Phase B/C должны остаться зелёными.

### 4.4. Зависимости
- `+ nuqs` (^2.0+, последняя стабильная для Next.js 16)
- `+ @testing-library/react`, `+ @testing-library/jest-dom`, `+ jsdom` (devDeps) — **только если** мы решаем писать React-юниты для CategoryChip. Если решаем не писать, экономим эти deps. Решение приму на старте плана: попробую установить, если ставится без drama — оставлю; если конфликт с React 19 — пропущу (тогда тестируем чип только в smoke).

---

## 5. Тесты

### 5.1. Юнит-тесты

**`lib/url-state.test.ts`** (5–7 кейсов):
1. `fractionsParser.parse("plastic,glass")` → `["plastic", "glass"]`.
2. `fractionsParser.parse("plastic,evil-id,glass")` после `sanitizeFractions` → `["plastic", "glass"]`.
3. `fractionsParser.parse("")` → `[]` (отличается от `null`).
4. `llParser.parse("59.94,30.31")` → `[59.94, 30.31]`.
5. `llParser.parse("garbage")` → `null`.
6. `llParser.parse("99,200")` → `null` (вне диапазона широты/долготы).
7. `zoomParser.parse("11")` → `11`. `parse("99")` → `null` (вне 8–18).

**`components/CategoryChip.test.tsx`** (если RTL поставлен) (3 теста):
1. `<CategoryChip active={true} ... />` — `aria-pressed="true"`, инлайн `backgroundColor` совпадает с `category.color`.
2. `<CategoryChip active={false} ... />` — `aria-pressed="false"`, есть класс `bg-gray-200`.
3. Click → вызывается `onClick`.

**Без юнит-теста:**
- `MapEventsBridge` — debounce-логика с fake timers возможна, но boilerplate большой и сценарий простой; проверим в smoke-тесте.
- `MapView` — `useMap()` зависит от Leaflet-контекста, мокать тяжело; smoke-тест.
- `MobileFilterDrawer` — нативный `<details>`, тестируем визуально.

### 5.2. Smoke-тест локально

После имплементации, локально через `npm run dev`:

**Desktop (≥768px):**
1. Открыть `/` — все 13 чипов активны (закрашены), URL = `/`, найдено 125.
2. Снять чип «Бумага» → URL = `?f=plastic,glass,metal,batteries,electronics,tetrapak,textile,lamps,caps,tires,hazardous,other`, счётчик уменьшился.
3. Снять все остальные чипы по очереди → когда все 13 сняты, URL = `?f=`, маркеров нет, счётчик 0.
4. Нажать «Выбрать все» → URL очистился до `/`, счётчик 125, все чипы активны.
5. Drag карты на 200px вправо → через ~300ms URL получил `&ll=...&z=...`. URL не дёргается во время самого drag'а.
6. Нажать «Назад» в браузере → карта вернулась в исходное положение (но фильтр останется как был — кнопка «Назад» откатывает один шаг URL).
7. Открыть в новой вкладке `/?f=batteries&ll=59.94,30.31&z=14` — карта в нужной точке/зуме, активен только чип «Батарейки».

**Mobile (<768px, через DevTools responsive):**
8. Сайдбар скрыт. Под header — `<details>` с надписью «🎯 Фильтры (13) · Найдено: 125 ▾».
9. Tap по summary → раскрывается, видны чипы.
10. Tap чип «Стекло» → стал серым, счётчик уменьшился, URL `?f=plastic,paper,...,other` (12 категорий).
11. Tap по summary снова → закрывается. Стрелочка повернулась.
12. Tap «Сбросить» → все чипы серые, счётчик 0, URL `?f=`.
13. ESC при открытом `<details>` → закрывается (нативное поведение HTML).

**Accessibility:**
14. Tab по чипам — фокус виден через `ring-emerald-500`.
15. Enter/Space на чипе — toggle.

### 5.3. Прод-чеклист (после деплоя)

Тот же smoke-тест, на https://bbaosmjuhscbpji6n847.containers.yandexcloud.net.

**Без регрессий:**
- Phase C попап (фото, иконки, 13 категорий) работает — клик по маркеру открывает попап.
- Кластеры на zoom 11 видны.
- `/admin` дашборд продолжает работать.
- `/api/cron/import-rsbor` не сломан (последний weekly-импорт принесёт N точек как обычно).

---

## 6. Риски

| Риск | Вероятность | Митигация |
|---|---|---|
| `nuqs` несовместим с Next.js 16 / React 19 | низкая | Активно поддерживается, есть в стеке full-design.md; если ломается — fallback к vanilla `useSearchParams + router.replace` (~+2ч работы, типы руками). |
| Петля URL → карта → URL → ... | средняя | `lastApplied` ref в `MapView`. При имплементации первым делом проверим что drag/zoom не мусорит URL бесконечно. |
| Debounce 300ms неудобен (URL обновляется заметно поздно) | низкая | Если жалуемся при smoke-тесте — снизим до 200ms. |
| `<details>` некрасиво анимируется на iOS Safari | низкая | iOS Safari нормально открывает/закрывает; стрелочка `▾` крутится через CSS transform. |
| RTL (testing-library) ломает с React 19 | средняя | Попробуем установить; если не пойдёт — пропускаем юнит-тесты для CategoryChip, проверяем визуально. |
| Слишком много чипов в одну строку на узком десктопе | средняя | Sidebar 240px, чипы flex-wrap → они переходят на новую строку при необходимости. На очень узком (<320px) сайдбар скрыт совсем. |
| Контраст белого текста на ярком цветном фоне | низкая | Все 13 цветов из YDB протестированы (Phase B палитра РСбор) — контраст ≥4.5:1. Если для какой-то категории не проходит — добавим тёмную обводку. |
| URL длиной как война и мир | низкая | Максимум: `?f=plastic,glass,paper,metal,batteries,electronics,tetrapak,textile,lamps,caps,tires,hazardous,other&ll=59.9386,30.3141&z=11` ≈ 175 байт. Браузеры держат до 8KB. Не блокер. |

---

## 7. Открытые вопросы (на старт плана)

- **Точное имя пакета** для `nuqs` Next.js adapter (`<NuqsAdapter>` или `NuqsAdapter` из main package — уточним при `npm install`).
- **`@testing-library/react@latest`** vs другая версия — выбор по совместимости с React 19. Если первый install упирается в peer-deps — `--legacy-peer-deps` или пропустим.
- **`<details>` на iOS Safari** ведёт себя слегка иначе (например, не анимирует автоматически). Smoke-тест на iOS-ish viewport покажет.

---

## 8. Успех мини-фазы

Фаза закрыта, когда:

1. ✅ Чипы заменили чекбоксы; 13 чипов в сайдбаре, filled-стиль, эмодзи + текст.
2. ✅ `?f=...` синхронизировано: меняешь чип → URL меняется, открываешь URL → чипы закрашены.
3. ✅ `?ll=lat,lng&z=N` синхронизировано: пан/зум → URL обновляется через 300ms; открываешь URL → карта в нужной точке.
4. ✅ Кнопка «Назад» в браузере не накапливает каждое движение карты (history: replace).
5. ✅ На mobile под header есть `<details>` с теми же чипами; сайдбар скрыт.
6. ✅ Локально и на проде — все шаги smoke-теста зелёные.
7. ✅ Все 46 тестов Phase B/C продолжают проходить, новые юниты на парсеры зелёные.
8. ✅ CHANGELOG обновлён, минимально обновлён full-design.md (отметить D-1 как закрытую часть Phase D).

**Релиз-готовность:** мини-фаза даёт **shareable** ссылки на любые срезы карты. Это полпути к UX recyclemap.ru. Остальные части (сайдбар точки, маршруты, `/point/:id`) — отдельными мини-фазами D-2/D-3.

---

## 9. Следующий шаг

После утверждения этой спеки — `superpowers:writing-plans` для создания `docs/superpowers/plans/2026-04-28-phase-d1-chips-url-state.md` с tasks-чеклистом.
