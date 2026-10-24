#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  reDonate — восстановление PostgreSQL из бэкапа
#
#  Использование:
#    ./scripts/restore_db.sh backups/redonate_20260908_120000.sql.gz   # локальный файл
#    ./scripts/restore_db.sh s3://redonate-backups/db/redonate_...sql.gz  # прямо из S3
#    ./scripts/restore_db.sh latest                                     # последний из S3
#
#  ⚠️  Перезаписывает текущую БД (дамп сделан с --clean --if-exists).
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$SCRIPT_DIR"
set -a; source .env; set +a

: "${POSTGRES_USER:?}"; : "${POSTGRES_DB:?}"
SRC="${1:?Укажи путь к дампу, s3://... или latest}"

export AWS_ACCESS_KEY_ID="${S3_ACCESS_KEY:-}"
export AWS_SECRET_ACCESS_KEY="${S3_SECRET_KEY:-}"
export AWS_DEFAULT_REGION="${S3_REGION:-us-east-1}"

TMP=""
cleanup() { [ -n "$TMP" ] && rm -f "$TMP"; }
trap cleanup EXIT

if [ "$SRC" = "latest" ]; then
    log_key="$(aws --endpoint-url "$S3_ENDPOINT" s3 ls "s3://${BACKUP_S3_BUCKET}/db/" \
        | awk '{print $4}' | grep -E '^redonate_' | sort | tail -1)"
    [ -n "$log_key" ] || { echo "В S3 нет дампов"; exit 1; }
    SRC="s3://${BACKUP_S3_BUCKET}/db/${log_key}"
fi

if [[ "$SRC" == s3://* ]]; then
    TMP="$(mktemp --suffix=.sql.gz)"
    echo "[restore] скачиваю $SRC…"
    aws --endpoint-url "$S3_ENDPOINT" s3 cp "$SRC" "$TMP" --only-show-errors
    FILE="$TMP"
else
    FILE="$SRC"
fi

[ -s "$FILE" ] || { echo "[restore] файл пуст/не найден: $FILE"; exit 1; }

echo "[restore] ВНИМАНИЕ: текущая БД '${POSTGRES_DB}' будет перезаписана из $(basename "$FILE")"
read -r -p "Продолжить? (yes/N): " ans
[ "$ans" = "yes" ] || { echo "Отменено"; exit 0; }

gunzip -c "$FILE" | docker compose exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
echo "[restore] готово ✓"
