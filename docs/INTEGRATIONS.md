# Внешние сервисы

| Сервис | Зачем | Код | Где креды |
|---|---|---|---|
| **Platega** | оплата картой (и запасной шлюз СБП / крипты) | `api/services/payment_service.py`, вебхук `api/routers/webhooks.py` | `.env`: `PLATEGA_MERCHANT_ID`, `PLATEGA_SECRET` |
| **Coinso** | СБП и крипта | `api/services/payment_service.py` (`pay_coinso`, `topup_coinso`), вебхук `/webhooks/coinso` | `.env`: `COINSO_PROJECT_ID`, `COINSO_SECRET_KEY` |
| **RAPIRA** | курс USDT/RUB для цен | `api/services/rapira_service.py` | без ключа |
| **FazerCards** | автовыдача пополнений, гифт-карт, Steam | `api/services/fazer/`, `fazer_service.py` | админка → «Интеграции» |
| **Fragment + TON** | автовыдача Telegram Stars / Premium | `api/services/fragment/` | админка → «Интеграции» |
| **HoldBoost** | наличие бустов Discord | `worker/tasks/holdboost_tasks.py` | без ключа |
| **Хаб UchetFP** | операторы ведут чаты и заказы сайта из общего хаба | `api/services/hub_*.py`, `worker/tasks/hub_tasks.py` | админка → «Интеграции» |
| **GGSEL** | отзывы продавца на сайт | `api/services/ggsel_reviews.py` | `.env`: `GGSEL_API_KEY`, `GGSEL_SELLER_ID` |
| **Unisender Go** | письма: коды входа, уведомления «почтовым» покупателям | `shared/mailer.py` | `.env`: `UNISENDER_GO_API_KEY` |
| **Яндекс.Метрика** | аналитика сайта, Вебвизор | `miniapp/src/web/seo.ts` | id счётчика в сборке |
| **IndexNow** | сообщить Яндексу об изменённых страницах | `api/services/seo_feeds.py`, `worker/tasks/seo_tasks.py` | ключ `INDEXNOW_KEY` в settings (публичный по протоколу) |
| **S3** | офсайт-бэкапы БД | `scripts/backup_db.sh` | `.env`: `BACKUP_S3_BUCKET`, `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_REGION` |
| **discordcatalog.net** | картинки и названия украшений Discord | `api/services/decor_catalog.py` | без ключа |

## Platega

Подробно — в [ORDERS_AND_PAYMENTS.md](ORDERS_AND_PAYMENTS.md). Главные грабли:
- Тело запроса `POST /transaction/process`: `paymentDetails` вложенный, поле называется `return` (не `returnUrl`), `payload` — **строка**.
- ID транзакции в ответе лежит в `transactionId`, а не в `id`.
- Коды методов: СБП = 2, карта = 11, крипта = 13 (`PLATEGA_METHOD_CODES`).
- Куда вернуть покупателя после оплаты, зависит от источника (`source`: web / miniapp / bot) — `_return_urls` в `payment_service.py`.

## Coinso

Документация — https://coinso.io/docs. Подробно о нашей стороне — в [ORDERS_AND_PAYMENTS.md](ORDERS_AND_PAYMENTS.md).
- `POST https://coinso.io/api/payment/create` с `Authorization: Bearer <Secret Key>` (не API Key!): `project_id`, `amount` (₽), `method` (`sbp` | `crypto`), `custom`, `success_url` / `fail_url`. Ответ: `invoice_id` (8 символов) и `payment_url`.
- Вебхук подписан: `X-Signature` = HMAC-SHA256 сырого тела Secret Key. Приходит с 31.43.163.127. Тестовые платежи помечены `test_mode: true`.
- Комиссию Coinso удерживает с нас — сумма счёта = то, что платит покупатель (с нашей наценкой способа).
- Ошибки — `error_code` / `error_source` (`bank` — банк-партнёр, можно повторить позже).

## Хаб UchetFP

Отдельный проект владельца (учёт продаж FunPay / GGSEL / сайта, общий интерфейс операторов). Сайт подключён к нему как «агент» аккаунта `platform=redonate`: ходит в `/agent/*` хаба с заголовком `X-Agent-Token`.

- **Чаты** (`hub_bridge.py`): сообщение покупателя уходит в хаб как диалог `rd-<chat.id>`, с историей при первом сообщении. Ответ оператора из хаба сохраняется с `source = "hub"` и обратно не отправляется. Опрос — `poll_hub` каждые 5 секунд (замок в Redis, чтобы опросы не накладывались).
- **Заказы** (`hub_orders.py`): при смене статуса заказ отправляется в хаб (`/agent/redonate_order`, сумма в USD). Кнопка «Выполнен» в хабе создаёт задачу, которую `poll_hub` выполняет через `hub_orders.apply_task`.
- Если хаб недоступен, магазин работает: сообщения уже сохранены, задача отправки повторится.

## GGSEL

API продавца: `https://seller.ggsel.com/api_sellers/api` (хост `.com`: `.net` отдаёт 502). Вход: `POST /apilogin` с `sign = sha256(key + timestamp)`. Отзывы забираются задачей `sync_ggsel_reviews` раз в 3 часа в таблицу `reviews` (`source = 'ggsel'`) и привязываются к игре по названию лота.

## Почта (Unisender Go)

Покупатели без Telegram входят по коду из письма (`api/services/email_auth_service.py`). В БД у них **отрицательный** `telegram_id` — так их отличают от Telegram-пользователей. Всё, что Telegram-пользователи получают от бота, им приходит письмом. Без `UNISENDER_GO_API_KEY` письма не отправляются, а пишутся в лог.

## Яндекс.Метрика

Счётчик подключается только после согласия на cookie (`CookieBanner`), кроме случая, когда сайт открыт внутри интерфейса Метрики (Вебвизор). Личные данные в записях скрыты классом `ym-hide-content`. Электронная коммерция (просмотр, корзина, покупка) — функции `track*` в `miniapp/src/web/seo.ts`.
