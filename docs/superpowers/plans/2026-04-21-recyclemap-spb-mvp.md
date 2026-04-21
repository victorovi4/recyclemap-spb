# RecycleMap СПб MVP — план реализации

> **Для agentic-воркеров:** REQUIRED SUB-SKILL — используйте `superpowers:subagent-driven-development` (рекомендуется) или `superpowers:executing-plans` для выполнения плана по шагам. Чекпойнты отмечены `- [ ]`.

**Цель:** Построить интерактивную карту ~30 пунктов приёма вторсырья в Санкт-Петербурге с фильтром по 8 категориям, задеплоить на Vercel.

**Архитектура:** Next.js 15 (App Router) + TypeScript + Tailwind, карта на Leaflet с `ssr:false` через `next/dynamic`, данные в статичных JSON в репозитории. Без БД, без бэкенда, без тестов (MVP).

**Стек:** Next.js 15, TypeScript, Tailwind CSS, react-leaflet, Leaflet, OpenStreetMap tiles, vaul (bottom-sheet на мобильных), Vercel.

**Пользователь — новичок:** никогда не писал код. Каждый терминал-команду, каждую git-операцию разжёвываю. Темп диктует пользователь.

**Спецификация:** [docs/superpowers/specs/2026-04-21-recyclemap-spb-mvp-design.md](../specs/2026-04-21-recyclemap-spb-mvp-design.md)

---

## Фаза 0 — Окружение (однократно, одну сессию)

### Задача 0.1: Установить Homebrew

**Зачем:** Homebrew — менеджер пакетов для macOS. Через него удобно ставить Node.js, git и всё остальное.

- [ ] **Шаг 1: Открыть Terminal**

`Cmd + Space` → набрать `Terminal` → Enter.

- [ ] **Шаг 2: Проверить, не установлен ли Homebrew уже**

```bash
brew --version
```

Ожидаемо: либо версия (например `Homebrew 4.x.x`) — тогда пропускаем шаг 3, либо `command not found: brew` — идём дальше.

- [ ] **Шаг 3: Установить Homebrew**

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

Скрипт попросит пароль от Mac — это нормально, пароль не покажется на экране, просто наберите и Enter.

В конце покажет две команды "Next steps" — ВЫПОЛНИТЕ ИХ (добавляют brew в PATH). Обычно это:
```bash
(echo; echo 'eval "$(/opt/homebrew/bin/brew shellenv)"') >> ~/.zprofile
eval "$(/opt/homebrew/bin/brew shellenv)"
```

- [ ] **Шаг 4: Проверить установку**

```bash
brew --version
```

Ожидаемо: `Homebrew 4.x.x`

---

### Задача 0.2: Установить Node.js 22 LTS

**Зачем:** Node.js — среда для выполнения JavaScript вне браузера. Next.js работает на нём. `npm` идёт в комплекте.

- [ ] **Шаг 1: Установить Node**

```bash
brew install node@22
```

- [ ] **Шаг 2: Добавить Node в PATH**

```bash
echo 'export PATH="/opt/homebrew/opt/node@22/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

- [ ] **Шаг 3: Проверить**

```bash
node --version
npm --version
```

Ожидаемо: `v22.x.x` для node, `10.x.x` для npm.

---

### Задача 0.3: Установить Git

- [ ] **Шаг 1: Проверить, не установлен ли**

```bash
git --version
```

Если `git version 2.x` — пропускаем шаг 2.

- [ ] **Шаг 2: Установить**

```bash
brew install git
```

- [ ] **Шаг 3: Настроить имя и email (это будет видно в коммитах)**

```bash
git config --global user.name "Dmitry Ioffe"
git config --global user.email "victorovi4@gmail.com"
git config --global init.defaultBranch main
```

- [ ] **Шаг 4: Проверить**

```bash
git config --list | grep user
```

Ожидаемо: `user.name=Dmitry Ioffe`, `user.email=victorovi4@gmail.com`.

---

### Задача 0.4: Установить VS Code

**Зачем:** редактор кода. Бесплатный, стандарт де-факто для Next.js.

- [ ] **Шаг 1: Скачать**

Открыть в браузере: https://code.visualstudio.com/download → скачать для Mac.

- [ ] **Шаг 2: Установить**

Открыть скачанный `.zip` → перетащить `Visual Studio Code.app` в папку `Applications`.

- [ ] **Шаг 3: Запустить VS Code → установить команду `code` в PATH**

Запустить VS Code. Далее: `Cmd+Shift+P` → набрать `Shell Command: Install 'code' command in PATH` → Enter. Это даст возможность открывать папки из терминала командой `code .`

- [ ] **Шаг 4: Проверить**

```bash
code --version
```

Ожидаемо: версия VS Code.

---

### Задача 0.5: Создать GitHub-аккаунт и настроить SSH

**Зачем:** чтобы выкладывать код в интернет и деплоить. Vercel умеет авто-деплоить с GitHub.

- [ ] **Шаг 1: Зарегистрироваться**

https://github.com/signup → зарегистрироваться под email `victorovi4@gmail.com`. Username выбрать на ваш вкус (например `dmitry-ioffe`).

- [ ] **Шаг 2: Создать SSH-ключ**

В терминале:
```bash
ssh-keygen -t ed25519 -C "victorovi4@gmail.com"
```

- При вопросе `Enter file in which to save the key` — просто Enter (дефолтный путь ок).
- При `Enter passphrase` — Enter дважды (для учебного проекта пароль на ключ не нужен).

- [ ] **Шаг 3: Скопировать публичный ключ в буфер**

```bash
pbcopy < ~/.ssh/id_ed25519.pub
```

- [ ] **Шаг 4: Добавить ключ на GitHub**

https://github.com/settings/keys → `New SSH key` → Title: `Mac`, Key: вставить (Cmd+V) → `Add SSH key`.

- [ ] **Шаг 5: Проверить соединение**

```bash
ssh -T git@github.com
```

На вопрос `Are you sure...` отвечаем `yes`. Ожидаемо: `Hi <username>! You've successfully authenticated...`

