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
#  Пример cron (устанавливает scripts/bootstrap_vps.sh):
#    0 */6 * * * cd /opt/gameshop && ./scripts/backup_db.sh >> /var/log/redonate-backup.log 2>&1
#
#  Зависит от: docker compose, aws cli (см. bootstrap_vps.sh).
#  Читает креды из .env в корне проекта.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$SCRIPT_DIR"

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

echo "[backup] $(date -u +%FT%TZ) done ✓"
