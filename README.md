# reDonate

Магазин игрового доната и цифровых сервисов. Один бэкенд обслуживает четыре «витрины»:

| Витрина | Адрес | Где код |
|---|---|---|
| Сайт | https://redonate.gg | `miniapp/src/web/` (сборка `VITE_APP_TARGET=web`) |
| Telegram Mini App | https://redonate.gg/app | `miniapp/src/pages/` (обычная сборка) |
| Telegram-бот магазина | @reDonate_robot | `bot/` |
| Админка | https://admin.redonate.gg | `miniapp/src/admin/` + `miniapp/src/pages/admin/` (сборка `VITE_APP_TARGET=admin`) |

Плюс бот поддержки (`support_bot/`) — через него персонал получает уведомления, отвечает клиентам и входит в админку.

## С чего начать

1. [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — из чего состоит система и как части связаны.
2. [docs/ORDERS_AND_PAYMENTS.md](docs/ORDERS_AND_PAYMENTS.md) — путь заказа: корзина → оплата → выдача. Самое важное для бизнеса.
3. [docs/OPERATIONS.md](docs/OPERATIONS.md) — серверы, деплой, бэкапы, что делать, если всё упало.
4. [docs/HOWTO.md](docs/HOWTO.md) — типовые задачи: добавить игру, поле, миграцию, фоновую задачу.

Остальное:
- [docs/AUTODELIVERY.md](docs/AUTODELIVERY.md) — автоматическая выдача (FazerCards, Fragment, ключи, HoldBoost).
- [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md) — внешние сервисы: Platega, RAPIRA, хаб UchetFP, GGSEL, почта, Метрика.
- [docs/FRONTEND.md](docs/FRONTEND.md) — как устроен фронтенд и почему три сборки из одной папки.
- [docs/SEO.md](docs/SEO.md) — серверный рендер страниц для поисковиков, sitemap, тексты игр.

## Стек

- **Python 3.12**: FastAPI (API), aiogram 3 (боты), SQLAlchemy 2 async + Alembic (база), Celery + Redis (фоновые задачи), Pydantic v2 (схемы и настройки).
- **PostgreSQL 16**, **Redis 7**.
- **Фронтенд**: React 18 + TypeScript + Vite + Tailwind, React Query (данные), Zustand (состояние), Framer Motion (анимации).
- **Инфраструктура**: Docker Compose на одном VPS, nginx, Let's Encrypt, GitHub Actions (автодеплой при push в `main`).

## Папки

```
api/          FastAPI: routers/ (HTTP-обработчики), services/ (вся бизнес-логика), schemas/ (Pydantic)
bot/          бот магазина: handlers/client (каталог, корзина, заказы, профиль), utils/texts.py (все тексты)
support_bot/  бот поддержки: уведомления персоналу, ответы клиентам, вход в админку
worker/       Celery: tasks/ (фоновые задачи), main.py (расписание beat)
shared/       общее для всех сервисов: config/settings.py (настройки из .env), models/ (таблицы БД),
              database/ (сессии), staff_notify.py (уведомления персоналу), content/ (тексты бота из админки)
migrations/   Alembic-миграции БД (versions/NNN_*.py, по порядку)
miniapp/      фронтенд: сайт, Mini App и админка — три сборки из одного кода
nginx/        конфиги nginx (домены, заголовки безопасности, проксирование)
scripts/      бэкап/восстановление БД, первичная настройка сервера
tests/        pytest
docs/         документация
```

## Правила, которые нельзя нарушать

- Бизнес-логика — только в `api/services/`. Роутеры и хендлеры ботов только принимают запрос и вызывают сервис.
- Схема БД меняется только Alembic-миграцией.
- Секреты — только в `.env` на сервере и через `shared/config/settings.py`. В код не вписывать.
- Статус заказа меняется только через `OrderService.change_status` — он же шлёт уведомление клиенту.
- В ботах `parse_mode=HTML`: любой текст из БД или от пользователя — через `html.escape`.
- Локально Docker не запускается: код пишется локально, проверяется в CI и на сервере после деплоя.