---

### Задача 0.6: Чекпойнт окружения

- [ ] **Шаг 1: Все четыре команды работают**

```bash
node --version && npm --version && git --version && code --version
```

Ожидаемо: 4 версии без ошибок.

Если любая упала — не идём дальше, разбираем.

---

## Фаза 1 — Создание проекта Next.js

### Задача 1.1: Создать Next.js-приложение

- [ ] **Шаг 1: Перейти в папку Documents**

```bash
cd ~/Documents
```

- [ ] **Шаг 2: Создать проект**

В текущей папке уже есть `recyclemap/` со спецификацией и планом. Создадим проект рядом и потом перенесём docs внутрь.

```bash
npx create-next-app@latest recyclemap-new --typescript --tailwind --app --src-dir=false --import-alias="@/*" --no-eslint
```

При вопросах отвечаем дефолтно (Enter).

Ожидаемо: `Success! Created recyclemap-new at ...`

- [ ] **Шаг 3: Переместить содержимое recyclemap-new в recyclemap**

```bash
cd ~/Documents
mv recyclemap/docs recyclemap-new/docs
rm -rf recyclemap
mv recyclemap-new recyclemap
cd recyclemap
```

- [ ] **Шаг 4: Запустить dev-сервер**

```bash
npm run dev
```

Ожидаемо: `Ready in X s`, сервер на `http://localhost:3000`.

- [ ] **Шаг 5: Открыть в браузере**

https://localhost:3000 — должна открыться дефолтная стартовая страница Next.js.

- [ ] **Шаг 6: Остановить сервер**

В терминале: `Ctrl+C`.

- [ ] **Шаг 7: Открыть проект в VS Code**

```bash
code .
```

---

### Задача 1.2: Очистить дефолтный контент

**Файлы:**
- Modify: `app/page.tsx`
- Modify: `app/globals.css`

- [ ] **Шаг 1: Заменить содержимое `app/page.tsx`**

```tsx
export default function Home() {
  return (
    <main className="min-h-screen flex items-center justify-center">
      <h1 className="text-3xl font-bold">RecycleMap СПб</h1>
    </main>
  );
}
```

- [ ] **Шаг 2: Упростить `app/globals.css`**

Оставить только:
```css
@import "tailwindcss";

html, body {
  margin: 0;
  padding: 0;
  height: 100%;
}
```

- [ ] **Шаг 3: Обновить метаданные в `app/layout.tsx`**

Найти `metadata` и заменить на:
```ts
export const metadata: Metadata = {
  title: "RecycleMap СПб",
  description: "Карта пунктов приёма вторсырья в Санкт-Петербурге",
};
```

- [ ] **Шаг 4: Запустить и проверить**

```bash
npm run dev
```

Открыть http://localhost:3000 — должно быть пусто кроме заголовка "RecycleMap СПб" посередине.

Ctrl+C для остановки.

---

### Задача 1.3: Создать репо на GitHub и запушить

- [ ] **Шаг 1: Создать репозиторий на GitHub**

