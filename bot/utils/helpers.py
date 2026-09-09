"""bot/utils/helpers.py — вспомогательные функции для handlers."""

from aiogram.exceptions import TelegramBadRequest
from aiogram.fsm.context import FSMContext
from aiogram.types import (
    CallbackQuery,
    InlineKeyboardMarkup,
    InputMediaPhoto,
    Message,
)

# Маркеры ошибок Telegram API: сообщение уже не существует
_TG_NOT_FOUND = ("message to edit not found", "MESSAGE_ID_INVALID")


async def safe_edit(
    message: Message,
    text: str,
    reply_markup: InlineKeyboardMarkup | None = None,
    parse_mode: str = "HTML",
) -> None:
    """
    Пытается отредактировать сообщение.
    Порядок: edit_text → edit_caption (фото/видео) → delete + answer.

    "message is not modified" — не ошибка, тихо игнорируется без fallback.
    "message to edit not found" — сообщение удалено, отправляем новое.
    """

    try:
        await message.edit_text(text, reply_markup=reply_markup, parse_mode=parse_mode)
        return
    except TelegramBadRequest as e:
        err = str(e)
        if "message is not modified" in err:
            return  # Контент не изменился — это не ошибка, fallback не нужен
        if any(marker in err for marker in _TG_NOT_FOUND):
            # Сообщение уже удалено — отправляем новое без попытки удалить
            await message.answer(text, reply_markup=reply_markup, parse_mode=parse_mode)
            return
        # "there is no text in the message to edit" → пробуем edit_caption ниже
        # Прочие ошибки → тоже пробуем edit_caption как fallback

    # Для фото/видео сообщений — редактируем подпись, не удаляя сообщение
    try:
        await message.edit_caption(caption=text, reply_markup=reply_markup, parse_mode=parse_mode)
        return
    except TelegramBadRequest as e:
        err = str(e)
        if "message is not modified" in err:
            return
        if any(marker in err for marker in _TG_NOT_FOUND):
            await message.answer(text, reply_markup=reply_markup, parse_mode=parse_mode)
            return

    # Крайний случай: удалить старое и отправить новое
    try:
        await message.delete()
    except TelegramBadRequest:
        pass
    await message.answer(text, reply_markup=reply_markup, parse_mode=parse_mode)


async def nav_edit(
    message: Message,
    state: FSMContext,
    text: str,
    reply_markup: InlineKeyboardMarkup | None = None,
    parse_mode: str = "HTML",
) -> None:
    """
    Для Message-хендлеров (ReplyKeyboard/команды):
    удаляет сообщение пользователя, редактирует сохранённый nav-msg.
    Если nav-msg не найден или удалён — отправляет новый и сохраняет ID.
    """
    try:
        await message.delete()
    except TelegramBadRequest:
        pass

    data = await state.get_data()
    nav_msg_id = data.get("nav_msg_id")

    if nav_msg_id:
        try:
            await message.bot.edit_message_text(
                chat_id=message.chat.id,
                message_id=nav_msg_id,
                text=text,
                reply_markup=reply_markup,
                parse_mode=parse_mode,
            )
            return
        except TelegramBadRequest:
            pass  # Сообщение удалено или слишком старое

    # Отправляем новое и сохраняем ID
    sent = await message.answer(text, reply_markup=reply_markup, parse_mode=parse_mode)
    await state.update_data(nav_msg_id=sent.message_id)


# ── Экраны с управляемой картинкой ────────────────────────────────────────────


async def _render_in_place(
    message: Message,
    text: str,
    photo_url: str | None,
    reply_markup: InlineKeyboardMarkup | None,
    parse_mode: str,
) -> int:
    """
    Редактирует текущее сообщение под целевой экран (с фото или без).

    Переходы между типами сообщений (текст ↔ фото) невозможно сделать
    редактированием, поэтому в таких случаях старое сообщение удаляется
    и отправляется новое. Возвращает id актуального сообщения на экране.
    """
    has_photo_now = bool(message.photo)

    if photo_url:
        if has_photo_now:
            try:
                await message.edit_media(
                    media=InputMediaPhoto(
                        media=photo_url, caption=text, parse_mode=parse_mode
                    ),
                    reply_markup=reply_markup,
                )
                return message.message_id
            except TelegramBadRequest as e:
                if "message is not modified" in str(e):
                    # Картинка та же — обновим подпись/клавиатуру
                    try:
                        await message.edit_caption(
                            caption=text, reply_markup=reply_markup, parse_mode=parse_mode
                        )
                    except TelegramBadRequest:
                        pass
                    return message.message_id
                # Иная ошибка → пересоздаём сообщение ниже
        try:
            await message.delete()
        except TelegramBadRequest:
            pass
        sent = await message.answer_photo(
            photo=photo_url, caption=text, reply_markup=reply_markup, parse_mode=parse_mode
        )
        return sent.message_id

    # Целевой экран без картинки
    if has_photo_now:
        try:
            await message.delete()
        except TelegramBadRequest:
            pass
        sent = await message.answer(text, reply_markup=reply_markup, parse_mode=parse_mode)
        return sent.message_id

    await safe_edit(message, text, reply_markup=reply_markup, parse_mode=parse_mode)
    return message.message_id


async def render_screen(
    event: Message | CallbackQuery,
    state: FSMContext | None,
    text: str,
    photo_url: str | None = None,
    reply_markup: InlineKeyboardMarkup | None = None,
    parse_mode: str = "HTML",
) -> None:
    """
    Универсальный рендер экрана бота с опциональной картинкой сверху.

    • CallbackQuery — редактирует сообщение на месте (edit_media / edit_text),
      при несовместимости типов пересоздаёт сообщение.
    • Message — поведение nav_edit: удаляет сообщение пользователя и
      обновляет сохранённый nav-msg (нужен state).
    """
    # Подпись к фото в Telegram ограничена 1024 символами. Если текст экрана
    # длиннее — показываем без картинки, чтобы отправка не упала.
    if photo_url and len(text) > 1024:
        photo_url = None

    if isinstance(event, CallbackQuery):
        new_id = await _render_in_place(
            event.message, text, photo_url, reply_markup, parse_mode
        )
        if state is not None:
            await state.update_data(nav_msg_id=new_id)
        await event.answer()
        return

    # Message-хендлеры (ReplyKeyboard / команды)
    try:
        await event.delete()
    except TelegramBadRequest:
        pass

    nav_msg_id = None
    if state is not None:
        data = await state.get_data()
        nav_msg_id = data.get("nav_msg_id")

    if nav_msg_id:
        try:
            if photo_url:
                await event.bot.edit_message_media(
                    chat_id=event.chat.id,
                    message_id=nav_msg_id,
                    media=InputMediaPhoto(
                        media=photo_url, caption=text, parse_mode=parse_mode
                    ),
                    reply_markup=reply_markup,
                )
            else:
                await event.bot.edit_message_text(
                    chat_id=event.chat.id,
                    message_id=nav_msg_id,
                    text=text,
                    reply_markup=reply_markup,
                    parse_mode=parse_mode,
                )
            return
        except TelegramBadRequest:
            pass  # удалено / устарело / несовместимый тип → отправим новое

    if photo_url:
        sent = await event.answer_photo(
            photo=photo_url, caption=text, reply_markup=reply_markup, parse_mode=parse_mode
        )
    else:
        sent = await event.answer(text, reply_markup=reply_markup, parse_mode=parse_mode)
    if state is not None:
        await state.update_data(nav_msg_id=sent.message_id)
