#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  GameShop Bot — Скрипт быстрого старта
#  Использование: chmod +x scripts/setup.sh && ./scripts/setup.sh
# ─────────────────────────────────────────────────────────────────────────────

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}🎮 GameShop Bot — Setup${NC}"
echo "────────────────────────────────────"

# 1. Проверяем зависимости
echo -e "\n${YELLOW}1. Проверка зависимостей...${NC}"
command -v docker >/dev/null 2>&1 || { echo -e "${RED}❌ Docker не установлен${NC}"; exit 1; }
command -v docker-compose >/dev/null 2>&1 || command -v "docker compose" >/dev/null 2>&1 || {
    echo -e "${RED}❌ Docker Compose не установлен${NC}"; exit 1;
}
echo -e "${GREEN}✅ Docker OK${NC}"

# 2. Создаём .env если нет
echo -e "\n${YELLOW}2. Настройка .env...${NC}"
if [ ! -f .env ]; then
    cp .env.example .env
    echo -e "${YELLOW}⚠️  Файл .env создан из .env.example"
    echo -e "   Заполни его перед запуском!${NC}"
    echo ""
    echo "Минимально необходимые переменные:"
    echo "  BOT_TOKEN       — токен бота от @BotFather"
    echo "  POSTGRES_PASSWORD — пароль БД"
    echo "  JWT_SECRET_KEY  — случайная строка 32+ символа"
    echo "  SHOP_NAME       — название твоего магазина"
    echo ""
    read -p "Открыть .env для редактирования? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        ${EDITOR:-nano} .env
    fi
else
    echo -e "${GREEN}✅ .env уже существует${NC}"
fi

# 3. Загружаем переменные
source .env
SHOP="${SHOP_NAME:-GameShop}"

echo -e "\n${YELLOW}3. Запуск ${SHOP}...${NC}"

# 4. Dev или Prod?
echo ""
echo "Режим запуска:"
echo "  1) Разработка (polling, hot reload)"
echo "  2) Продакшен (webhook, nginx)"
read -p "Выбери (1/2): " -n 1 -r MODE
echo

if [ "$MODE" = "2" ]; then
    echo -e "\n${YELLOW}Запуск в PRODUCTION режиме...${NC}"
    docker compose up -d --build
else
    echo -e "\n${YELLOW}Запуск в DEV режиме...${NC}"
    docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
fi

echo ""
echo -e "${GREEN}✅ ${SHOP} запущен!${NC}"
echo ""
echo "Полезные команды:"
echo "  docker compose logs -f bot      # логи бота"
echo "  docker compose logs -f api      # логи API"
echo "  docker compose logs -f worker   # логи Celery"
echo "  docker compose ps               # статус сервисов"
echo "  docker compose down             # остановить всё"
echo ""
echo "Доступные сервисы:"
echo "  Bot API:  http://localhost:8000/docs"
echo "  Flower:   http://localhost:5555"