https://github.com/new → Name: `recyclemap-spb`, Visibility: Public, НЕ ставить галочки "Add README/gitignore/license" (у Next.js свой). → `Create repository`.

GitHub покажет инструкцию. Используем "push an existing repository from the command line".

- [ ] **Шаг 2: Проверить, что `git` уже инициализирован**

```bash
git status
```

`create-next-app` обычно инициализирует git сам. Если вывод вроде `On branch main, nothing to commit` — хорошо. Если `fatal: not a git repository`:

```bash
git init
git branch -M main
```

- [ ] **Шаг 3: Первый коммит**

```bash
git add .
git commit -m "chore: initial Next.js setup + design docs"
```

- [ ] **Шаг 4: Подключить remote и запушить**

Замените `<username>` на ваш GitHub-юзернейм:

```bash
git remote add origin git@github.com:<username>/recyclemap-spb.git
git push -u origin main
```

- [ ] **Шаг 5: Проверить**

Обновить страницу репозитория на GitHub — должны быть все файлы.

---

## Фаза 2 — Модель данных и константы

### Задача 2.1: Типы в `lib/types.ts`

**Файлы:**
- Create: `lib/types.ts`

- [ ] **Шаг 1: Создать файл**

В VS Code создать папку `lib/` в корне проекта, внутри файл `types.ts`:

```ts
export type CategoryId =
  | 'plastic'
  | 'glass'
  | 'paper'
  | 'metal'
  | 'batteries'
  | 'electronics'
  | 'tetrapak'
  | 'textile';

export type Category = {
  id: CategoryId;
  label: string;
  color: string;  // HEX
  icon: string;   // emoji
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

- [ ] **Шаг 2: Коммит**

```bash
git add lib/types.ts
git commit -m "feat: add Point and Category types"
```

---

### Задача 2.2: Категории в `data/categories.json`

**Файлы:**
- Create: `data/categories.json`

- [ ] **Шаг 1: Создать папку `data/` в корне и файл `categories.json`**

```json
[
  { "id": "plastic",     "label": "Пластик",           "color": "#2E7D32", "icon": "🧴" },
  { "id": "glass",       "label": "Стекло",            "color": "#00838F", "icon": "🍾" },
  { "id": "paper",       "label": "Бумага и картон",   "color": "#8D6E63", "icon": "📄" },
  { "id": "metal",       "label": "Металл",            "color": "#546E7A", "icon": "🥫" },
  { "id": "batteries",   "label": "Батарейки",         "color": "#EF6C00", "icon": "🔋" },
  { "id": "electronics", "label": "Электроника",       "color": "#5E35B1", "icon": "💻" },
  { "id": "tetrapak",    "label": "Тетрапак",          "color": "#D84315", "icon": "📦" },
  { "id": "textile",     "label": "Одежда и текстиль", "color": "#C2185B", "icon": "👕" }
]
```

- [ ] **Шаг 2: Коммит**

```bash
git add data/categories.json
git commit -m "feat: add 8 recycling categories"
```

---

### Задача 2.3: Собрать данные по точкам (делает ассистент)

**Файлы:**
- Create: `data/points.json`

- [ ] **Шаг 1: Ассистент ищет 25–30 точек**

Через веб-поиск (nimble / firecrawl / Яндекс.Карты) найти реальные пункты приёма в СПб. Для каждой зафиксировать: name, address, lat, lng, categories, hours, phone, website, description, source (URL).

- [ ] **Шаг 2: Записать в `data/points.json`**

Формат — массив объектов по схеме `Point` (см. `lib/types.ts`).

Пример одной записи (заглушка до реальных данных):
```json
[
  {
    "id": "p001",
    "name": "Экоцентр Сборка (Московский)",
    "address": "Московский пр., 181",
    "lat": 59.8697,
    "lng": 30.3215,
    "categories": ["plastic", "glass", "paper", "metal", "tetrapak"],
    "hours": "Сб 12:00–16:00",
    "phone": "",
    "website": "https://ecocentre-sborka.ru",
    "description": "Регулярная акция по приёму вторсырья. Приносите чистое и сухое.",
    "source": "https://ecocentre-sborka.ru/spb"
  }
]
```

- [ ] **Шаг 3: Пользователь проверяет список**

Просмотреть 5–10 рандомных точек, убедиться, что адреса реальны. Если что-то подозрительное — сказать ассистенту, он перепроверит.

- [ ] **Шаг 4: Коммит**

```bash
git add data/points.json
git commit -m "data: 25-30 SPb recycling points"
```

---

## Фаза 3 — Каркас страницы

### Задача 3.1: Хелпер для чтения данных

**Файлы:**
- Create: `lib/data.ts`

- [ ] **Шаг 1: Создать `lib/data.ts`**

```ts
import type { Category, Point } from './types';
import categoriesJson from '@/data/categories.json';
import pointsJson from '@/data/points.json';

