# reDonate Bot — redonate.su

Telegram-магазин игрового доната. Стек: **aiogram 3** + **FastAPI** + **React/Vite** + **PostgreSQL** + **Redis/Celery**.

## Workflow

Локально — только разработка кода (черновик). Docker, запуск бота, БД — только на сервере.

```
пишем код → git push → GitHub Actions → автодеплой на VPS (185.23.19.227)
```

Никогда не предлагать `make dev`, `docker compose up` и т.п. — это не нужно локально.

## Структура

```
bot/           — Telegram Bot (aiogram 3)
  handlers/    — client/ и admin/ хендлеры
  utils/texts.py — все тексты бота (используют SHOP_NAME из .env)
api/           — FastAPI backend
  routers/, services/, schemas/
miniapp/       — React + Vite (Telegram Mini App)
worker/        — Celery задачи
shared/
  config/settings.py — все настройки (Pydantic Settings)
  models/            — SQLAlchemy модели
migrations/    — Alembic
```

## Стек и стиль

- **Python**: asyncio, Pydantic v2, SQLAlchemy 2.0 async, aiogram 3.x
- **FastAPI**: lifespan, async везде, dependency injection
- **React**: функциональные компоненты + хуки, Vite, Tailwind + shadcn/ui или Radix UI
- **UI**: современный минималистичный дизайн, Framer Motion для анимаций
- Не использовать устаревшие паттерны (классовые компоненты, sync ORM, старый роутинг)

## Правила

- Все тексты бота — только в `bot/utils/texts.py`, SHOP_NAME только из `.env`
- Миграции — только через Alembic, никогда не менять схему вручную
- Линтер/форматтер: `ruff` (установлен локально, хук запускает автоматически)

## Прогресс

- [x] Этап 1–3: Docker, БД-модели, Bot MVP
- [ ] Этап 4: Оплата (ЮKassa, баланс, webhook)
- [ ] Этап 5: FastAPI REST API для Mini App
- [ ] Этап 6: Mini App React
- [ ] Этап 7: Скидки, Celery
- [ ] Этап 8: Крипта (TON/USDT), деплой
