#!/usr/bin/env bash
# =============================================================================
#  GameShop Bot — Полный скрипт деплоя на чистый VPS (Ubuntu 22.04)
#  Использование: bash deploy.sh
#  Запускать от root или sudo-пользователя.
# =============================================================================
set -euo pipefail

# ── Цвета ──────────────────────────────────────────────────────────────────────
R='\033[0;31m'; G='\033[0;32m'; Y='\033[1;33m'; B='\033[0;34m'; NC='\033[0m'
info()    { echo -e "${B}[INFO]${NC}  $*"; }
success() { echo -e "${G}[OK]${NC}    $*"; }
warn()    { echo -e "${Y}[WARN]${NC}  $*"; }
error()   { echo -e "${R}[ERROR]${NC} $*"; exit 1; }

# ── Конфиг ────────────────────────────────────────────────────────────────────
DOMAIN="${DOMAIN:-yourdomain.com}"
EMAIL="${EMAIL:-admin@yourdomain.com}"
APP_DIR="${APP_DIR:-/opt/gameshop}"
APP_USER="${APP_USER:-gameshop}"
REPO_URL="${REPO_URL:-https://github.com/yourname/gameshop-bot.git}"

echo -e "\n${G}╔══════════════════════════════════════╗${NC}"
echo -e "${G}║   GameShop Bot — Deploy Script       ║${NC}"
echo -e "${G}╚══════════════════════════════════════╝${NC}\n"

# ── Шаг 1: Системные зависимости ──────────────────────────────────────────────
info "1/9 Устанавливаем системные пакеты..."
apt-get update -qq
apt-get install -y --no-install-recommends \
    curl git unzip ufw fail2ban \
    ca-certificates gnupg lsb-release \
    nginx certbot python3-certbot-nginx \
    > /dev/null

success "Системные пакеты установлены"

# ── Шаг 2: Docker ─────────────────────────────────────────────────────────────
info "2/9 Устанавливаем Docker..."
if ! command -v docker &>/dev/null; then
    curl -fsSL https://get.docker.com | sh
    systemctl enable --now docker
    success "Docker установлен"
else
    success "Docker уже установлен ($(docker --version))"
fi

# ── Шаг 3: Пользователь приложения ────────────────────────────────────────────
info "3/9 Создаём пользователя $APP_USER..."
if ! id "$APP_USER" &>/dev/null; then
    useradd -m -s /bin/bash "$APP_USER"
    usermod -aG docker "$APP_USER"
    success "Пользователь создан"
else
    success "Пользователь уже существует"
fi

# ── Шаг 4: Код приложения ─────────────────────────────────────────────────────
info "4/9 Клонируем репозиторий в $APP_DIR..."
if [ ! -d "$APP_DIR" ]; then
    git clone "$REPO_URL" "$APP_DIR"
    chown -R "$APP_USER:$APP_USER" "$APP_DIR"
    success "Репозиторий склонирован"
else
    cd "$APP_DIR"
    git pull origin main
    success "Код обновлён"
fi

# ── Шаг 5: .env файл ──────────────────────────────────────────────────────────
info "5/9 Проверяем .env..."
if [ ! -f "$APP_DIR/.env" ]; then
    cp "$APP_DIR/.env.example" "$APP_DIR/.env"
    warn ".env создан из .env.example — ОБЯЗАТЕЛЬНО заполни переменные!"
    warn "Отредактируй: nano $APP_DIR/.env"
    warn "Затем запусти скрипт снова: bash deploy.sh"
    exit 0
else
    success ".env уже существует"
fi

source "$APP_DIR/.env"

# ── Шаг 6: SSL сертификат ─────────────────────────────────────────────────────
info "6/9 Получаем SSL сертификат для $DOMAIN..."
if [ ! -d "/etc/letsencrypt/live/$DOMAIN" ]; then
    # Временно останавливаем nginx если запущен
    systemctl stop nginx 2>/dev/null || true

    certbot certonly \
        --standalone \
        --non-interactive \
        --agree-tos \
        --email "$EMAIL" \
        -d "$DOMAIN" \
        -d "www.$DOMAIN" \
        || warn "Certbot не смог получить сертификат. Продолжаем без HTTPS."

    success "SSL сертификат получен"
