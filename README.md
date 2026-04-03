# 🎮 reDonate Bot

Коммерческий Telegram-магазин игрового доната и виртуальных товаров.
Архитектура: **Telegram Bot + Mini App** на едином backend.

## ⚡ Быстрый старт

```bash
git clone <repo>
cd gameshop-bot
chmod +x scripts/setup.sh
./scripts/setup.sh
```

## 🏪 Изменить название магазина

Только один файл — `.env`:

```env
SHOP_NAME="МойМагазин"
SHOP_TAGLINE="Лучший донат в Telegram"
SHOP_SUPPORT_USERNAME="my_support"
```

После изменения — перезапустить:
```bash
docker compose restart bot api
```

**Где используется `SHOP_NAME`:**
- Приветствие при /start
- Все тексты бота (bot/utils/texts.py)
- Заголовок Mini App
- Чеки и уведомления
- FAQ и поддержка

## 📁 Структура проекта

```
gameshop-bot/
├── bot/                    # Telegram Bot (aiogram 3)
│   ├── handlers/
│   │   ├── client/         # start, catalog, cart, orders, profile, support
│   │   └── admin/          # admin_main, admin_catalog, admin_orders
│   ├── middlewares/        # auth, throttle, logging, admin_auth
│   ├── fsm/                # FSM-состояния
│   └── utils/              # texts.py, admin_log.py
├── api/                    # FastAPI backend (следующий этап)
│   ├── routers/
│   ├── services/
│   └── main.py
├── miniapp/                # React Mini App (следующий этап)
├── worker/                 # Celery задачи (следующий этап)
├── shared/                 # Общий код для всех сервисов
│   ├── config/settings.py  # ← SHOP_NAME и все настройки здесь
│   ├── models/             # SQLAlchemy модели (все 20+ таблиц)
│   └── database/session.py
├── migrations/             # Alembic миграции
│   └── versions/001_initial.py
├── docker-compose.yml
├── docker-compose.dev.yml
├── .env.example            # ← Скопируй в .env и заполни
└── alembic.ini
```

## 🗄️ База данных

Применить миграции вручную:
```bash
docker compose run --rm migrations
# или
alembic upgrade head
```

Создать новую миграцию после изменения моделей:
```bash
alembic revision --autogenerate -m "описание изменений"
```

## 🔑 Обязательные переменные .env

| Переменная | Описание |
|-----------|---------|
| `SHOP_NAME` | Название магазина |
| `BOT_TOKEN` | Токен бота от @BotFather |
| `POSTGRES_PASSWORD` | Пароль PostgreSQL |
| `JWT_SECRET_KEY` | Случайная строка 32+ символа |
| `ENCRYPTION_KEY` | Fernet ключ для ключей выдачи |

## 📊 Мониторинг

- **Flower** (Celery): http://localhost:5555
- **API Docs**: http://localhost:8000/docs
- **Логи**: `docker compose logs -f [bot|api|worker]`

## 🔄 Этапы реализации

- [x] **Этап 1** — Фундамент: Docker, конфиги, структура проекта
- [x] **Этап 2** — БД: все SQLAlchemy модели + миграция
- [x] **Этап 3** — Bot MVP: /start, каталог, admin-панель
- [ ] **Этап 4** — Оплата: ЮKassa, баланс, webhook
- [ ] **Этап 5** — FastAPI: REST API для Mini App
- [ ] **Этап 6** — Mini App: React фронтенд
- [ ] **Этап 7** — Скидки, лояльность, Celery задачи
- [ ] **Этап 8** — Крипта (TON/USDT), аналитика, деплой
