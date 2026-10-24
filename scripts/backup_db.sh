#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  reDonate — офсайт-бэкап PostgreSQL
#
#  Что делает:
#    1. pg_dump БД внутри контейнера db  → gzip
#    2. Заливает дамп во внешний S3-бакет (офсайт — переживает потерю VPS)
#    3. Держит локальную копию с ротацией (BACKUP_RETENTION_DAYS)
#    4. Чистит старые дампы в S3 за пределами ретеншена
#
#  Запуск: host-cron (НЕ celery) — работает даже если приложение лежит.
#  Cron (каждый час; через bash — не зависит от права на запуск файла):
#    0 * * * * cd /opt/gameshop && bash ./scripts/backup_db.sh >> /var/log/redonate-backup.log 2>&1
#
#  Контроль: при сбое — уведомление персоналу (shared/staff_notify через контейнер
#  api); при успехе — отметка shop_settings.last_backup_at, которую каждые 3 часа
#  проверяет worker (worker/tasks/integrity_tasks.py) — если бэкап давно не
#  проходил (cron пропал, скрипт не запускается), персонал тоже узнает.
#
#  Зависит от: docker compose, aws cli (см. bootstrap_vps.sh).
#  Читает креды из .env в корне проекта.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$SCRIPT_DIR"

notify_fail() {
    local line="$1"
    echo "[backup] FAILED at line $line" >&2
    docker compose exec -T api python -c         "from shared.staff_notify import send_staff_sync; send_staff_sync('Бэкап базы НЕ выполнен (scripts/backup_db.sh, строка $line). Лог: /var/log/redonate-backup.log')"         >/dev/null 2>&1 || echo "[backup] не удалось отправить уведомление персоналу" >&2
}
trap 'notify_fail $LINENO' ERR

# ── Загружаем .env ──
if [ ! -f .env ]; then
    echo "[backup] ERROR: .env не найден в $SCRIPT_DIR" >&2
    exit 1
fi
set -a
# shellcheck disable=SC1091
source .env
set +a

: "${POSTGRES_USER:?POSTGRES_USER не задан в .env}"
: "${POSTGRES_DB:?POSTGRES_DB не задан в .env}"
: "${BACKUP_S3_BUCKET:?BACKUP_S3_BUCKET не задан в .env}"
: "${S3_ENDPOINT:?S3_ENDPOINT не задан в .env}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"

LOCAL_DIR="$SCRIPT_DIR/backups"
mkdir -p "$LOCAL_DIR"

TS="$(date -u +%Y%m%d_%H%M%S)"
FNAME="redonate_${TS}.sql.gz"
LOCAL_PATH="$LOCAL_DIR/$FNAME"

echo "[backup] $(date -u +%FT%TZ) start → $FNAME"

# ── 1. Дамп + gzip ──
# --clean --if-exists → дамп самодостаточен для restore на чистую БД
docker compose exec -T db pg_dump \
    -U "$POSTGRES_USER" \
    -d "$POSTGRES_DB" \
    --clean --if-exists --no-owner --no-privileges \
    | gzip -9 > "$LOCAL_PATH"

SIZE="$(du -h "$LOCAL_PATH" | cut -f1)"
if [ ! -s "$LOCAL_PATH" ]; then
    echo "[backup] ERROR: дамп пустой — прерываю, S3 не трогаю" >&2
    rm -f "$LOCAL_PATH"
    exit 1
fi
echo "[backup] dump OK ($SIZE)"

# ── 2. Заливаем в S3 (офсайт) ──
export AWS_ACCESS_KEY_ID="${S3_ACCESS_KEY}"
export AWS_SECRET_ACCESS_KEY="${S3_SECRET_KEY}"
export AWS_DEFAULT_REGION="${S3_REGION:-us-east-1}"

aws --endpoint-url "$S3_ENDPOINT" s3 cp \
    "$LOCAL_PATH" "s3://${BACKUP_S3_BUCKET}/db/${FNAME}" \
    --only-show-errors
echo "[backup] uploaded → s3://${BACKUP_S3_BUCKET}/db/${FNAME}"

# ── 3. Локальная ротация ──
find "$LOCAL_DIR" -name 'redonate_*.sql.gz' -type f -mtime "+${RETENTION_DAYS}" -delete
echo "[backup] local rotation done (>${RETENTION_DAYS}d removed)"

# ── 4. S3-ротация ──
CUTOFF="$(date -u -d "${RETENTION_DAYS} days ago" +%Y%m%d 2>/dev/null \
    || date -u -v-"${RETENTION_DAYS}"d +%Y%m%d)"
aws --endpoint-url "$S3_ENDPOINT" s3 ls "s3://${BACKUP_S3_BUCKET}/db/" \
    | awk '{print $4}' | grep -E '^redonate_[0-9]{8}_' | while read -r key; do
        key_date="$(echo "$key" | sed -E 's/^redonate_([0-9]{8})_.*/\1/')"
        if [ "$key_date" -lt "$CUTOFF" ]; then
            aws --endpoint-url "$S3_ENDPOINT" s3 rm \
                "s3://${BACKUP_S3_BUCKET}/db/${key}" --only-show-errors
            echo "[backup] s3 removed old: $key"
        fi
    done

# ── 5. Отметка об успешном бэкапе (проверяет worker) ──
docker compose exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -q -c     "INSERT INTO shop_settings (key, value, description, updated_at)
     VALUES ('last_backup_at', extract(epoch from now())::bigint::text, 'Время последнего успешного бэкапа БД, unix-время (scripts/backup_db.sh)', now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()"

echo "[backup] $(date -u +%FT%TZ) done ✓"
