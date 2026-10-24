"""
worker/tasks/integrity_tasks.py — контроль сохранности денег и данных.

Каждые 3 часа:
  • сверка балансов: users.balance должен совпадать с суммой операций
    balance_transactions пользователя (каждое изменение баланса пишет операцию);
  • свежесть бэкапа: scripts/backup_db.sh после успешной выгрузки в S3 пишет
    shop_settings.last_backup_at. Если отметке больше BACKUP_MAX_AGE —
    бэкапы не идут (cron пропал, скрипт падает) — сообщаем персоналу.
Об одной и той же проблеме напоминаем не чаще раза в REMIND_EVERY (Redis).
"""

import asyncio
import logging
from datetime import datetime, timedelta, timezone

from worker.main import celery_app

logger = logging.getLogger(__name__)

BACKUP_MAX_AGE = timedelta(hours=3)
REMIND_EVERY = 6 * 3600


@celery_app.task(name="worker.tasks.integrity_tasks.check_integrity")
def check_integrity():
    problems = asyncio.run(_collect())
    for key, text in problems:
        if _should_notify(key):
            from shared.staff_notify import send_staff_sync

            try:
                send_staff_sync(text)
            except RuntimeError as exc:
                logger.error("integrity: уведомление не доставлено: %s", exc)
        logger.error("integrity: %s", text)


def _should_notify(key: str) -> bool:
    import redis

    from shared.config import settings

    try:
        r = redis.Redis.from_url(settings.REDIS_URL)
        return bool(r.set(f"integrity_alert:{key}", "1", nx=True, ex=REMIND_EVERY))
    except redis.RedisError:
        return True


async def _collect() -> list[tuple[str, str]]:
    from sqlalchemy import text

    from shared.database.session import get_worker_db_session

    problems: list[tuple[str, str]] = []
    async with get_worker_db_session() as db:
        rows = (await db.execute(text("""
            SELECT u.telegram_id, u.balance, COALESCE(t.s, 0) AS ledger
            FROM users u
            LEFT JOIN (SELECT user_id, SUM(amount) AS s FROM balance_transactions GROUP BY user_id) t
                   ON t.user_id = u.id
            WHERE u.balance <> COALESCE(t.s, 0)
            ORDER BY ABS(u.balance - COALESCE(t.s, 0)) DESC
            LIMIT 10
        """))).all()
        if rows:
            lines = "\n".join(f"• {r.telegram_id}: баланс {r.balance} ₽, по истории операций {r.ledger} ₽" for r in rows)
            problems.append((
                "balance",
                f"Балансы не сходятся с историей операций ({len(rows)} польз.):\n{lines}\n"
                "Проверьте ручные изменения баланса и последние платежи.",
            ))

        last = (await db.execute(text("SELECT value FROM shop_settings WHERE key = 'last_backup_at'"))).scalar()
        stale_text = None
        if not last:
            stale_text = "Нет отметки об успешном бэкапе базы. Проверьте cron и /var/log/redonate-backup.log на сервере."
        else:
            try:
                at = datetime.fromtimestamp(int(last), tz=timezone.utc)  # unix-время из backup_db.sh
                age = datetime.now(timezone.utc) - at
                if age > BACKUP_MAX_AGE:
                    hours = int(age.total_seconds() // 3600)
                    stale_text = (f"Бэкап базы не выполнялся {hours} ч. Проверьте cron и "
                                  "/var/log/redonate-backup.log на сервере.")
            except ValueError:
                stale_text = f"Не удалось разобрать время последнего бэкапа: {last!r}"
        if stale_text:
            problems.append(("backup", stale_text))
    return problems
