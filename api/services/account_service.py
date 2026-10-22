"""
api/services/account_service.py
─────────────────────────────────────────────────────────────────────────────
Аккаунты сайта: гости чата, объединение двух аккаунтов одного человека,
отвязка способов входа.

Объединение (merge_users) выполняется только когда человек в одной сессии
доказал оба входа (вошёл в один аккаунт и подтвердил кодом/подписью Telegram
второй) — либо при входе гостя. Всё в одной транзакции запроса: любая ошибка
откатывает объединение целиком.

Итоговый аккаунт:
  • настоящий Telegram ID — от того аккаунта, у которого он есть (иначе бот
    не увидит покупателя); два разных Telegram объединить нельзя;
  • почта — подтверждённая в этой операции (verified_email) или та, что есть;
  • заказы, платежи, история баланса, корзина, избранное, рефералы — переносятся;
  • баланс, сумма трат и число заказов — складываются;
  • переписка — в одну ленту.
─────────────────────────────────────────────────────────────────────────────
"""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import delete, select, text, update
from sqlalchemy.ext.asyncio import AsyncSession

from shared.models import EMAIL_USER_ID_BASE, Chat, User, is_telegram_id


class AccountError(Exception):
    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.message = message
        self.status = status


async def new_service_id(db: AsyncSession) -> int:
    """Служебный отрицательный telegram_id для пользователя без Telegram."""
    seq = (await db.execute(text("SELECT nextval('email_user_id_seq')"))).scalar_one()
    return -(EMAIL_USER_ID_BASE + int(seq))


# ── Гости ─────────────────────────────────────────────────────────────────────


async def create_guest(db: AsyncSession) -> User:
    sid = await new_service_id(db)
    user = User(
        telegram_id=sid,
        first_name=f"Гость {(-sid) - EMAIL_USER_ID_BASE}",
        is_guest=True,
        last_active_at=datetime.now(timezone.utc),
    )
    db.add(user)
    await db.flush()
    return user


# ── Объединение ───────────────────────────────────────────────────────────────


def merge_summary(user: User) -> dict:
    """Что пользователь увидит в вопросе «Объединить?»."""
    return {
        "name": user.display_name,
        "email": user.email,
        "has_telegram": user.has_telegram,
        "orders_count": user.orders_count,
        "balance": float(user.balance),
    }


def pick_target(current: User, other: User) -> tuple[User, User]:
    """(target, source): остаётся аккаунт с настоящим Telegram, иначе текущий."""
    if current.has_telegram and other.has_telegram:
        raise AccountError(
            "Оба аккаунта привязаны к разным Telegram — объединить их нельзя. "
            "Напишите в чат, оператор поможет", 409,
        )
    if other.has_telegram:
        return other, current
    return current, other


async def _fk_columns(db: AsyncSession) -> list[tuple[str, str]]:
    """Все столбцы-ссылки на users.id (кроме самой users)."""
    rows = await db.execute(text("""
        SELECT kcu.table_name, kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
        JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY' AND ccu.table_name = 'users'
          AND ccu.column_name = 'id' AND kcu.table_name <> 'users'
    """))
    return [(r[0], r[1]) for r in rows]


async def _merge_chats(db: AsyncSession, s_tg: int, t_tg: int) -> Chat | None:
    """Сливает чат source в чат target; возвращает итоговый чат (или None)."""
    s_chat = (await db.execute(select(Chat).where(Chat.user_id == s_tg))).scalar_one_or_none()
    t_chat = (await db.execute(select(Chat).where(Chat.user_id == t_tg))).scalar_one_or_none()
    if s_chat and t_chat:
        await db.execute(
            text("UPDATE chat_messages SET chat_id = :t WHERE chat_id = :s"),
            {"t": t_chat.id, "s": s_chat.id},
        )
        for f in ("last_message_at", "last_admin_read_at", "last_user_read_at"):
            a, b = getattr(t_chat, f), getattr(s_chat, f)
            if b and (not a or b > a):
                setattr(t_chat, f, b)
        if not t_chat.order_id and s_chat.order_id:
            order_id = s_chat.order_id
            s_chat.order_id = None
            await db.flush()
            t_chat.order_id = order_id
        await db.delete(s_chat)
        await db.flush()
        return t_chat
    return t_chat or s_chat


