# Фронтенд (папка miniapp/)

Одна кодовая база — **три сборки**. Какая собирается, определяет переменная `VITE_APP_TARGET`:

| Сборка | Команда | Папка | Адрес | Корневой компонент |
|---|---|---|---|---|
| Telegram Mini App | `npm run build` | `dist/` | redonate.gg/app | `src/App.tsx` |
| Сайт | `VITE_APP_TARGET=web npx vite build` | `dist-web/` | redonate.gg | `src/web/WebApp.tsx` |
| Админка | `VITE_APP_TARGET=admin npx vite build` | `dist-admin/` | admin.redonate.gg | `src/admin/AdminApp.tsx` |

`src/main.tsx` загружает нужный корень. Флаги `isWeb` / `isTelegram` / `isAdminApp` — в `src/config/appTarget.ts`.

Локально: `npm install`, затем `npm run dev` (Mini App) или `VITE_APP_TARGET=web npm run dev` (сайт). Проверка типов: `npx tsc --noEmit -p .`.

## Папки src/

```
api/          запросы к бэкенду: index.ts (магазин), admin.ts (админка), client.ts (axios, токены)
config/       appTarget.ts — цель сборки, адреса, ссылки бренда
store/        Zustand: авторизация, корзина, состояние интерфейса
hooks/        общие хуки (useTelegram, useDebounce, ...)
utils/        форматирование, картинки (thumb.ts — превью WebP), ...
components/   общие компоненты:
  ui/         кнопки, иконки (icons.tsx — Phosphor), лоадеры
  brand/      логотип и анимация «перо»
  layout/     каркас Mini App (нижняя навигация)
  reviews/, loyalty/, decor/, admin/ — блоки по темам
pages/        экраны Mini App (HomePage, GamePage, CartPage, ...)
pages/admin/  экраны админки (используются сборкой admin)
admin/        оболочка админки: AdminApp, вход, Ctrl+K-поиск
web/          сайт:
  WebApp.tsx, WebLayout.tsx   маршруты и каркас (шапка, подвал)
  pages/      страницы сайта (WebHomePage, WebGamePage, WebCheckoutPage, ...)
  components/ блоки сайта (поиск, карточки игр, баннеры, вход)
  cart/, chat/, auth/         корзина, чат с оператором, вход
  seo.ts      мета-теги страницы и Яндекс.Метрика
  prefetch.ts предзагрузка данных и кода перед переходом
```

Сайт и Mini App — **разные экраны** над одним API: у Mini App свои `pages/`, у сайта свои `web/pages/`. Общие — API-клиент, типы, часть компонентов (`components/`). Меняя логику страницы игры, проверьте обе версии: `pages/GamePage.tsx` и `web/pages/WebGamePage.tsx`.

## Данные

- Запросы — через React Query (`useQuery`). Ключи вида `['web', 'games', 'all']`.
- Сайт получает первые данные прямо в HTML: сервер (`api/routers/seo.py`) кладёт их в `window.__INITIAL_DATA__`, `main.tsx` переносит их в кэш React Query. Поэтому **ответ API и данные из SSR должны совпадать**. Если добавили поле в API, проверьте, что `seo.py` берёт данные тем же обработчиком.
- Переходы между страницами: сначала грузятся код и данные следующей страницы (`Promise.all([import(...), prefetchQuery(...)])`), потом выполняется `navigate`. Так экран не мигает пустым.

## Дизайн-система

- Цвета (графит): фон `#0B0C0F`, панели `#15171C` / `#1E2128`, текст `#DCEBFF`, единственный акцент `#2563EB`, ссылки `#7FA6F5`. Переменные — в `src/theme.css` (`--bg`, `--bg2`, `--text`, `--accent`, `--link`, ...).
- Шрифт — только **Onest**.
- Иконки — Phosphor через `src/components/ui/icons.tsx`, не напрямую.
- Без эмодзи в интерфейсе, без градиентов, свечений и размытия ради декора.
- Анимации — Framer Motion (`LazyMotion`, компонент `m`). SVG-фильтры и canvas не работают в Telegram WebView.
- Оверлеи с `position: fixed` в Mini App — с `style={{ zIndex: 200 }}`, а не классом Tailwind.
