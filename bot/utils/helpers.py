"""bot/utils/helpers.py — вспомогательные функции для handlers."""

from aiogram.exceptions import TelegramBadRequest
from aiogram.fsm.context import FSMContext
from aiogram.types import InlineKeyboardMarkup, Message


async def safe_edit(
    message: Message,
    text: str,
    reply_markup: InlineKeyboardMarkup | None = None,
    parse_mode: str = "HTML",
) -> None:
    """
    Пытается отредактировать сообщение. Если не получается (нет текста, удалено)
    — отправляет новое и удаляет старое.
    """
    try:
        await message.edit_text(text, reply_markup=reply_markup, parse_mode=parse_mode)
    except TelegramBadRequest:
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