export const categories: Category[] = categoriesJson as Category[];
export const points: Point[] = pointsJson as Point[];
```

- [ ] **Шаг 2: Разрешить импорт JSON в TS**

Проверить, что в `tsconfig.json` в `compilerOptions` есть `"resolveJsonModule": true`. Если нет — добавить.

- [ ] **Шаг 3: Коммит**

```bash
git add lib/data.ts tsconfig.json
git commit -m "feat: data loader helper"
```

---

### Задача 3.2: Компонент Header

**Файлы:**
- Create: `components/Header.tsx`

- [ ] **Шаг 1: Создать папку `components/` и файл `Header.tsx`**

```tsx
import Link from 'next/link';

export default function Header() {
  return (
    <header className="h-14 border-b border-gray-200 flex items-center justify-between px-4 bg-white">
      <Link href="/" className="text-lg font-semibold">
        RecycleMap <span className="text-emerald-700">СПб</span>
      </Link>
      <Link href="/about" className="text-sm text-gray-600 hover:text-gray-900">
        О проекте
      </Link>
    </header>
  );
}
```

- [ ] **Шаг 2: Подключить Header в `app/layout.tsx`**

В `app/layout.tsx` внутри `<body>` обернуть `{children}`:

```tsx
import Header from '@/components/Header';
// ...
<body>
  <Header />
  {children}
</body>
```

- [ ] **Шаг 3: Проверить**

`npm run dev` → открыть http://localhost:3000 → должна быть шапка вверху с названием и ссылкой "О проекте".

- [ ] **Шаг 4: Коммит**

```bash
git add components/Header.tsx app/layout.tsx
git commit -m "feat: add Header component"
```

---

### Задача 3.3: Каркас главной страницы (layout с двумя колонками)

**Файлы:**
- Modify: `app/page.tsx`

- [ ] **Шаг 1: Обновить `app/page.tsx`**

```tsx
'use client';

import { categories, points } from '@/lib/data';

export default function Home() {
  return (
    <div className="flex h-[calc(100vh-3.5rem)]">
      {/* Левая колонка (фильтры) — пока плейсхолдер */}
      <aside className="hidden md:flex md:flex-col w-64 border-r border-gray-200 p-4 overflow-y-auto bg-white">
        <h2 className="font-semibold mb-2">Фильтры</h2>
        <p className="text-sm text-gray-500">Категории появятся здесь</p>
        <p className="mt-4 text-sm text-gray-600">Точек: {points.length}</p>
      </aside>

      {/* Карта — плейсхолдер */}
      <section className="flex-1 bg-gray-100 flex items-center justify-center">
        <p className="text-gray-500">Здесь будет карта</p>
      </section>
    </div>
  );
}
```

Пояснение: `h-[calc(100vh-3.5rem)]` — высота экрана минус высота шапки (14 = 3.5rem).

- [ ] **Шаг 2: Проверить**

http://localhost:3000 → шапка + две колонки: слева "Фильтры", справа "Здесь будет карта". Количество точек из JSON должно появиться.

- [ ] **Шаг 3: Коммит**

```bash
git add app/page.tsx
git commit -m "feat: page layout skeleton (filters + map area)"
```

---

## Фаза 4 — Карта

### Задача 4.1: Установить Leaflet и react-leaflet

- [ ] **Шаг 1: Установить**

```bash
npm install leaflet react-leaflet
npm install -D @types/leaflet
```

- [ ] **Шаг 2: Проверить в `package.json`**

В `dependencies` должны появиться `leaflet`, `react-leaflet`, в `devDependencies` — `@types/leaflet`.

- [ ] **Шаг 3: Коммит**

```bash
git add package.json package-lock.json
git commit -m "chore: install leaflet + react-leaflet"
```

---

### Задача 4.2: Компонент MapInner (сама карта)

**Файлы:**
- Create: `components/MapInner.tsx`

- [ ] **Шаг 1: Создать `components/MapInner.tsx`**

```tsx
'use client';

import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Point, Category, CategoryId } from '@/lib/types';

// Фикс иконки маркера (у Leaflet по умолчанию она ломается в бандлерах)
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

