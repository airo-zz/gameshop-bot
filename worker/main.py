"""
worker/main.py + worker/tasks/ — Celery фоновые задачи
─────────────────────────────────────────────────────────────────────────────
Задачи:
  • check_abandoned_carts  — каждые 30 мин, напоминания о брошенных корзинах
  • recalculate_loyalty    — раз в сутки, пересчёт уровней лояльности
  • send_notification      — разовая задача отправки уведомления пользователю
  • expire_pending_orders  — каждые 10 мин, отменяет незаоплаченные > 24ч
─────────────────────────────────────────────────────────────────────────────
"""

# ── worker/main.py ────────────────────────────────────────────────────────────

from celery import Celery
from celery.schedules import crontab

from shared.config import settings

celery_app = Celery(
    "gameshop",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
    include=[
        "worker.tasks.cart_tasks",
        "worker.tasks.notification_tasks",
        "worker.tasks.loyalty_tasks",
        "worker.tasks.order_tasks",
    ],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    worker_prefetch_multiplier=1,
    task_acks_late=True,
)

# ── Расписание Beat ───────────────────────────────────────────────────────────
celery_app.conf.beat_schedule = {
    # Каждые 30 минут — проверка брошенных корзин
    "check-abandoned-carts": {
        "task": "worker.tasks.cart_tasks.check_abandoned_carts",
        "schedule": crontab(minute="*/30"),
    },
    # Раз в сутки в 03:00 UTC — пересчёт лояльности
    "recalculate-loyalty": {
        "task": "worker.tasks.loyalty_tasks.recalculate_all_loyalty",
        "schedule": crontab(hour=3, minute=0),
    },
    # Каждые 10 минут — отмена просроченных заказов
    "expire-pending-orders": {
        "task": "worker.tasks.order_tasks.expire_pending_orders",
        "schedule": crontab(minute="*/10"),
    },
}