async def merge_users(
    db: AsyncSession, current: User, other: User, *, verified_email: str | None = None,
) -> User:
    """
    Объединяет два аккаунта, возвращает итоговый. Один из них удаляется.
    verified_email — почта, которую только что подтвердили: она остаётся у
    итогового аккаунта, даже если у него была другая.
    """
    if current.id == other.id:
        return current
    if current.is_blocked or other.is_blocked:
        raise AccountError("Один из аккаунтов заблокирован — объединение недоступно", 403)

    target, source = pick_target(current, other)
    # Блокируем обе строки до конца транзакции
    await db.execute(
        select(User.id).where(User.id.in_([target.id, source.id])).with_for_update()
    )
    s, t = source.id, target.id
    p = {"s": s, "t": t}

    # 1. Чат (ключ — telegram_id): сливаем ленты, пока ID ещё старые
    chat = await _merge_chats(db, source.telegram_id, target.telegram_id)

    # 2. Конфликты уникальных ограничений — до переноса ссылок
    await db.execute(text(
        "DELETE FROM abandoned_carts WHERE user_id = :s "
        "AND EXISTS (SELECT 1 FROM abandoned_carts WHERE user_id = :t)"), p)
    await db.execute(text("""
        UPDATE cart_items SET cart_id = (SELECT id FROM carts WHERE user_id = :t)
        WHERE cart_id = (SELECT id FROM carts WHERE user_id = :s)
          AND EXISTS (SELECT 1 FROM carts WHERE user_id = :t)"""), p)
    await db.execute(text(
        "DELETE FROM carts WHERE user_id = :s "
        "AND EXISTS (SELECT 1 FROM carts WHERE user_id = :t)"), p)
    for table in ("user_favorites", "user_viewed_products", "reviews"):
        await db.execute(text(
            f"DELETE FROM {table} WHERE user_id = :s AND product_id IN "
            f"(SELECT product_id FROM {table} WHERE user_id = :t)"), p)
    # Рефералы: сам себе не реферал (награды друг за друга внутри одного человека — убираем)
    await db.execute(text(
        "DELETE FROM referral_rewards WHERE (referrer_id = :s AND referred_id = :t) "
        "OR (referrer_id = :t AND referred_id = :s)"), p)
    await db.execute(text(
        "UPDATE users SET referred_by_id = NULL WHERE (id = :t AND referred_by_id = :s) "
        "OR (id = :s AND referred_by_id = :t)"), p)

    # 3. Переносим все ссылки на source → target (включая будущие таблицы)
    for table, col in await _fk_columns(db):
        await db.execute(text(f'UPDATE "{table}" SET "{col}" = :t WHERE "{col}" = :s'), p)
    await db.execute(text(
        "UPDATE users SET referred_by_id = :t WHERE referred_by_id = :s AND id <> :t"), p)

    # 4. Деньги и счётчики
    target.balance = (target.balance or 0) + (source.balance or 0)
    target.total_spent = (target.total_spent or 0) + (source.total_spent or 0)
    target.orders_count = (target.orders_count or 0) + (source.orders_count or 0)
    if not target.referred_by_id and source.referred_by_id and source.referred_by_id != t:
        target.referred_by_id = source.referred_by_id
    if not target.loyalty_level_id:
        target.loyalty_level_id = source.loyalty_level_id

    # 5. Способы входа: освобождаем уникальные значения у source, затем отдаём target
    final_tg = source.telegram_id if is_telegram_id(source.telegram_id) else target.telegram_id
    final_email = verified_email or target.email or source.email
    if source.has_telegram:
        target.username = source.username
        target.first_name = source.first_name or target.first_name
        target.last_name = source.last_name
        target.photo_url = source.photo_url
    elif not target.has_telegram and target.is_guest and not source.is_guest:
        target.first_name = source.first_name
    source.telegram_id = await new_service_id(db)
    source.email = None
    source.balance = 0
    await db.flush()
    target.telegram_id = final_tg
    target.email = final_email
    target.is_guest = target.is_guest and source.is_guest
    await db.flush()
    if chat is not None:
        chat.user_id = final_tg

    # 6. Удаляем присоединённый аккаунт (ссылок на него больше нет)
    await db.execute(delete(User).where(User.id == s))
    await db.flush()
    return target


async def absorb_guest(db: AsyncSession, user: User, guest_tg: int | None) -> User:
    """При входе: переписка гостя переходит в аккаунт. Ошибки не мешают входу."""
    if not guest_tg or is_telegram_id(guest_tg):
        return user
    guest = (await db.execute(
        select(User).where(User.telegram_id == guest_tg, User.is_guest.is_(True))
    )).scalar_one_or_none()
    if not guest or guest.id == user.id:
        return user
    return await merge_users(db, user, guest)


# ── Отвязка ───────────────────────────────────────────────────────────────────


async def unlink_email(db: AsyncSession, user: User) -> None:
    if not user.has_telegram:
        raise AccountError("Почта — единственный способ входа, её нельзя отвязать")
    user.email = None


async def unlink_telegram(db: AsyncSession, user: User) -> None:
    """Аккаунт остаётся с почтой; Telegram освобождается (в боте будет новый аккаунт)."""
    if not user.has_telegram:
        raise AccountError("Telegram не привязан")
    if not user.email:
        raise AccountError("Telegram — единственный способ входа. Сначала привяжите почту")
    old = user.telegram_id
    new = await new_service_id(db)
    await db.execute(update(Chat).where(Chat.user_id == old).values(user_id=new))
    user.telegram_id = new
    user.username = None
    user.photo_url = None
