# Архитектура

## Сервисы (docker-compose.yml)

Всё работает на одном VPS в Docker Compose. Образов собирается два: `gameshop-app` (API, миграции, Celery) и `gameshop-botimg` (оба бота).

| Сервис | Образ | Что делает |
|---|---|---|
| `db` | postgres:16 | основная база |
| `redis` | redis:7 | очередь Celery, кэш, замки, лимиты запросов |
| `migrations` | gameshop-app | при деплое прогоняет `alembic upgrade head` и выходит |
| `api` | gameshop-app | FastAPI: REST для сайта/Mini App/админки, вебхуки платёжки, SEO-страницы |
| `bot` | gameshop-botimg | бот магазина (aiogram, вебхук `/webhook/bot`) |
| `support_bot` | gameshop-botimg | бот поддержки: уведомления персоналу, ответы клиентам, вход в админку |
| `worker` | gameshop-app | Celery worker — выполняет фоновые задачи |
| `beat` | gameshop-app | Celery beat — запускает задачи по расписанию (`worker/main.py`) |
| `flower` | gameshop-app | веб-монитор Celery |
| `nginx` | nginx | HTTPS, раздача фронтенда, проксирование на `api` |
| `certbot` | certbot | продление сертификатов Let's Encrypt |

## Как части связаны

```
 браузер / Telegram
        │
      nginx ──── статика: miniapp/dist (/app), dist-web (сайт), dist-admin (admin.)
        │
        ├── /api/v1/*      → api (FastAPI)
        ├── /webhooks/*    → api (Platega)
        ├── /webhook/bot   → bot
        └── /game/*, /     → api отдаёт HTML для поисковиков (seo.py), браузер грузит React
                               │
   api ── bot ── support_bot ── worker   ← все импортируют одни и те же api/services и shared/
                               │
                     PostgreSQL + Redis
```

Важно: **боты не ходят в API по HTTP**. Они импортируют те же сервисы из `api/services/` и работают с базой напрямую (сессия приходит через middleware). Поэтому логика заказа, корзины и оплаты одна для сайта, Mini App и бота.

## Слои бэкенда

```
api/routers/*.py        приём HTTP-запроса, проверка прав, вызов сервиса, ответ по схеме
api/services/*.py       вся бизнес-логика (цены, заказы, оплата, выдача, интеграции)
api/schemas/*.py        Pydantic-схемы входа/выхода API
shared/models/*.py      SQLAlchemy-таблицы
migrations/versions/    изменения схемы БД
```

Боты: `bot/handlers/*` → `api/services/*`. Фоновые задачи: `worker/tasks/*` → `api/services/*`.

## Модель данных (главное)

Каталог плоский: **Game → Category (может иметь подкатегории) → Product**.

| Таблица | Модель | Смысл |
|---|---|---|
| games | `Game` | игра или сервис (`type`: game / service); SEO-поля, поля ввода по умолчанию |
| categories | `Category` | раздел игры («Алмазы», «Наборы»); `auto_engine` — движок автовыдачи; `input_fields` — какие данные спросить у покупателя |
| products | `Product` | товар; цена задаётся в USD (`price_usd`), `price` в ₽ — пересчитывается; `meta` — настройки автовыдачи |
| product_keys | `ProductKey` | ключи для выдачи (шифруются Fernet) |
| users | `User` | покупатель: Telegram (положительный `telegram_id`) или почта (отрицательный `telegram_id`); баланс |
| balance_transactions | `BalanceTransaction` | все движения баланса; сумма = `users.balance` (проверяется задачей `check_integrity`) |
| balance_topups | `BalanceTopup` | пополнения баланса через Platega |
| carts / cart_items | `Cart`, `CartItem` | корзина |
| orders / order_items | `Order`, `OrderItem` | заказ; `order_number` генерирует триггер БД (`#000123`) |
| order_status_history | `OrderStatusHistory` | журнал смен статуса |
| payments | `Payment` | платёж по заказу (`external_id` = id транзакции Platega) |
| discount_rules, promo_codes, promo_code_usages | — | скидки и промокоды |
| loyalty_levels | `LoyaltyLevel` | уровни кэшбэка |
| referral_rewards | `ReferralReward` | начисления по реферальной программе |
| chats / chat_messages | `Chat`, `ChatMessage` | чат покупателя с оператором (сайт и Mini App) |
| support_tickets, ticket_messages | — | обращения в поддержку через бота |
| reviews | `Review` | отзывы: с сайта и синхронизированные с GGSEL |
| admin_users, admin_sessions, admin_action_log | — | сотрудники, их сессии в админке, журнал действий |
| shop_settings | `ShopSettings` | «ключ → значение»: курс, наценки, тексты бота, креды интеграций (зашифрованы) |

## Где хранятся настройки

- **`.env` на сервере** → `shared/config/settings.py`. Токены ботов, пароль БД, ключи шифрования, креды Platega, домены. Меняются только на сервере, после изменения — перезапуск контейнеров.
- **`shop_settings` в БД** — всё, что меняют из админки: курс и наценки, тексты и фото бота, ключи FazerCards / Fragment / хаба (шифруются `ENCRYPTION_KEY`), главная страница, лояльность.

## Фоновые задачи (worker/main.py → beat_schedule)

| Задача | Когда | Что делает |
|---|---|---|
| `check_abandoned_carts` | каждые 30 мин | напоминание о брошенной корзине |
| `recalculate_all_loyalty` | 03:00 | пересчёт уровней кэшбэка |
| `expire_pending_orders` | каждые 10 мин | отмена неоплаченных заказов, возврат холда баланса |
| `purge_old_deleted_orders` | 04:00 | очистка корзины удалённых заказов |
| `refresh_usd_rate` | 06:00 и 18:00 UTC | курс USD/RUB с RAPIRA и пересчёт цен |
| `check_integrity` | раз в 3 ч | баланс = сумма транзакций, свежесть бэкапа |
| `sync_ggsel_reviews` | раз в 3 ч | отзывы с GGSEL |
| `watch_fazer` | каждые 5 мин | баланс FazerCards и поздние возвраты |
| `sync_decor_catalog` | каждый час | каталог украшений Discord |
| `poll_hub` | каждые 5 с | ответы операторов и команды из хаба UchetFP |
| `sync_holdboost_stock` | каждые 10 мин | наличие бустов Discord у HoldBoost |
| `submit_indexnow` | 05:30 | отправка изменённых страниц в IndexNow (Яндекс) |

Задачи по событию (не по расписанию): выдача Fragment (`deliver_fragment_order`), выдача FazerCards (`deliver_fazer_order`), отправка в хаб (`push_to_hub`, `push_order_to_hub`), уведомления о сообщениях чата (`chat_notifications`), рассылки (`notification_tasks.broadcast`).

Celery-задачи работают с базой только через `shared.database.session.get_worker_db_session()` — свой движок на каждый запуск. Общий `get_db_session` в воркере даёт ошибку «attached to a different loop».

## Уведомления персоналу

Всё идёт через `shared/staff_notify.py`: в группу персонала (привязывается командой `/bindgroup` в боте поддержки), а если группы нет — в личку администраторам. На сообщение о заказе или чате можно ответить Reply — ответ уйдёт клиенту (`support_bot/handlers/group.py`).
