#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  reDonate — первичная настройка нового VPS (Ubuntu 22.04/24.04)
#
#  Запускать один раз на чистом сервере под root:
#    curl -fsSL https://raw.githubusercontent.com/airo-zz/gameshop-bot/main/scripts/bootstrap_vps.sh | bash
#  ИЛИ скопировать файл и: bash bootstrap_vps.sh
#
#  Что делает:
#    1. apt update + базовые пакеты (git, curl, ufw, unzip)
#    2. Docker Engine + compose plugin (официальный скрипт)
#    3. AWS CLI v2 (для офсайт-бэкапов)
#    4. Firewall ufw: 22/80/443
#    5. git clone проекта в /opt/gameshop
#    6. Каталоги (backups, miniapp/dist) + cron офсайт-бэкапа
#    7. Печатает следующие ручные шаги (.env, SSL, seed)
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/airo-zz/gameshop-bot.git}"
APP_DIR="${APP_DIR:-/opt/gameshop}"

log() { echo -e "\033[0;32m[bootstrap]\033[0m $*"; }
warn() { echo -e "\033[1;33m[bootstrap]\033[0m $*"; }

if [ "$(id -u)" -ne 0 ]; then
    echo "Запусти под root (sudo -i)"; exit 1
fi

# ── 1. Базовые пакеты ──
log "apt update + базовые пакеты…"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y git curl ufw unzip ca-certificates gnupg

# ── 2. Docker ──
if ! command -v docker >/dev/null 2>&1; then
    log "Установка Docker…"
    curl -fsSL https://get.docker.com | sh
    systemctl enable --now docker
else
    log "Docker уже установлен"
fi
docker compose version >/dev/null 2>&1 || { warn "compose plugin отсутствует"; }

# ── 3. AWS CLI (для backup_db.sh) ──
if ! command -v aws >/dev/null 2>&1; then
    log "Установка AWS CLI v2…"
    tmp="$(mktemp -d)"
    curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-$(uname -m).zip" -o "$tmp/awscliv2.zip"
    unzip -q "$tmp/awscliv2.zip" -d "$tmp"
    "$tmp/aws/install" --update
    rm -rf "$tmp"
else
    log "AWS CLI уже установлен"
fi

# ── 4. Firewall ──
log "Настройка ufw…"
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# ── 5. Клонируем проект ──
if [ ! -d "$APP_DIR/.git" ]; then
    log "git clone → $APP_DIR"
    if [[ "$REPO_URL" == *"<OWNER>"* ]]; then
        warn "REPO_URL не задан. Запусти: REPO_URL=https://github.com/you/repo.git bash bootstrap_vps.sh"
        exit 1
    fi
    git clone "$REPO_URL" "$APP_DIR"
else
    log "Репозиторий уже в $APP_DIR — git pull"
    git -C "$APP_DIR" pull --ff-only || true
fi

cd "$APP_DIR"

# ── 6. Каталоги + cron бэкапа ──
mkdir -p "$APP_DIR/backups" "$APP_DIR/miniapp/dist"
chmod +x "$APP_DIR/scripts/backup_db.sh" || true

CRON_LINE="0 */6 * * * cd $APP_DIR && ./scripts/backup_db.sh >> /var/log/redonate-backup.log 2>&1"
if ! crontab -l 2>/dev/null | grep -qF "scripts/backup_db.sh"; then
    ( crontab -l 2>/dev/null; echo "$CRON_LINE" ) | crontab -
    log "Cron офсайт-бэкапа установлен (каждые 6 часов)"
else
    log "Cron бэкапа уже есть"
fi

# ── 7. Следующие шаги ──
cat <<EOF

\033[0;32m✅ Bootstrap завершён.\033[0m Дальше вручную:

  1. Создать .env:
       cd $APP_DIR
       cp .env.example .env   # затем вставить подготовленный продакшн-.env
       nano .env              # заполнить <BOT_TOKEN>, ЮKassa, CryptoBot, S3

  2. Собрать Mini App (или дождаться деплоя из GitHub Actions):
       # локально: npm run build → dist попадёт через CI/CD

  3. SSL-сертификат (первый раз, до старта nginx с 443):
       docker compose run --rm --entrypoint "" -p 80:80 certbot \\
         certbot certonly --standalone -d redonate.su -d www.redonate.su \\
         --email <email> --agree-tos --no-eff-email

  4. Поднять стек:
       docker compose up -d --build     # миграции создадут пустую схему

  5. Засидить каталог:
       cat scripts/seed_catalog.sql | docker compose exec -T db \\
         psql -U redonate -d redonate

  6. Проверить бэкап вручную:
       ./scripts/backup_db.sh

  7. Зарегистрировать webhook бота и CryptoBot (через бота/кабинет).

  Не забудь: GitHub Secrets → VPS_HOST / VPS_USER / VPS_PASSWORD / VPS_APP_DIR=$APP_DIR
EOF
