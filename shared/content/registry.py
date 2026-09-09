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
            "👋 Привет, {first_name}!\n\n"
            "Добро пожаловать в <b>{shop_name}</b> — {tagline}.\n\n"
            "Выбери действие:"
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
            "🎉 Добро пожаловать в <b>{shop_name}</b>!\n\n"
            "{tagline}.\n\n"
            "Здесь ты можешь быстро и безопасно купить игровой донат, "
            "скины и многое другое.{bonus}\n\n"
            "Используй кнопки ниже для навигации:"
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
        default="🎮 <b>Каталог {shop_name}</b>\n\nВыбери игру:",
        variables=[SHOP_NAME],
    ),
    TextItem(
        key="services_header",
        label="Заголовок каталога сервисов",
        group="Каталог",
        default="🔧 <b>Сервисы {shop_name}</b>\n\nВыбери сервис:",
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
            "🛒 Твоя корзина пуста.\n\n"
            "Перейди в каталог {shop_name}, чтобы добавить товары."
        ),
        variables=[SHOP_NAME],
    ),
    TextItem(
        key="orders_empty",
        label="Нет заказов",
        group="Корзина и заказы",
        default="📋 У тебя пока нет заказов.\n\nПерейди в каталог и сделай первую покупку!",
    ),
    TextItem(
        key="favorites_empty",
        label="Пустое избранное",
        group="Корзина и заказы",
        default=(
            "❤️ <b>Избранное</b>\n\n"
            "У тебя нет избранных товаров. Добавляй через каталог!"
        ),
    ),
    TextItem(
        key="profile",
        label="Профиль",
        group="Профиль и баланс",
        default=(
            "👤 <b>Профиль</b>\n"
            "━━━━━━━━━━━━━━━\n"
            "Имя: {first_name}\n"
            "Баланс: <b>{balance} ₽</b>\n"
            "Заказов: <b>{orders_count}</b>\n"
            "Уровень: {loyalty_emoji} <b>{loyalty_name}</b>{progress}"
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
            "💰 <b>Баланс</b>\n\n"
            "Текущий баланс: <b>{balance} ₽</b>\n"
            "Заказов: <b>{orders_count}</b>\n"
            "Потрачено всего: <b>{total_spent} ₽</b>"
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
            "💰 <b>Управление балансом</b>\n\n"
            "Текущий баланс: <b>{balance} ₽</b>"
        ),
        variables=[Variable("balance", "Текущий баланс")],
    ),
    TextItem(
        key="support_header",
        label="Экран поддержки",
        group="Поддержка и справка",
        default=(
            "💬 <b>Поддержка {shop_name}</b>\n\n"
            "Для помощи обратись в наш бот поддержки.\n"
            "Время ответа: обычно до 4 часов.\n\n"
            "<b>Документы:</b>\n"
            '• <a href="{terms_url}">Пользовательское соглашение</a>\n'
            '• <a href="{privacy_url}">Политика конфиденциальности</a>'
        ),
        variables=[SHOP_NAME, TERMS_URL, PRIVACY_URL],
    ),
    TextItem(
        key="faq",
        label="FAQ",
        group="Поддержка и справка",
        default=(
            "❓ <b>FAQ — {shop_name}</b>\n\n"
            "<b>Как быстро выдаётся товар?</b>\n"
            "Автоматические товары — мгновенно после оплаты.\n"
            "Ручные — в течение 1–24 часов.\n\n"
            "<b>Какие способы оплаты?</b>\n"
            "Баланс бота, USDT, TON и другая крипта.\n\n"
            "<b>Что делать если товар не пришёл?</b>\n"
            "Напиши в бот поддержки {support}.\n\n"
            "<b>Есть ли скидки?</b>\n"
            "Да! Программа лояльности Bronze → Silver → Gold → VIP.\n"
            "Чем больше покупаешь — тем больше скидка.\n\n"
            "<b>Как работает реферальная программа?</b>\n"
            "Поделись своим кодом из профиля — получи бонус за каждого друга."
        ),
        variables=[SHOP_NAME, SUPPORT],
    ),
    TextItem(
        key="help_text",
        label="Справка (/help)",
        group="Поддержка и справка",
        default=(
            "🤖 <b>Команды {shop_name}</b>\n\n"
            "/start — главное меню\n"
            "/orders — мои заказы\n"
            "/balance — мой баланс\n"
            "/favorites — избранное\n"
            "/referral — реферальная ссылка\n"
            "/support — поддержка\n"
            "/info — документы и информация\n"
            "/help — эта справка"
        ),
        variables=[SHOP_NAME],
    ),
    TextItem(
        key="info_text",
        label="Информация (/info)",
        group="Поддержка и справка",
        default=(
            "ℹ️ <b>{shop_name} — информация</b>\n\n"
            "{shop_name} — сервис покупки игрового доната и цифровых товаров.\n\n"
            "<b>Документы:</b>\n"
            '• <a href="{terms_url}">Пользовательское соглашение</a>\n'
            '• <a href="{privacy_url}">Политика конфиденциальности</a>\n\n'
            "<b>Поддержка и обратная связь:</b>\n"
            "• бот поддержки {support}\n"
            "• тикет-система в приложении (раздел «Поддержка»)"
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
