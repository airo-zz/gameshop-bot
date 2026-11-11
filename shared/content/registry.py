"""
shared/content/registry.py
─────────────────────────────────────────────────────────────────────────────
Реестр управляемого контента бота — единственный источник дефолтов.

Тексты хранятся как шаблоны с плейсхолдерами вида {name}. Плейсхолдеры
двух видов:
  • системные (shop_name, tagline, support, terms_url, privacy_url) —
    подставляются автоматически из настроек магазина;
  • динамические (first_name, balance, …) — подставляются в рантайме ботом.

Админ редактирует шаблон, но обязан сохранить плейсхолдеры {…} — иначе
переменная просто не подставится. UI подсвечивает список переменных.

Фото-слоты — точки в боте, куда можно прикрепить картинку (URL картинки
хранится в shop_settings, сам файл грузится через /admin/upload/image).
Картинки игр и сервисов сюда НЕ входят — они задаются в товарах.
─────────────────────────────────────────────────────────────────────────────
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class Variable:
    name: str          # имя плейсхолдера без скобок, напр. "first_name"
    hint: str          # человекочитаемое описание для админки
    system: bool = False  # True = подставляется автоматически из настроек


@dataclass(frozen=True)
class TextItem:
    key: str
    label: str
    group: str
    default: str
    variables: list[Variable] = field(default_factory=list)


@dataclass(frozen=True)
class PhotoItem:
    key: str
    label: str
    group: str
    hint: str = ""


# ── Системные переменные (доступны в любом тексте) ────────────────────────────

SHOP_NAME = Variable("shop_name", "Название магазина", system=True)
TAGLINE = Variable("tagline", "Слоган магазина", system=True)
SUPPORT = Variable("support", "@юзернейм бота поддержки", system=True)
TERMS_URL = Variable("terms_url", "Ссылка на пользовательское соглашение", system=True)
PRIVACY_URL = Variable("privacy_url", "Ссылка на политику конфиденциальности", system=True)


# ── Тексты ────────────────────────────────────────────────────────────────────

_TEXT_LIST: list[TextItem] = [
    TextItem(
        key="greeting",
        label="Приветствие (возврат пользователя)",
        group="Главное меню",
        default=(
            "<h2>Привет, {first_name}!</h2>\n"
            "<b>{shop_name}</b> — донат в игры и пополнение сервисов.\n"
            "<ul><li>⭐ Звёзды и Premium Telegram</li>"
            "<li>💳 Steam по логину</li>"
            "<li>🎮 Донат в игры и сервисы</li></ul>\n"
            "Что пополним?\n"
            "<footer>Можно просто написать название игры</footer>"
        ),
        variables=[
            Variable("first_name", "Имя пользователя"),
            SHOP_NAME,
            TAGLINE,
        ],
    ),
    TextItem(
        key="greeting_new_user",
        label="Приветствие (новый пользователь)",
        group="Главное меню",
        default=(
            "<h2>Привет, {first_name}!</h2>\n"
            "Это <b>{shop_name}</b> — донат в игры и пополнение сервисов.\n"
            "<ul><li>⭐ Звёзды и Premium Telegram</li>"
            "<li>💳 Steam по логину</li>"
            "<li>🎮 Донат в игры и сервисы</li></ul>\n"
            "С каждой покупки — кэшбэк на баланс.{bonus}\n\n"
            "Что пополним?\n"
            "<footer>Можно просто написать название игры</footer>"
        ),
        variables=[
            Variable("first_name", "Имя пользователя"),
            Variable("bonus", "Блок про реферальный бонус (появляется автоматически)"),
            SHOP_NAME,
            TAGLINE,
        ],
    ),
    TextItem(
        key="choose_action",
        label="Подсказка «Выбери действие»",
        group="Главное меню",
        default="👇 Выбери действие:",
    ),
    TextItem(
        key="catalog_header",
        label="Заголовок каталога игр",
        group="Каталог",
        default=(
            "<h2>Донат в игры</h2>\n"
            "Самые популярные — первыми, листай стрелками ◀️ ▶️.\n"
            "<footer>Нужна конкретная игра — нажми 🔍 или просто напиши её название</footer>"
        ),
        variables=[SHOP_NAME],
    ),
    TextItem(
        key="services_header",
        label="Заголовок каталога сервисов",
        group="Каталог",
        default=(
            "<h2>Сервисы</h2>\n"
            "Steam, PlayStation, App Store, Discord и другие.\n"
            "<footer>Выбери сервис ниже или напиши его название</footer>"
        ),
        variables=[SHOP_NAME],
    ),
    TextItem(
        key="catalog_empty",
        label="Пустой каталог",
        group="Каталог",
        default="😔 Каталог пуст. Скоро добавим товары!",
    ),
    TextItem(
        key="cart_empty",
        label="Пустая корзина",
        group="Корзина и заказы",
        default=(
            "<h2>Корзина пуста</h2>\n"
            "Перейди в каталог {shop_name}, чтобы добавить товары."
        ),
        variables=[SHOP_NAME],
    ),
    TextItem(
        key="orders_empty",
        label="Нет заказов",
        group="Корзина и заказы",
        default="<h2>Заказов пока нет</h2>\nПерейди в каталог и сделай первую покупку!",
    ),
    TextItem(
        key="favorites_empty",
        label="Пустое избранное",
        group="Корзина и заказы",
        default=(
            "<h2>Избранное</h2>\n"
            "У тебя нет избранных товаров. Добавляй через каталог!"
        ),
    ),
    TextItem(
        key="profile",
        label="Профиль",
        group="Профиль и баланс",
        default=(
            "<h2>{first_name}</h2>\n"
            "<table striped compact>"
            "<tr><td>Баланс</td><td align=\"right\"><b>{balance} ₽</b></td></tr>"
            "<tr><td>Заказов</td><td align=\"right\"><b>{orders_count}</b></td></tr>"
            "<tr><td>Уровень</td><td align=\"right\">{loyalty_emoji} <b>{loyalty_name}</b></td></tr>"
            "</table>\n"
            "{progress}"
        ),
        variables=[
            Variable("first_name", "Имя пользователя"),
            Variable("balance", "Текущий баланс"),
            Variable("orders_count", "Количество заказов"),
            Variable("loyalty_emoji", "Иконка уровня лояльности"),
            Variable("loyalty_name", "Название уровня лояльности"),
            Variable("progress", "Строка прогресса до следующего уровня (автоматически)"),
        ],
    ),
    TextItem(
        key="balance_info",
        label="Баланс (/balance)",
        group="Профиль и баланс",
        default=(
            "<h2>Баланс: {balance} ₽</h2>\n"
            "<table striped compact>"
            "<tr><td>Заказов</td><td align=\"right\"><b>{orders_count}</b></td></tr>"
            "<tr><td>Потрачено всего</td><td align=\"right\"><b>{total_spent} ₽</b></td></tr>"
            "</table>\n"
            "<footer>Балансом можно оплатить заказ целиком или частично</footer>"
        ),
        variables=[
            Variable("balance", "Текущий баланс"),
            Variable("orders_count", "Количество заказов"),
            Variable("total_spent", "Всего потрачено"),
        ],
    ),
    TextItem(
        key="balance_topup_methods",
        label="Экран управления балансом",
        group="Профиль и баланс",
        default=(
            "<h2>Баланс: {balance} ₽</h2>\n"
            "Пополни заранее — заказы будут оплачиваться в одно касание.\n"
            "<footer>Балансом можно оплатить заказ целиком или частично</footer>"
        ),
        variables=[Variable("balance", "Текущий баланс")],
    ),
    TextItem(
        key="support_header",
        label="Экран поддержки",
        group="Поддержка и справка",
        default=(
            "<h2>Поддержка {shop_name}</h2>\n"
            "Напиши в бот поддержки или открой чат в приложении — оператор ответит в переписке.\n"
            "<h4>Документы</h4>"
            '<ul><li><a href="{terms_url}">Пользовательское соглашение</a></li>'
            '<li><a href="{privacy_url}">Политика конфиденциальности</a></li></ul>'
        ),
        variables=[SHOP_NAME, TERMS_URL, PRIVACY_URL],
    ),
    TextItem(
        key="faq",
        label="FAQ",
        group="Поддержка и справка",
        default=(
            "<h2>Частые вопросы</h2>\n"
            "<details><summary>Как быстро выдаётся товар?</summary>"
            "<p>С автовыдачей — сразу после оплаты. Остальное выполняет оператор в чате: "
            "обычно 5–30 минут, в редких случаях до 3 часов.</p></details>"
            "<details><summary>Какие способы оплаты?</summary>"
            "<p>СБП, банковская карта, криптовалюта и баланс бота.</p></details>"
            "<details><summary>Что делать, если товар не пришёл?</summary>"
            "<p>Напиши в бот поддержки {support} — разберёмся.</p></details>"
            "<details><summary>Есть ли скидки?</summary>"
            "<p>Да: с каждой покупки — кэшбэк на баланс, процент растёт вместе с уровнем.</p></details>"
            "<details><summary>Как работает реферальная программа?</summary>"
            "<p>Поделись ссылкой из профиля — получай процент с каждого заказа друга.</p></details>"
        ),
        variables=[SHOP_NAME, SUPPORT],
    ),
    TextItem(
        key="help_text",
        label="Справка (/help)",
        group="Поддержка и справка",
        default=(
            "<h2>Команды {shop_name}</h2>\n"
            "<table striped compact>"
            "<tr><td>/start</td><td>главное меню</td></tr>"
            "<tr><td>/orders</td><td>мои заказы</td></tr>"
            "<tr><td>/balance</td><td>мой баланс</td></tr>"
            "<tr><td>/favorites</td><td>избранное</td></tr>"
            "<tr><td>/referral</td><td>реферальная ссылка</td></tr>"
            "<tr><td>/support</td><td>поддержка</td></tr>"
            "<tr><td>/info</td><td>документы и информация</td></tr>"
            "<tr><td>/help</td><td>эта справка</td></tr>"
            "</table>"
        ),
        variables=[SHOP_NAME],
    ),
    TextItem(
        key="info_text",
        label="Информация (/info)",
        group="Поддержка и справка",
        default=(
            "<h2>{shop_name} — информация</h2>\n"
            "{shop_name} — сервис покупки игрового доната и цифровых товаров.\n"
            "<h4>Документы</h4>"
            '<ul><li><a href="{terms_url}">Пользовательское соглашение</a></li>'
            '<li><a href="{privacy_url}">Политика конфиденциальности</a></li></ul>'
            "<h4>Поддержка и обратная связь</h4>"
            "<ul><li>бот поддержки {support}</li>"
            "<li>чат в приложении (раздел «Поддержка»)</li></ul>"
        ),
        variables=[SHOP_NAME, SUPPORT, TERMS_URL, PRIVACY_URL],
    ),
]

TEXTS: dict[str, TextItem] = {item.key: item for item in _TEXT_LIST}


# ── Фото-слоты ────────────────────────────────────────────────────────────────

_PHOTO_LIST: list[PhotoItem] = [
    PhotoItem(
        key="main_menu",
        label="Главное меню (/start)",
        group="Экраны бота",
        hint="Картинка над приветствием при запуске бота.",
    ),
    PhotoItem(
        key="catalog_games",
        label="Каталог игр",
        group="Экраны бота",
        hint="Картинка над списком игр.",
    ),
    PhotoItem(
        key="catalog_services",
        label="Каталог сервисов",
        group="Экраны бота",
        hint="Картинка над списком сервисов.",
    ),
    PhotoItem(
        key="balance",
        label="Баланс",
        group="Экраны бота",
        hint="Картинка над экраном баланса.",
    ),
    PhotoItem(
        key="profile",
        label="Профиль",
        group="Экраны бота",
        hint="Картинка над экраном профиля.",
    ),
    PhotoItem(
        key="cart",
        label="Корзина",
        group="Экраны бота",
        hint="Картинка над содержимым корзины.",
    ),
    PhotoItem(
        key="orders",
        label="Мои заказы",
        group="Экраны бота",
        hint="Картинка над списком заказов пользователя.",
    ),
    PhotoItem(
        key="support",
        label="Поддержка",
        group="Экраны бота",
        hint="Картинка над экраном поддержки.",
    ),
    PhotoItem(
        key="referral",
        label="Реферальная программа",
        group="Экраны бота",
        hint="Картинка над экраном реферальной программы.",
    ),
]

PHOTOS: dict[str, PhotoItem] = {item.key: item for item in _PHOTO_LIST}
