# Заказы и оплата

Самая важная часть системы: ошибка здесь стоит денег. Перед изменениями прочитайте целиком.

## Путь заказа

```
корзина ──► заказ (new/pending_payment) ──► оплата ──► paid ──► выдача ──► completed
  cart_service      order_service.create_from_cart     payment_service    order_service.change_status
```

1. **Корзина** — `api/services/cart_service.py`. Позиции хранят данные покупателя (`CartItem.input_data`: ID в игре, почта, @username). Итог с учётом скидок считает `GET /cart/quote` — отдаёт сумму для каждого способа оплаты.
2. **Создание заказа** — `OrderService.create_from_cart`. Копирует позиции в `OrderItem`, вместе с ценой, данными покупателя и инструкцией по получению на момент покупки. Корзина очищается **только после того, как оплата успешно запущена** (`meta.from_cart`). Если платёжка вернула ошибку, корзина остаётся.
3. **Оплата** — `api/routers/payments.py` → `POST /payments/orders/{id}/pay` → `PaymentService`:
   - `pay_balance` — целиком с баланса;
   - `pay_platega` — СБП / карта / крипта через Platega;
   - с флагом `use_balance` и неполным балансом — **доплата**: `OrderService.hold_balance` замораживает весь баланс, в Platega уходит остаток.
4. **Подтверждение** — вебхук Platega `POST /webhooks/platega` (`api/routers/webhooks.py` → `PaymentService.handle_platega_webhook`). Статус `CONFIRMED` переводит заказ в `paid`.
5. **`change_status(paid)`** делает всё остальное (`api/services/order_service.py`):
   - обновляет статистику покупателя (для уровня кэшбэка);
   - создаёт или привязывает чат с оператором и пишет туда системное сообщение;
   - уведомляет персонал о новом заказе (`shared/staff_notify.py`);
   - запускает автовыдачу (`_auto_deliver`), см. [AUTODELIVERY.md](AUTODELIVERY.md);
   - отправляет заказ в хаб UchetFP.
6. **Ручная выдача.** Оператор в админке нажимает «Взять» (`POST /admin/orders/{id}/claim`: paid → processing), выполняет заказ и ставит «Выполнен».
7. **`change_status(completed)`** начисляет кэшбэк (`LoyaltyService.apply_cashback`) и бонус пригласившему (`reward_referrer_for_order`), отправляет клиенту ключи или сообщение о выдаче.

## Статусы заказа

Разрешённые переходы — `ALLOWED_STATUS_TRANSITIONS` в `shared/models/order.py`:

```
new → pending_payment → paid → processing → completed ⇄ processing
                          │          ↘ clarification ↗       │
                          ↘ cancelled                         ↘ refunded
```

- `paid → completed` разрешён только для автовыдачи. Оператор всегда идёт через processing.
- `completed → processing` — откат, если выдача оказалась неудачной.
- `cancelled` и `refunded` — финальные.

**Правило:** статус меняется только через `OrderService.change_status`. Уведомление клиенту шлёт он сам — не дублируйте `send_message` после вызова, иначе клиент получит два сообщения.

`order_number` генерирует триггер БД, и он уже содержит решётку: `#000123`. Не добавляйте `#` ещё раз.

## Цены

- Цена товара задаётся в **USD** (`Product.price_usd`). `Product.price` в ₽ — это кэш:
  `₽ = USD × курс RAPIRA × (1 + наценка показа)`, округление «в 9» (…9 до 1000 ₽, …90 от 1000 ₽).
  Код: `api/services/pricing.py` (`usd_to_rub`, `round_to_nine`), курс — `api/services/rapira_service.py`.
- Курс обновляется задачей `refresh_usd_rate` дважды в сутки, она же пересчитывает все цены. Сохранение страницы «Цены» в админке пересчитывает сразу.
- Товары «за единицу» (поле типа `quantity`: звёзды, рубли Steam) — без округления «в 9», точно до копеек.
- **Наценки способов оплаты** (`markup_sbp`, `markup_card`, `markup_crypto`, `markup_balance` в `shop_settings`) прибавляются только на шаге оплаты (`pricing.method_total`). В каталоге показывается цена «как при оплате балансом».
- Platega сама добавляет клиенту свою комиссию, поэтому в Platega уходит **базовая сумма** заказа (subtotal − скидка) без нашей наценки. Иначе комиссия взялась бы дважды.

## Баланс

- `users.balance` всегда равен сумме записей `balance_transactions` этого пользователя. Задача `check_integrity` проверяет это раз в 3 часа и шлёт тревогу персоналу.
- Менять баланс можно только с записью в `BalanceTransaction` — напрямую `user.balance +=` не писать.
- **Пополнение**: `PaymentService.topup_platega` создаёт `BalanceTopup` (сумма и пользователь хранятся на нашей стороне), вебхук зачисляет через `_credit_balance_topup`. Повторно не зачислит: уникальный индекс `(provider, external_payment_id)`.
- **Холд при доплате**: `hold_balance` списывает баланс в `order.meta.balance_hold`. `release_balance_hold` возвращает его при отмене, истечении заказа, отказе или chargeback в Platega, а также при повторной оплате без баланса. Повторный холд второй раз не списывает.

## Вебхук Platega — как защищён

- Подписи у Platega нет. Проверяются заголовки `x-merchantid` / `x-secret` против наших кредов (`hmac.compare_digest`).
- Платёж ищется строго по `Id` = `Payment.external_id` / `BalanceTopup.external_id`. Полю `payload` не доверяем.
- Поиск идёт с `with_for_update()`, поэтому повторы вебхука не обработают платёж дважды.
- Сумма из вебхука сверяется с нашей. При расхождении пишется в лог, обработка продолжается.
- Callback URL в кабинете Platega: `https://redonate.gg/webhooks/platega`, **без** `/api`.

Проверить без реальной оплаты: дойдите до страницы Platega, возьмите `external_id` из БД и отправьте на сервере
`POST /webhooks/platega` с заголовками `x-merchantid` / `x-secret` и телом
`{"Id":"<external_id>","status":"CONFIRMED","amount":..,"currency":"RUB","paymentMethod":2,"payload":""}`.

## Скидки, промокоды, кэшбэк, рефералы

- `api/services/discount_service.py` — правила скидок (по времени, по сумме) и промокоды. У промокода может быть лимит на одного пользователя (`per_user_limit`).
- `api/services/loyalty_service.py` — уровни по тратам **календарного месяца**. Достигнутый уровень держится и весь следующий месяц. Кэшбэк начисляется на баланс при `completed`, с месячным лимитом уровня. Уровни настраиваются в админке (таблица `loyalty_levels`), в коде не хардкодятся.
- Реферальная программа: пригласивший получает процент с каждого заказа друга в течение N месяцев, друг — скидку на первый заказ. Настройки — в админке, «Лояльность».

## Где смотреть, если что-то не так

- Оплата не подтвердилась: `docker compose logs api | grep "Platega webhook"`. Если запросов нет — проверить callback URL в кабинете Platega.
- Ошибка при создании платежа: `grep "Platega pay error"` — там тело ответа Platega.
- Автовыдача: логи `worker` (`fragment:`, `fazer:`).
