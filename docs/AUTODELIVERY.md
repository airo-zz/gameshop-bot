# Автоматическая выдача

После оплаты (`OrderService.change_status(paid)` → `_auto_deliver`) каждая позиция заказа выдаётся одним из способов:

| Способ | Как товар помечен | Кто выдаёт |
|---|---|---|
| Вручную | `delivery_type = manual` | оператор в админке |
| Ключи | `delivery_type = auto`, ключи в `product_keys` | сразу, внутри `_auto_deliver` |
| Fragment (Telegram Stars / Premium) | `Category.auto_engine = telegram_stars / telegram_premium` | Celery `deliver_fragment_order` |
| FazerCards (пополнение по ID, гифт-карты, Steam) | `Product.meta.fazer = {...}` | Celery `deliver_fazer_order` |
| Внешний без ключей | `delivery_type = auto` + `Product.meta.auto_source = 'external'` | пока оператор (своего движка нет) |

Если все позиции заказа выданы автоматически, заказ сразу переходит в `completed` (переход `paid → completed` разрешён именно для этого). Если хотя бы одна позиция ручная — заказ ждёт оператора в `paid`.

`order_service._is_keyless_auto(product)` — товары, которым не нужны ключи (движок или `auto_source = external`). Без этой проверки заказ на такой товар блокировался бы с ошибкой «нет ключей».

## Ключи

- Ключи хранятся в `product_keys` зашифрованными (Fernet, `ENCRYPTION_KEY`).
- При оформлении заказа ключи **резервируются** (`_reserve_keys`), при отмене — освобождаются (`_release_reserved_keys`).
- Загружаются в админке на странице товара.

## Fragment — Telegram Stars и Premium

Покупка на fragment.com со своего TON-кошелька.

- Код: `api/services/fragment/` (клиент Fragment, TON-кошелёк, движки `stars_engine.py` / `premium_engine.py`), креды — `api/services/fragment_config.py`.
- Настройка (админка → «Интеграции»): три cookie Fragment (`stel_ssid`, `stel_token`, `stel_ton_token`), seed-фраза TON-кошелька из 24 слов, способ оплаты `ton` или `usdt_ton`, тумблер «включено». Всё хранится зашифрованным в `shop_settings`.
- Раздел (категория): «Автовыдача = Telegram Stars/Premium» и поле покупателя с @username.
- Товар Stars — цена за 1 звезду и поле «Количество» (`type: quantity`). Товары Premium — отдельные тарифы, срок (3/6/12 мес.) берётся из названия.
- На кошельке должны быть TON на комиссию, а при `usdt_ton` ещё и USDT.
- Логи воркера: `fragment: item=... ok=... detail=...`.

## FazerCards — пополнения по ID, гифт-карты, Steam

API `api.fzr.cards/api/v2`, ключ `X-API-Key` (вписывается в «Интеграции», хранится зашифрованным).

- Код: `api/services/fazer/` (клиент и движок), `fazer_config.py`, `fazer_service.py` (каталог, импорт номиналов, перевыдача), админ-роутер `api/routers/admin/fazer.py`, задачи `worker/tasks/fazer_tasks.py`.
- Товар — это номинал или набор номиналов Fazer в `Product.meta.fazer = {kind: topup | giftcard | steam_topup, category_id, offer_ids | card_ids, currency, cost_usd, ...}`.
- Заводится из админки: в каталоге молния у категории → выбор игры у Fazer → номиналы → наценка → «Создать». Поля покупателя создаются с теми же ключами, что ждёт Fazer.
- Повторная выдача не спишет деньги второй раз: `Idempotency-Key = rd-<item_id>-<attempt>-<leg>`. Ручная перевыдача («Повторить выдачу» в заказе) увеличивает attempt.
- Результат пишется в `OrderItem.delivery_data.fazer` (state: ok / pending / fail / refunded / queued). Коды гифт-карт попадают в `delivery_data.keys` и уходят покупателю.
- `watch_fazer` каждые 5 минут проверяет баланс у Fazer (ниже порога — тревога персоналу) и возвраты после «успеха».
- Тесты движка: `tests/test_fazer_engine.py` (фейковый API).

## HoldBoost — бусты Discord (только наличие)

Бусты оператор покупает вручную. Автоматически синхронизируется только **наличие**:
- `worker/tasks/holdboost_tasks.py` раз в 10 минут читает открытый `GET api.holdboost.store/v1/boosts/stock`;
- товары помечены `Product.meta.holdboost = {"months": 1|3, "amount": N}`;
- если запаса не хватает — товар «Нет в наличии». Если HoldBoost не ответил, наличие не трогаем.

## Украшения Discord

Каталог общий с проектом UchetFP: файлы каталога смонтированы в контейнеры только на чтение (`settings.DECOR_CATALOG_DIR`), картинки и английские названия берутся с discordcatalog.net. Синхронизация — `sync_decor_catalog` раз в час. Код: `api/services/decor_catalog.py`. Выдаёт оператор — подарком на аккаунт Discord.