else
    success "SSL сертификат уже существует"
fi

# ── Шаг 7: Nginx конфиг ───────────────────────────────────────────────────────
info "7/9 Настраиваем Nginx..."
cat > /etc/nginx/sites-available/gameshop << EOF
# HTTP → HTTPS redirect
server {
    listen 80;
    server_name $DOMAIN www.$DOMAIN;
    return 301 https://\$host\$request_uri;
}

# Основной HTTPS-сервер
server {
    listen 443 ssl http2;
    server_name $DOMAIN www.$DOMAIN;

    ssl_certificate     /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;
    ssl_session_cache   shared:SSL:10m;
    ssl_session_timeout 10m;

    # Заголовки безопасности
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header Referrer-Policy strict-origin-when-cross-origin;

    # Mini App (React SPA)
    location /app {
        alias /opt/gameshop/miniapp/dist;
        index index.html;
        try_files \$uri \$uri/ /app/index.html;
        expires 1h;
        add_header Cache-Control "public, no-transform";

        location ~* \.(js|css|png|jpg|svg|ico|woff2|woff|ttf)\$ {
            expires 30d;
            add_header Cache-Control "public, immutable";
        }
    }

    # API
    location /api/ {
        proxy_pass         http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade \$http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host \$host;
        proxy_set_header   X-Real-IP \$remote_addr;
        proxy_set_header   X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 30s;
        client_max_body_size 10m;
    }

    # Bot Webhook
    location /webhook/ {
        proxy_pass         http://127.0.0.1:8080;
        proxy_set_header   Host \$host;
        proxy_set_header   X-Real-IP \$remote_addr;
        proxy_set_header   X-Forwarded-For \$proxy_add_x_forwarded_for;
    }

    # Certbot
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location ~ /\. { deny all; }
}
EOF

ln -sf /etc/nginx/sites-available/gameshop /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl restart nginx
success "Nginx настроен"

# ── Шаг 8: UFW Firewall ───────────────────────────────────────────────────────
info "8/9 Настраиваем firewall..."
ufw --force reset > /dev/null
ufw default deny incoming > /dev/null
ufw default allow outgoing > /dev/null
ufw allow ssh > /dev/null
ufw allow 80/tcp > /dev/null
ufw allow 443/tcp > /dev/null
ufw --force enable > /dev/null
success "Firewall настроен (SSH, HTTP, HTTPS)"

# ── Шаг 9: Сборка и запуск ────────────────────────────────────────────────────
info "9/9 Собираем и запускаем контейнеры..."
cd "$APP_DIR"

# Сборка Mini App
if [ -d "miniapp" ] && [ -f "miniapp/package.json" ]; then
    info "Собираем Mini App..."
    cd miniapp
    npm ci --silent
    npm run build
    cd ..
    success "Mini App собран"
fi

# Docker Compose
docker compose pull --quiet
docker compose up -d --build --remove-orphans

# Ждём готовности
info "Ожидаем запуска сервисов..."
sleep 15

# Проверка
if curl -sf "http://localhost:8000/health" > /dev/null; then
    success "API работает ✓"
else
    warn "API не ответил — проверь логи: docker compose logs api"
fi

# ── Итоги ──────────────────────────────────────────────────────────────────────
echo ""
echo -e "${G}╔══════════════════════════════════════════════╗${NC}"
echo -e "${G}║   ✅ Деплой завершён успешно!                ║${NC}"
echo -e "${G}╚══════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  🌐 Mini App:  ${B}https://$DOMAIN/app${NC}"
echo -e "  📡 API:       ${B}https://$DOMAIN/api/v1/docs${NC}  (только в DEBUG)"
echo -e "  📊 Flower:    ${B}http://localhost:5555${NC}  (только локально)"
echo ""
echo -e "  Полезные команды:"
echo -e "  ${Y}docker compose logs -f bot${NC}    # логи бота"
echo -e "  ${Y}docker compose logs -f api${NC}    # логи API"
echo -e "  ${Y}docker compose ps${NC}             # статус"
echo -e "  ${Y}docker compose restart bot${NC}    # рестарт"
echo ""
echo -e "  После обновления .env:"
echo -e "  ${Y}docker compose restart bot api${NC}"
echo ""