function coloredIcon(color: string): L.DivIcon {
  return L.divIcon({
    className: '',
    html: `<div style="
      width: 20px; height: 20px; border-radius: 50%;
      background: ${color}; border: 2px solid white;
      box-shadow: 0 1px 4px rgba(0,0,0,0.4);
    "></div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
}

type Props = {
  points: Point[];
  categories: Category[];
};

export default function MapInner({ points, categories }: Props) {
  const categoryById = new Map<CategoryId, Category>(
    categories.map((c) => [c.id, c])
  );

  return (
    <MapContainer
      center={[59.9386, 30.3141]}
      zoom={11}
      className="h-full w-full"
      scrollWheelZoom
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {points.map((p) => {
        const primary = categoryById.get(p.categories[0]);
        const color = primary?.color ?? '#888';
        return (
          <Marker key={p.id} position={[p.lat, p.lng]} icon={coloredIcon(color)}>
            <Popup>
              <div className="text-sm">
                <div className="font-semibold text-base mb-1">{p.name}</div>
                <div className="text-gray-700">{p.address}</div>
              </div>
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}
```

- [ ] **Шаг 2: Коммит**

```bash
git add components/MapInner.tsx
git commit -m "feat: MapInner component with Leaflet + colored markers"
```

---

### Задача 4.3: Обёртка Map с dynamic import

**Файлы:**
- Create: `components/Map.tsx`

- [ ] **Шаг 1: Создать `components/Map.tsx`**

```tsx
'use client';

import dynamic from 'next/dynamic';
import type { Point, Category } from '@/lib/types';

const MapInner = dynamic(() => import('./MapInner'), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full flex items-center justify-center text-gray-500">
      Загрузка карты…
    </div>
  ),
});

type Props = {
  points: Point[];
  categories: Category[];
};

export default function Map(props: Props) {
  return <MapInner {...props} />;
}
```

Пояснение: `ssr: false` обязательно — Leaflet обращается к `window`, а Next.js рендерит компоненты и на сервере.

- [ ] **Шаг 2: Подключить в `app/page.tsx`**

Заменить плейсхолдер карты:

```tsx
'use client';

import Map from '@/components/Map';
import { categories, points } from '@/lib/data';

export default function Home() {
  return (
    <div className="flex h-[calc(100vh-3.5rem)]">
      <aside className="hidden md:flex md:flex-col w-64 border-r border-gray-200 p-4 overflow-y-auto bg-white">
        <h2 className="font-semibold mb-2">Фильтры</h2>
        <p className="text-sm text-gray-500">Категории появятся здесь</p>
        <p className="mt-4 text-sm text-gray-600">Точек: {points.length}</p>
      </aside>
      <section className="flex-1">
        <Map points={points} categories={categories} />
      </section>
    </div>
  );
}
```

- [ ] **Шаг 3: Проверить**

`npm run dev` → http://localhost:3000 → карта Питера с маркерами. Клик по маркеру → попап с названием и адресом.

- [ ] **Шаг 4: Коммит**

```bash
git add components/Map.tsx app/page.tsx
git commit -m "feat: wire Map into main page"
```

---

### Задача 4.4: Компонент PointPopup (детальный попап)

**Файлы:**
- Create: `components/PointPopup.tsx`
- Modify: `components/MapInner.tsx`

- [ ] **Шаг 1: Создать `components/PointPopup.tsx`**

```tsx
import type { Point, Category, CategoryId } from '@/lib/types';

type Props = {
  point: Point;
  categoryById: Map<CategoryId, Category>;
};

export default function PointPopup({ point, categoryById }: Props) {
  return (
    <div className="text-sm max-w-xs">
      <div className="font-semibold text-base mb-1">{point.name}</div>
      <div className="text-gray-700 mb-2">{point.address}</div>

      <div className="flex flex-wrap gap-1 mb-2">
        {point.categories.map((id) => {
          const cat = categoryById.get(id);
          if (!cat) return null;
          return (
            <span
              key={id}
              className="text-xs px-2 py-0.5 rounded-full text-white"
              style={{ backgroundColor: cat.color }}
            >
              {cat.icon} {cat.label}
            </span>
          );
        })}
      </div>

      {point.hours && (
        <div className="mb-1"><span className="text-gray-500">Часы:</span> {point.hours}</div>
      )}
      {point.phone && (
        <div className="mb-1">
          <span className="text-gray-500">Телефон:</span>{' '}
          <a href={`tel:${point.phone}`} className="text-emerald-700 underline">
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

- [ ] **Шаг 2: Использовать в `MapInner.tsx`**

Заменить текущее содержимое `<Popup>`:

```tsx
import PointPopup from './PointPopup';
// ...
<Popup>
  <PointPopup point={p} categoryById={categoryById} />
</Popup>
```

- [ ] **Шаг 3: Проверить**

Клик по маркеру → попап с названием, адресом, бэйджиками категорий, часами, телефоном, сайтом, описанием.

- [ ] **Шаг 4: Коммит**

```bash
git add components/PointPopup.tsx components/MapInner.tsx
git commit -m "feat: detailed PointPopup with badges and contacts"
```

---

## Фаза 5 — Фильтры

### Задача 5.1: Компонент FilterPanel

**Файлы:**
- Create: `components/FilterPanel.tsx`

- [ ] **Шаг 1: Создать `components/FilterPanel.tsx`**

```tsx
'use client';

import type { Category, CategoryId } from '@/lib/types';

type Props = {
  categories: Category[];
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

      <ul className="space-y-2 mb-4">
        {categories.map((c) => (
          <li key={c.id}>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={selected.has(c.id)}
                onChange={() => onToggle(c.id)}
                className="w-4 h-4"
              />
              <span
                className="inline-block w-3 h-3 rounded-full"
                style={{ backgroundColor: c.color }}
              />
              <span>{c.icon} {c.label}</span>
            </label>
          </li>
        ))}
      </ul>

      <div className="flex gap-2 mb-4">
        <button
          onClick={onSelectAll}
          className="text-sm px-3 py-1 border border-gray-300 rounded hover:bg-gray-50"
        >
          Выбрать все
        </button>
        <button
          onClick={onReset}
          className="text-sm px-3 py-1 border border-gray-300 rounded hover:bg-gray-50"
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

- [ ] **Шаг 2: Коммит**

```bash
git add components/FilterPanel.tsx
git commit -m "feat: FilterPanel component"
```

---

### Задача 5.2: Состояние фильтров и фильтрация точек

**Файлы:**
- Modify: `app/page.tsx`

- [ ] **Шаг 1: Переписать `app/page.tsx`**

```tsx
'use client';

import { useMemo, useState } from 'react';
import Map from '@/components/Map';
import FilterPanel from '@/components/FilterPanel';
import { categories, points } from '@/lib/data';
import type { CategoryId } from '@/lib/types';

const allIds: CategoryId[] = categories.map((c) => c.id);

export default function Home() {
  const [selected, setSelected] = useState<Set<CategoryId>>(
    () => new Set(allIds)
  );

  const filteredPoints = useMemo(
    () => points.filter((p) => p.categories.some((c) => selected.has(c))),
    [selected]
  );

  const toggle = (id: CategoryId) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(allIds));
  const reset = () => setSelected(new Set());

  return (
    <div className="flex h-[calc(100vh-3.5rem)]">
      <aside className="hidden md:flex md:flex-col w-64 border-r border-gray-200 p-4 overflow-y-auto bg-white">
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

- [ ] **Шаг 2: Проверить**

http://localhost:3000 → чекбоксы слева. Снимаем "Пластик" — маркеры точек где только пластик пропадают. Счётчик меняется. Кнопки "Выбрать все" / "Сбросить" работают.

- [ ] **Шаг 3: Коммит**

```bash
git add app/page.tsx
git commit -m "feat: filter state + reactive point filtering"
```

---

## Фаза 6 — Адаптив для мобильных

### Задача 6.1: Установить vaul для bottom-sheet

- [ ] **Шаг 1: Установить**

```bash
npm install vaul
```

- [ ] **Шаг 2: Коммит**

```bash
git add package.json package-lock.json
git commit -m "chore: install vaul for mobile bottom sheet"
```

---

### Задача 6.2: Мобильный drawer с фильтрами

**Файлы:**
- Create: `components/MobileFilterDrawer.tsx`
- Modify: `app/page.tsx`

- [ ] **Шаг 1: Создать `components/MobileFilterDrawer.tsx`**

```tsx
'use client';

import { Drawer } from 'vaul';
import type { Category, CategoryId } from '@/lib/types';
import FilterPanel from './FilterPanel';

type Props = {
  categories: Category[];
  selected: Set<CategoryId>;
  onToggle: (id: CategoryId) => void;
  onSelectAll: () => void;
  onReset: () => void;
  pointCount: number;
};

export default function MobileFilterDrawer(props: Props) {
  return (
    <Drawer.Root>
      <Drawer.Trigger asChild>
        <button className="md:hidden fixed bottom-4 left-1/2 -translate-x-1/2 z-[1000] bg-emerald-700 text-white rounded-full px-5 py-3 shadow-lg">
          Фильтры ({props.pointCount})
        </button>
      </Drawer.Trigger>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/40 z-[1001]" />
        <Drawer.Content className="bg-white flex flex-col rounded-t-2xl fixed bottom-0 left-0 right-0 max-h-[85vh] z-[1002]">
          <Drawer.Title className="sr-only">Фильтры категорий</Drawer.Title>
          <div className="mx-auto w-12 h-1.5 bg-gray-300 rounded-full my-3" />
          <div className="p-4 overflow-y-auto">
            <FilterPanel {...props} />
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
```

- [ ] **Шаг 2: Подключить в `app/page.tsx`**

В `return`, добавить перед `</div>`:

```tsx
<MobileFilterDrawer
  categories={categories}
  selected={selected}
  onToggle={toggle}
  onSelectAll={selectAll}
  onReset={reset}
  pointCount={filteredPoints.length}
/>
```

И импорт вверху:
```tsx
import MobileFilterDrawer from '@/components/MobileFilterDrawer';
```

- [ ] **Шаг 3: Проверить**

В Chrome DevTools включить мобильный режим (Cmd+Shift+M → iPhone 14). Левая панель должна скрыться, внизу появиться кнопка "Фильтры (N)". Клик → выезжает шторка с фильтрами. Смена фильтров обновляет карту.

- [ ] **Шаг 4: Коммит**

```bash
git add components/MobileFilterDrawer.tsx app/page.tsx
git commit -m "feat: mobile bottom-sheet with filters"
```

---

## Фаза 7 — Страница /about

### Задача 7.1: Страница «О проекте»

**Файлы:**
- Create: `app/about/page.tsx`

- [ ] **Шаг 1: Создать папку `app/about/` и файл `page.tsx`**

```tsx
export const metadata = {
  title: 'О проекте — RecycleMap СПб',
};

export default function About() {
  return (
    <main className="max-w-2xl mx-auto px-4 py-8 prose">
      <h1 className="text-2xl font-bold mb-4">О проекте</h1>
      <p className="mb-3">
        RecycleMap СПб — учебный pet-проект, карта пунктов приёма вторсырья
        в Санкт-Петербурге. Вдохновлён{' '}
        <a
          href="https://recyclemap.ru"
          target="_blank"
          rel="noopener noreferrer"
          className="text-emerald-700 underline"
        >
          recyclemap.ru
        </a>.
      </p>
      <p className="mb-3">
        Данные собраны из открытых источников и могут быть неактуальны.
        Перед визитом лучше уточнить режим работы и список принимаемого.
      </p>
      <p className="text-sm text-gray-500">
        Автор: Дмитрий Иоффе. Исходники на{' '}
        <a
          href="https://github.com/"
          className="text-emerald-700 underline"
        >
          GitHub
        </a>.
      </p>
    </main>
  );
}
```

- [ ] **Шаг 2: Проверить**

http://localhost:3000/about → открывается страница с текстом.

- [ ] **Шаг 3: Коммит**

```bash
git add app/about/page.tsx
git commit -m "feat: add /about page"
```

---

## Фаза 8 — Мелкая полировка

### Задача 8.1: Favicon и мета-теги

**Файлы:**
- Modify: `app/layout.tsx`

- [ ] **Шаг 1: Обновить metadata**

```ts
export const metadata: Metadata = {
  title: "RecycleMap СПб — карта пунктов приёма вторсырья",
  description: "Где сдать вторсырьё в Санкт-Петербурге: пластик, стекло, бумагу, металл, батарейки, электронику.",
  openGraph: {
    title: "RecycleMap СПб",
    description: "Карта пунктов приёма вторсырья в Санкт-Петербурге",
    locale: "ru_RU",
    type: "website",
  },
};
```

- [ ] **Шаг 2: Язык страницы**

В `app/layout.tsx` в `<html>`:
```tsx
<html lang="ru">
```

- [ ] **Шаг 3: Коммит**

```bash
git add app/layout.tsx
git commit -m "chore: Russian locale and SEO meta"
```

---

### Задача 8.2: Локальная ручная проверка

- [ ] **Шаг 1: Прогнать чек-лист**

Запустить `npm run dev`, проверить:
- [ ] Главная открывается, шапка видна, карта показывает маркеры СПб
- [ ] Все 8 категорий в фильтре с эмодзи и цветными метками
- [ ] Клик по маркеру — попап со всеми полями (название, адрес, бэйджики, часы, телефон, сайт, описание)
- [ ] Снятие чекбокса убирает соответствующие маркеры, счётчик меняется
- [ ] "Сбросить" → 0 точек, карта пустая
- [ ] "Выбрать все" → все точки
- [ ] В Chrome DevTools (Cmd+Shift+M) на iPhone: фильтры спрятаны, кнопка внизу, шторка работает
- [ ] Страница /about открывается

- [ ] **Шаг 2: Production build локально**

```bash
npm run build
npm run start
```

Открыть http://localhost:3000 — всё должно работать так же. Особое внимание: нет ошибок в консоли браузера и в терминале.

Ctrl+C после проверки.

- [ ] **Шаг 3: Если что-то не работает**

Записать проблемы, разобрать, починить, снова билд. Не переходим к деплою, пока локальный build чист.

---

## Фаза 9 — Деплой на Vercel

### Задача 9.1: Запушить последние изменения

- [ ] **Шаг 1: Убедиться, что всё закоммичено**

```bash
git status
```

Ожидаемо: `nothing to commit, working tree clean`.

- [ ] **Шаг 2: Запушить**

```bash
git push
```

---

### Задача 9.2: Подключить Vercel к GitHub

- [ ] **Шаг 1: Регистрация на Vercel**

https://vercel.com/signup → Sign up with GitHub.

- [ ] **Шаг 2: Импорт репо**

Dashboard → `Add New...` → `Project` → найти `recyclemap-spb` → `Import`.

- [ ] **Шаг 3: Настройки деплоя**

Framework: Next.js (определится автоматом). Всё остальное — дефолты. `Deploy`.

- [ ] **Шаг 4: Дождаться окончания билда**

~1–2 минуты. По окончании — публичный URL вида `recyclemap-spb-<hash>.vercel.app`.

---

### Задача 9.3: Проверка продакшена

- [ ] **Шаг 1: Открыть прод-URL**

Проверить тот же чек-лист, что в задаче 8.2.

- [ ] **Шаг 2: Проверить с телефона**

Открыть URL на телефоне. Шторка фильтров должна нормально открываться пальцем.

- [ ] **Шаг 3: Если что-то не работает**

Vercel → Project → Logs — посмотреть ошибки. Самая частая проблема в Next.js + Leaflet: забыли `ssr: false` → ошибка `window is not defined`. У нас это уже сделано в `components/Map.tsx`.

---

### Задача 9.4: Прожить с проектом день-два

- [ ] **Показать друзьям, собрать первые отзывы**

- [ ] **Занести замеченные ошибки в данных в отдельный список**

- [ ] **Решить, что делать дальше:** поиск по адресу? геолокация? форма предложения точки? Это темы для следующей сессии brainstorming.

---

## Self-review (для автора плана)

**Покрытие спеки:**
- 3.DoD: карта ✓ (фаза 4), 25-30 точек ✓ (2.3), цветные маркеры ✓ (4.2), попап ✓ (4.4), фильтр 8 категорий ✓ (5.1), логика ИЛИ ✓ (5.2), счётчик ✓ (5.1), "Выбрать все"/"Сбросить" ✓ (5.1), адаптив ✓ (6.2), /about ✓ (7.1), Vercel ✓ (9.2).
- 5. Модель данных: типы ✓ (2.1), categories.json ✓ (2.2), points.json ✓ (2.3).
- 6. UI: layout ✓ (3.3), mobile ✓ (6.2), попап ✓ (4.4), фильтр-логика ✓ (5.2).
- 7. Структура проекта: все файлы плана соответствуют секции 7 спеки.

**Плейсхолдеров нет.** Все "TODO" только в местах, где пользователь должен что-то проверить вручную.

**Согласованность типов:** `CategoryId`, `Category`, `Point` определены в `lib/types.ts` (задача 2.1), используются во всех последующих файлах — `components/Map.tsx`, `MapInner.tsx`, `PointPopup.tsx`, `FilterPanel.tsx`, `MobileFilterDrawer.tsx`, `app/page.tsx`. Имена не расходятся.

**Известное отступление от дефолтов скилла:**
- Нет тестов (TDD). Спецификация (секция 10 спеки) явно говорит "код не покрывается тестами" — для учебного MVP без бизнес-логики тесты будут оверхедом. Возвращаемся к тестам, когда появится реальная обработка данных (формы, БД).

---

## Примечание по темпу

Для новичка это реалистично **1–3 вечера**:
- Фаза 0 (установка) — 1–2 часа.
- Фазы 1–4 (проект + данные + карта) — 2–3 часа.
- Фазы 5–6 (фильтры + мобильный) — 1–2 часа.
- Фазы 7–9 (about + полировка + деплой) — 1 час.

Не торопитесь. Каждую фазу заканчивайте коммитом, смотрите, что работает. Если застряли — пишите, разберём.
