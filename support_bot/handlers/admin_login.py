"""
support_bot/handlers/admin_login.py
─────────────────────────────────────────────────────────────────────────────
Подтверждение входа в админку из браузера: страница admin.redonate.gg даёт
ссылку t.me/<бот поддержки>?start=adminlogin_<nonce>, сотрудник нажимает
«Подтвердить вход». Логика — api/services/admin_auth_service.py.
Подключается раньше start.router, чтобы перехватить /start с этим параметром.
─────────────────────────────────────────────────────────────────────────────
"""

from aiogram import F, Router
from aiogram.filters import CommandObject, CommandStart
from aiogram.types import CallbackQuery, InlineKeyboardButton, InlineKeyboardMarkup, Message
from sqlalchemy.ext.asyncio import AsyncSession

from api.services import admin_auth_service as aas
from shared.models import User
from support_bot.utils.texts import texts

router = Router(name="support:admin_login")
router.message.filter(F.chat.type == "private")
router.callback_query.filter(F.message.chat.type == "private")

PREFIX = "adminlogin_"


@router.message(CommandStart(deep_link=True, magic=F.args.startswith(PREFIX)))
async def admin_login_start(message: Message, command: CommandObject, user: User, db: AsyncSession) -> None:
    nonce = (command.args or "")[len(PREFIX):]
    data = await aas.get_login_request(nonce) if nonce else None
    if not data or data.get("status") != "pending":
        await message.answer(texts.admin_login_expired)
        return
    if not await aas.active_admin_by_tg(db, user.telegram_id):
        await message.answer(texts.admin_login_no_access)
        return
    await message.answer(
        texts.admin_login_confirm(data.get("ip"), data.get("ua")),
        reply_markup=InlineKeyboardMarkup(inline_keyboard=[[
            InlineKeyboardButton(text=texts.admin_login_btn_ok, callback_data=f"adml:ok:{nonce}"),
            InlineKeyboardButton(text=texts.admin_login_btn_no, callback_data=f"adml:no:{nonce}"),
        ]]),
    )


@router.callback_query(F.data.startswith("adml:"))
async def admin_login_decide(call: CallbackQuery, user: User, db: AsyncSession) -> None:
    _, verdict, nonce = call.data.split(":", 2)
    _ok, reply = await aas.decide_login_request(db, nonce, user.telegram_id, approve=verdict == "ok")
    await call.answer()
    if call.message:
        await call.message.edit_text(reply)
