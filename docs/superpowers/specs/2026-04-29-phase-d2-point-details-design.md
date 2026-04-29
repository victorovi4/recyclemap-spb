# Phase D, часть 2 — Детали точки: сайдбар + bottom-sheet + URL

**Дата:** 2026-04-29
**Автор:** Дмитрий Иоффе (через Claude)
**Статус:** утверждён к разработке
**Относится к:** [2026-04-22-recyclemap-spb-full-design.md](2026-04-22-recyclemap-spb-full-design.md) — Phase D
**Замещает в Phase D:** только вторую часть (детали точки, URL `?p=`, bottom-sheet, auto-pan). Кнопки «Маршрут» / «Поделиться» — Phase D-3.

---

## 1. Цель и scope

### Цель
Заменить тонкий Leaflet-balloon на полноценный сайдбар деталей (десктоп) и bottom-sheet (мобильный) с прямой ссылкой через URL. Открыл точку → можно поделиться `/?p=rsbor-1234` — у получателя автоматически откроется тот же сайдбар на той же координате.

### В scope
- **Desktop сайдбар деталей точки** — overlay поверх правой части карты, ширина 360px, slide-in-анимация через `transform: translateX`. Виден когда `?p=...` в URL.
- **Mobile bottom-sheet** через [`vaul`](https://vaul.emilkowal.ski/) — 2 snap-точки `[0.4, 0.92]`. Peek 40% даёт основные данные не закрывая карту, full 92% — всё включая фото и описание.
- **URL-параметр `?p=<point-id>`** через `nuqs.parseAsString`. Сохраняет существующие `?f=`, `?ll=`, `?z=` (history: replace).
- **Удаление Leaflet `<Popup>`**: клик по маркеру вызывает `setP(point.id)`, balloon не появляется. Один источник истины — сайдбар/шит.
- **Auto-pan карты на точку**: при появлении `?p=...` карта плавно (`animate: true`) центрирует на точке с zoom = `max(currentZoom, 14)` — переходит на улично-дворовый уровень.
- **`?ll/z` из URL переопределяется** при наличии `?p=`. Логика: shared-ссылка `/?p=rsbor-1234&ll=59.9&z=11` — пользователь хотел показать **точку**, а не указанные координаты. Карта едет на точку.
- **Закрытие**: крестик `×` в углу + ESC. Клик мимо (по карте) **не закрывает** — пользователь рассматривает соседние точки, не теряя открытую панель. Это поведение recyclemap.ru.
- **Невалидный `?p=evil-id`** → useEffect через `setP(null)` тихо очищает URL.
- Контент сайдбара/шита — тот же, что был в Phase C `<PointPopup>`: фото, название, адрес, бэйджи категорий с цветами и иконками РС, часы, телефон-ссылка, сайт-ссылка, описание.

### Не в scope (отложено)
- **Кнопки «🗺 Маршрут (Яндекс)»** и **«🗺 Маршрут (Google)»** — Phase D-3.
- **Кнопка «🔗 Поделиться»** через native Web Share API — Phase D-3.
- **Выделение активного маркера** на карте (border / scale / glow) — отложено в Phase D-3 или позже. В Phase D-2 маркер активной точки визуально не отличается.
- **Полный focus-trap** внутри сайдбара/шита — basic accessibility (Tab по ссылкам и кнопкам, ESC) есть, но не полный trap. Достаточно для MVP.
- **Анимация открытия сайдбара кастомная** — slide-in справа через `transition-transform` Tailwind хватает; не нужен framer-motion.
- **Тесты vaul-шита через RTL/jsdom** — vaul использует Portal и анимации, тестирование сложно. Покрываем smoke-тестом в Task 9.

### Аудитория и контекст
- Жители Петербурга, ищущие куда сдать вторсырьё. Сейчас (после Phase D-1) могут шарить ссылку «карта с фильтром на батарейки в моём районе». Phase D-2 даёт **«вот эта конкретная точка»** — следующий уровень шаринга.
- Мобильный трафик — основной. Bottom-sheet с двумя snap'ами обеспечивает: не закрыть карту совсем (peek 40%) **и** показать все детали (full 92%).

### Оценка
**~10 часов.** Большая часть — настройка vaul (новая библиотека, нужно убедиться что она работает с React 19) и логика auto-pan без петли URL ↔ карта.

---

## 2. Архитектура

### 2.1. Поток данных

```
URL                 HomeClient            MapInner            PointDetails*
────                ──────────            ────────            ─────────────
?p=rsbor-1234  ──▶  useQueryState("p") ──▶ forcePoint ──▶ map.setView(...)
                    points.find()
                    selectedPoint     ──────────────────▶ <PointDetailsSidebar>
                                                           <PointDetailsSheet>
                                            click ─────────┐
?p= ◀──── setP(id) ◀────────────────── onPointClick ──────┘

ESC ─▶ HomeClient.useEffect ─▶ setP(null)
×   ─▶ onClose ────────────────▶ setP(null)
```

**Ключевые точки:**

1. **HomeClient** — единственный владелец `?p=` стейта. Через `useQueryState("p", pointParser)` получает текущий `pointId`, через `points.find` строит `selectedPoint: PublicPoint | null`.
2. **`forcePoint`** — derived value: если `selectedPoint` есть, передаём `{ lat, lng }` в Map → MapInner → MapView. MapView применяет `setView` с приоритетом над обычными `center/zoom`.
3. **`onPointClick(id)`** — колбэк из MapInner в HomeClient. Срабатывает на клик `<Marker>`. Реализация: `setP(id)`.
4. **Закрытие** — два пути: ESC (HomeClient ловит `keydown`) и `×` (PointDetails вызывает `onClose` prop). Оба пути ведут к `setP(null)`.
5. **Mobile vs desktop** — рендерим **оба** компонента (`PointDetailsSidebar` и `PointDetailsSheet`) одновременно. CSS-классы `hidden md:block` / `md:hidden` разводят их по экранам. Это проще, чем JS-проверка `useIsMobile()`, и не вызывает мерцания при resize.

### 2.2. URL parser

`lib/url-state.ts` дополняется одной строкой:

```ts
import { parseAsString } from "nuqs";
// ... существующие парсеры (fractionsParser, llParser, zoomParser) ...

export const pointParser = parseAsString.withOptions(COMMON);
```

`parseAsString` встроенный в nuqs — парсит/сериализует строку как есть, `null` если параметра нет в URL. Реальная валидация id происходит в HomeClient через `points.find(p => p.id === pointId)`, где невалидный id ведёт к `selectedPoint = null` → useEffect очищает URL.

### 2.3. Auto-pan: MapView v2

Текущий `MapView` имеет один useEffect, синхронизирующий `props.center/zoom` → `map.setView(...)`. Расширяем prop'ом `forcePoint`:

```tsx
type Props = {
  center: [number, number];
  zoom: number;
  forcePoint: { lat: number; lng: number } | null;
};

export default function MapView({ center, zoom, forcePoint }: Props) {
  const map = useMap();
  const lastApplied = useRef<{ key: string }>({ key: "" });

  useEffect(() => {
    if (forcePoint) {
      const newZoom = Math.max(map.getZoom(), 14);
      const key = `pt:${forcePoint.lat},${forcePoint.lng},${newZoom}`;
      if (lastApplied.current.key === key) return;
      lastApplied.current.key = key;
      map.setView([forcePoint.lat, forcePoint.lng], newZoom, { animate: true });
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

**Почему это безопасно от петли URL ↔ карта:**

1. Пользователь кликает маркер: `setP(id)` → URL `?p=...`. `forcePoint` появляется → MapView вызывает `setView({ animate: true })`.
2. После анимации Leaflet генерит `moveend`. `MapEventsBridge` через 300ms debounce пишет `?ll&z`. URL: `?p=...&ll=...&z=...`.
3. На следующем рендере MapView видит **тот же** `forcePoint` (id точки не менялся), `lastApplied.current.key` совпадает → `setView` НЕ вызывается. Никакой петли.
4. Пользователь начинает перетаскивать карту вручную: `MapEventsBridge` пишет новые `ll/z`, но `forcePoint` остаётся (потому что `?p=` в URL). MapView в режиме force-mode → нет конфликта (он реагирует только на изменение forcePoint, а тот не меняется).
5. Пользователь нажимает `×`: `setP(null)` → `forcePoint` становится null. MapView переключается на ветку `else` (обычный view-mode), но `key` теперь `view:...`, новый — вызывается `setView` с текущими `center/zoom` из URL. **Однако** карта уже там (Leaflet знает свой текущий center/zoom), поэтому `setView` будет no-op либо мини-перерисовка без анимации. Не страшно.

### 2.4. Удаление Leaflet `<Popup>`

В `MapInner.tsx`:

- Импорт `Popup` из `react-leaflet` удаляется.
- Внутри `<Marker>` блок `<Popup>...</Popup>` удаляется.
- К `<Marker>` добавляется `eventHandlers={{ click: () => onPointClick(p.id) }}`.

Старый `<PointPopup>`-компонент **удаляется** из репозитория. Его контент переносится в новый `<PointDetails>`, который используется и в Sidebar, и в Sheet (DRY).

### 2.5. Mobile shipped via vaul

`vaul.Drawer.Root` управляется через `open` (boolean) — мы привязываем его к `selectedPoint !== null`:

```tsx
<Drawer.Root
  open={point !== null}
  onOpenChange={(open) => { if (!open) onClose(); }}
  snapPoints={[0.4, 0.92]}
  defaultSnap={0.4}
>
```

Когда vaul закрывает шит свайпом-вниз ниже 40% — `onOpenChange(false)` → `onClose()` → `setP(null)`. URL очистится автоматически.

`Drawer.Overlay` и `Drawer.Content` помечены `md:hidden` — на десктопе vaul-инфраструктура не рендерится в DOM (Portal не создаёт элементы, потому что `open=false` без shape; либо элементы создаются но скрыты CSS). В smoke-тесте Task 9 проверим что vaul на десктопе не мешает.

### 2.6. Невалидный `?p=`

```tsx
const [pointId, setPoint] = useQueryState("p", pointParser);

const selectedPoint = useMemo(
  () => (pointId ? points.find((p) => p.id === pointId) ?? null : null),
  [points, pointId],
);

useEffect(() => {
  if (pointId && !selectedPoint) {
    setPoint(null);
  }
}, [pointId, selectedPoint, setPoint]);
```

Сценарий: weekly-импорт удалил точку `rsbor-1234`. У пользователя в bookmarks остался URL `/?p=rsbor-1234`. При открытии: `pointId = "rsbor-1234"`, `selectedPoint = null` → useEffect стирает `?p=`. URL становится `/`. Пользователь видит обычную карту без сайдбара.

---

## 3. UI/UX

### 3.1. Desktop сайдбар

```
┌─ Map (flex-1, position: relative) ────────────────────────────┐
│                                                                │
│   ●●        ●            ●                  ┌──────────────┐ │
│      ●          ●                            │ × фото       │ │
│         ● ←active                            │              │ │
│                                              │ Экоцентр...  │ │
│                                              │ ул. Газовая  │ │
│                                              │ [Бум][Пл][Ст]│ │
│                                              │ Часы: ...    │ │
│                                              │ Тел: ...     │ │
│                                              │ Сайт         │ │
│                                              │ Описание...  │ │
│                                              └──────────────┘ │
│                                                360px wide      │
└────────────────────────────────────────────────────────────────┘
```

- **Контейнер**: `<aside class="hidden md:block absolute right-0 top-0 bottom-0 w-[360px] bg-white shadow-[-4px_0_12px_rgba(0,0,0,0.1)] z-[1000]">`.
- **Slide-in анимация**: `transition-transform duration-300 ease-out` + `translate-x-0` (открыт) / `translate-x-full` (закрыт). Сайдбар всегда в DOM (через `aria-hidden` управляется доступность).
- **Z-index 1000**: leaflet использует диапазон 400-700 (tile, marker, popup), кластеры — до 700. 1000 надёжно поверх.
- **Высота**: `top-0 bottom-0` — сайдбар занимает всю высоту секции карты.
- **Прокрутка**: `overflow-y-auto` на корне `<PointDetails>` — при длинном описании внутренняя прокрутка, а не растяжение сайдбара.

### 3.2. Mobile bottom-sheet

**Peek (40%):**
```
┌────────────────────┐
│  Header (фильтры)  │
├────────────────────┤
│                    │
│     ●●  ●          │
│        ● ←active   │  Карта видна
│   ●        ●       │
│                    │
├────────────────────┤  ← drag handle (узкий язычок)
│  Экоцентр «Сборка» │
│  ул. Газовая, 10   │
│  [Бум][Пл][Ст]     │
│  Пн-Пт 14-21       │
│  +7 905 ...        │
└────────────────────┘  ← 40% screen height
```

**Full (92%):**
```
┌────────────────────┐
│  Header (фильтры)  │
├────────────────────┤  ← карта видна ~8% сверху
│ ─── handle ──────  │
│  ┌─ фото ──────┐   │
│  │             │   │
│  └─────────────┘   │
│  Экоцентр «Сборка» │
│  Санкт-Петербург,  │
│  ул. Газовая, 10   │
│  [📄][🧴][🍾][🥫]  │
│  Часы: Пн–Пт 14–21,│
│  Сб–Вс 11–20       │
│  Тел: +7 905...    │
│  Сайт: ecosborka.ru│
│                    │
│  Принимают более   │
│  40 фракций... [↓] │
└────────────────────┘
```

- **Snap-точки**: `[0.4, 0.92]` (40% и 92% высоты viewport).
- **Default snap**: `0.4` (peek). При открытии маркера тапом — сразу 40%.
- **Drag handle**: серый язычок 40×4px по центру наверху, `mb-2`.
- **Закрытие свайпом-вниз**: vaul при попытке сделать snap ниже минимального (0.4) автоматически закрывает шит. Срабатывает `onOpenChange(false)`.
- **Overlay**: `bg-black/20` на полную высоту экрана **под** шитом. Делает карту немного затемнённой, давая фокус на шит. Tap по overlay — закрывает шит (vaul делает это автоматически).
- **Z-index**: overlay `z-[1001]`, content `z-[1002]`. Поверх mobile filter drawer (он `z-auto`, обычный flow).

### 3.3. Контент `PointDetails`

(Тот же, что был в Phase C `<PointPopup>`, минимально перерисованный под более широкий контейнер.)

```tsx
<div className="relative h-full overflow-y-auto p-4">
  <button onClick={onClose} aria-label="Закрыть"
          className="absolute right-3 top-3 w-8 h-8 rounded-full bg-gray-100
                     hover:bg-gray-200 flex items-center justify-center
                     text-gray-600 z-10">×</button>

  {point.photoUrl && (
    <img src={point.photoUrl} alt="" loading="lazy"
         className="w-full h-40 object-cover rounded mb-3" />
  )}

  <h2 className="font-semibold text-lg mb-1 pr-8">{point.name}</h2>
  <p className="text-sm text-gray-700 mb-3">{point.address}</p>

  <div className="flex flex-wrap gap-1 mb-3">
    {sortedCats.map(cat => (
      <span key={cat.id} ...style={{backgroundColor: cat.color}}>
        {cat.iconPath ? <img src={cat.iconPath} className="w-3 h-3 invert"/>
                       : <span>{cat.emoji}</span>}
        {cat.label}
      </span>
    ))}
  </div>

  {point.hours && <div>Часы: {point.hours}</div>}
  {point.phone && <a href={`tel:${point.phone}`}>{point.phone}</a>}
  {point.website && <a href={point.website} target="_blank">Сайт</a>}
  {point.description && <div>{point.description}</div>}
</div>
```

Изменения относительно `PointPopup`:
- Кнопка закрытия `×` в правом верхнем углу.
- Фото больше: `h-40` (160px) вместо `h-32` (128px).
- Заголовок крупнее: `text-lg` вместо `text-base`.
- `pr-8` на заголовке — чтобы текст не лез под кнопку закрытия.

### 3.4. Accessibility

- **Кнопка `×`**: `<button>` с `aria-label="Закрыть"`. Tab-фокус — фокус-ring через `focus-visible` (можно добавить, не критично).
- **`aria-hidden`** на сайдбаре когда закрыт: `<aside aria-hidden={!point}>`. Screen-reader не «слышит» спрятанный контент.
- **vaul автоматически** управляет focus при открытии шита (фокус идёт на handle), `Drawer.Title` (sr-only) — для ARIA.
- **ESC закрывает** на десктопе через listener в HomeClient. На мобиле vaul сам ловит ESC.
- **Tab** проходит по: ссылке-телефон, ссылке-сайт, кнопке `×`. Внутренних кнопок нет.

---

## 4. Файлы

### 4.1. Создаются

| Файл | Назначение |
|---|---|
| `components/PointDetails.tsx` | Презентационная панель (контент). Принимает `point`, `categoryById`, `onClose`. |
| `components/PointDetailsSidebar.tsx` | Desktop overlay-обёртка с slide-in анимацией. |
| `components/PointDetailsSheet.tsx` | Mobile bottom-sheet через `vaul.Drawer`. |

### 4.2. Меняются

| Файл | Что меняется |
|---|---|
| `lib/url-state.ts` | + `pointParser` (одна строка через `parseAsString`). |
| `components/HomeClient.tsx` | + 4-й `useQueryState("p", pointParser)`. + `selectedPoint` через `points.find`. + useEffect для очистки невалидного id. + ESC keydown listener. + рендер `<PointDetailsSidebar>` (внутри section карты) и `<PointDetailsSheet>` (вне layout). + `categoryById` Map (раньше строилась в MapInner — переносим). + `forcePoint` derived value. |
| `components/Map.tsx` | + props `onPointClick: (id: string) => void`, `forcePoint: { lat, lng } \| null`. Передаёт в MapInner. |
| `components/MapInner.tsx` | Удаляется `<Popup>` и его импорт. К `<Marker>` добавляется `eventHandlers={{ click: () => onPointClick(p.id) }}`. + проброс `forcePoint` в `<MapView>`. |
| `components/MapView.tsx` | + props `forcePoint: { lat, lng } \| null`. Логика useEffect расширяется: если `forcePoint`, делаем `setView` с `animate: true` и `zoom = max(current, 14)`. `lastApplied` сохраняет строковый ключ, единый для force-режима и view-режима. |
| `package.json` | + `vaul@^1.1.x`. |
| `app/globals.css` | (опционально) +5 строк CSS для `aside[aria-hidden=true]` если CSS-only fallback нужен. По умолчанию управляем через `translate-x-full` Tailwind-класс — отдельный CSS не нужен. |

### 4.3. Удаляются

| Файл | Почему |
|---|---|
| `components/PointPopup.tsx` | Контент переехал в `PointDetails.tsx`. Старый компонент использовался только в `<Popup>`, который мы убираем. |

### 4.4. Не трогаются

- `lib/types.ts`, `lib/ydb-points.ts`, `lib/categories.ts` — БД-слой не меняется.
- `components/CategoryChip.tsx`, `components/FilterPanel.tsx`, `components/MobileFilterDrawer.tsx` — Phase D-1 компоненты остаются.
- `components/MapEventsBridge.tsx`, `components/beadMarker.ts` — без изменений.
- `app/page.tsx`, `app/layout.tsx` — без изменений.
- Все тесты Phase B/C/D-1 (63 штуки) должны остаться зелёными.

### 4.5. Зависимости

- `+ vaul@^1.1.x` (~10 KB). React 19 поддерживается (peerDeps `^19.0.0`).

---

## 5. Тесты

### 5.1. Юнит-тесты

**`lib/url-state.test.ts`** — добавить 2 теста:

```ts
describe("pointParser", () => {
  it("parses string id", () => {
    expect(pointParser.parse("rsbor-1234")).toBe("rsbor-1234");
  });
  it("parses any non-empty string", () => {
    expect(pointParser.parse("manual-foo-59.9")).toBe("manual-foo-59.9");
  });
});
```

**Без юнитов на компоненты** — `PointDetails`/`Sidebar`/`Sheet` пресентационные. RTL-тесты vaul-Drawer'а сложны (Portal, focus, animations). MapView расширенная логика — сложно мокать `useMap`. Покрываем всё smoke-тестом в Task 9.

**Итого:** **65 тестов** (63 + 2 новых).

### 5.2. Smoke-тест локально

После имплементации, через `npm run dev` + Playwright:

**Desktop (≥768px):**
1. Открыть `/`. Сайдбар не виден (off-screen справа через `translate-x-full`).
2. Кликнуть маркер → URL `?p=...`, сайдбар выехал, карта плавно центрируется на точке (zoom поднялся до 14, если был ниже).
3. В сайдбаре: фото, название, адрес, цветные бэйджи с иконками, часы, телефон-ссылка, сайт-ссылка, описание, крестик `×`.
4. Click `×` → сайдбар уехал, URL очистился. Карта осталась в текущем положении.
5. ESC → закрытие как `×`.
6. Click по карте мимо маркера → сайдбар **остаётся открытым**.
7. Click второй маркер при открытом сайдбаре → контент сменился, auto-pan.
8. В новой вкладке `/?p=rsbor-1234&f=plastic` → сайдбар сразу с этой точкой, чип «Пластик» активен, карта на zoom ≥14.
9. Открыть `/?p=evil-id-99999` → сайдбар не виден, URL автоматически очистился до `/`.

**Mobile (<768px, DevTools responsive 375×667):**
10. Сайдбар скрыт (`hidden md:block`).
11. Tap маркер → шит выехал на 40%. Видно название/адрес/бэйджи/контакты, карта частично вверху.
12. Свайп вверх по handle → шит расширяется до 92%. Видно фото и полное описание.
13. Свайп вниз → возврат на 40%.
14. Tap `×` или свайп вниз ниже 40% → шит закрылся, URL очистился.
15. Tap другой маркер при открытом шите → контент сменился, snap остался.

**Регрессия Phase D-1:**
16. 13 чипов фильтра работают.
17. Drag/zoom карты обновляет `?ll&z`.
18. Mobile filter drawer (`<details>` под header) работает.

**Регрессия Phase A/B/C:**
19. `/admin` дашборд работает.
20. Кластеры на zoom 11.

**`npm test` — все 65 тестов зелёные.**

### 5.3. Прод-чеклист (Task 10)

Тот же smoke-сценарий на https://bbaosmjuhscbpji6n847.containers.yandexcloud.net.

---

## 6. Риски

| Риск | Вероятность | Митигация |
|---|---|---|
| `vaul` несовместим с React 19 / Next.js 16 | низкая | Peer-deps подтверждают `^19.0.0`; v1.1.x — последняя стабильная. Если runtime-ошибка — `--legacy-peer-deps` или fallback к нативному `<dialog>` с CSS-анимацией (~+3ч). |
| Петля URL ↔ карта при auto-pan | средняя | `lastApplied.current.key` в MapView (строковое сравнение). Smoke-тест Task 9 пункт 8 покрывает shared-URL. |
| Slide-in анимация сайдбара дёргается на медленных устройствах | низкая | `transition-transform duration-300 ease-out` — простая, GPU-ускоряется. Можно ускорить до 200ms если жалоба. |
| `Drawer.Overlay` затемняет карту даже при peek 40% | средняя | По умолчанию vaul покрывает overlay'ом всё, но при peek 40% карта частично видна — overlay делается полупрозрачным `bg-black/20`. Проверим визуально, при необходимости снизим до `bg-black/10`. |
| Z-index конфликт с MarkerClusterGroup | низкая | leaflet использует 400-700; cluster span внутри. Сайдбар `z-[1000]`, sheet `z-[1002]` — гарантированно выше. |
| `eventHandlers={{ click }}` не срабатывает на mobile (тач без полного click event) | низкая | `react-leaflet@5` нормально транслирует tap → click. Если станет проблемой — `eventHandlers={{ click, touchend }}`. |
| `useQueryState("p")` не очищается при невалидном id (race condition с другими useQueryState) | низкая | useEffect с зависимостями `[pointId, selectedPoint, setPoint]` гарантирует, что setPoint(null) вызывается только при наличии pointId без selectedPoint. |
| Контент сайдбара длинее экрана и не прокручивается | низкая | `overflow-y-auto` на корне `<PointDetails>` + `h-full` обёртка. |

---

## 7. Открытые вопросы (на старт плана)

- **Точная версия vaul** — `npm install vaul` возьмёт latest (1.1.2 на 2026-04-29), peer-deps подтверждены.
- **Snap-точки в `vaul`** — параметр `snapPoints={[0.4, 0.92]}` или `snapPoints={["40vh", "92vh"]}`. Уточним при имплементации; формат от 0 до 1 — как доли viewport — рекомендованный.
- **Mobile-overlay цвет** — начнём с `bg-black/20`, при необходимости подкрутим в smoke.

---

## 8. Успех мини-фазы

Фаза закрыта, когда:

1. ✅ Клик маркера на десктопе открывает сайдбар справа с slide-in.
2. ✅ Клик маркера на мобиле открывает bottom-sheet на 40%.
3. ✅ URL содержит `?p=...` после открытия точки и сохраняет существующие `?f`/`?ll`/`?z`.
4. ✅ Карта плавно (`animate: true`) центрирует на точке с zoom ≥14.
5. ✅ Shared-URL `/?p=...` восстанавливает state с правильным auto-pan.
6. ✅ Невалидный `?p=...` очищается автоматически.
7. ✅ ESC и `×` закрывают сайдбар/шит. Клик мимо — не закрывает.
8. ✅ Кнопка «Назад» в браузере закрывает сайдбар (через стандартный history rollback `?p=`).
9. ✅ Все 63 теста Phase B/C/D-1 + 2 новых = 65 проходят.
10. ✅ Прод-смок-тест зелёный.
11. ✅ CHANGELOG обновлён, full-design.md помечает D-2 закрытой.

**Релиз-готовность:** мини-фаза даёт **shareable-ссылки на конкретную точку**. Это важная возможность для продвижения проекта в соц-сетях и мессенджерах. Phase D-3 (маршрут + share-кнопка) станет естественным следующим шагом — из этого же сайдбара.

---

## 9. Следующий шаг

После утверждения этой спеки — `superpowers:writing-plans` для создания `docs/superpowers/plans/2026-04-29-phase-d2-point-details.md` с tasks-чеклистом.
