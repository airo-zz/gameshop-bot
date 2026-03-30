# Makefile — удобные команды для разработки и деплоя
# Использование: make <команда>

.PHONY: help dev prod stop restart logs shell db-shell redis-shell \
        migrate migrate-new test lint build-miniapp clean

# ── Цвета ─────────────────────────────────────────────────────────────────────
BOLD = \033[1m
RESET = \033[0m
GREEN = \033[0;32m
YELLOW = \033[1;33m

help: ## Показать список команд
	@echo ""
	@echo "$(BOLD)GameShop Bot — команды$(RESET)"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  $(GREEN)%-20s$(RESET) %s\n", $$1, $$2}'
	@echo ""

# ── Запуск ────────────────────────────────────────────────────────────────────
dev: ## Запустить в режиме разработки (hot reload)
	docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build

prod: ## Запустить в production режиме
	docker compose up -d --build

stop: ## Остановить все контейнеры
	docker compose down

restart: ## Перезапустить все контейнеры
	docker compose restart

restart-bot: ## Перезапустить только бота
	docker compose restart bot

restart-api: ## Перезапустить только API
	docker compose restart api

# ── Логи ──────────────────────────────────────────────────────────────────────
logs: ## Показать логи всех сервисов (live)
	docker compose logs -f

logs-bot: ## Логи бота
	docker compose logs -f bot

logs-api: ## Логи API
	docker compose logs -f api

logs-worker: ## Логи Celery worker
	docker compose logs -f worker

# ── База данных ────────────────────────────────────────────────────────────────
migrate: ## Применить миграции
	docker compose run --rm migrations alembic upgrade head

migrate-new: ## Создать новую миграцию (MSG="описание")
	@read -p "Описание миграции: " msg; \
	docker compose run --rm migrations alembic revision --autogenerate -m "$$msg"

migrate-down: ## Откатить последнюю миграцию
	docker compose run --rm migrations alembic downgrade -1

db-shell: ## Открыть psql
	docker compose exec db psql -U $$(grep POSTGRES_USER .env | cut -d= -f2) \
		-d $$(grep POSTGRES_DB .env | cut -d= -f2)

redis-shell: ## Открыть redis-cli
	docker compose exec redis redis-cli -a $$(grep REDIS_PASSWORD .env | cut -d= -f2)

# ── Разработка ─────────────────────────────────────────────────────────────────
shell-api: ## Открыть bash в API контейнере
	docker compose exec api bash

shell-bot: ## Открыть bash в Bot контейнере
	docker compose exec bot bash

# ── Тесты и линтинг ───────────────────────────────────────────────────────────
test: ## Запустить тесты
	docker compose run --rm api pytest tests/ -v

lint: ## Линтинг Python кода
	docker compose run --rm api ruff check .
	docker compose run --rm api ruff format --check .

fmt: ## Форматирование кода
	docker compose run --rm api ruff format .

# ── Mini App ──────────────────────────────────────────────────────────────────
build-miniapp: ## Собрать Mini App для production
	cd miniapp && npm ci && npm run build
	@echo "$(GREEN)✅ Mini App собран в miniapp/dist/$(RESET)"

dev-miniapp: ## Запустить Mini App в dev режиме
	cd miniapp && npm run dev

# ── Инфраструктура ────────────────────────────────────────────────────────────
ps: ## Статус контейнеров
	docker compose ps

stats: ## Использование ресурсов
	docker stats --no-stream

clean: ## Удалить все данные (ОСТОРОЖНО!)
	@echo "$(YELLOW)ВНИМАНИЕ: Это удалит все данные БД и Redis!$(RESET)"
	@read -p "Продолжить? (y/N): " confirm; \
	if [ "$$confirm" = "y" ]; then \
		docker compose down -v; \
		echo "$(GREEN)Очищено$(RESET)"; \
	else \
		echo "Отменено"; \
	fi

# ── Деплой ────────────────────────────────────────────────────────────────────
deploy: ## Задеплоить на VPS (нужны DOMAIN и VPS_* переменные)
	@test -n "$(DOMAIN)" || (echo "Установи DOMAIN=yourdomain.com"; exit 1)
	bash scripts/deploy.sh

backup-db: ## Создать бэкап БД
	@mkdir -p backups
	docker compose exec db pg_dump \
		-U $$(grep POSTGRES_USER .env | cut -d= -f2) \
		$$(grep POSTGRES_DB .env | cut -d= -f2) \
		| gzip > backups/db_$$(date +%Y%m%d_%H%M%S).sql.gz
	@echo "$(GREEN)✅ Бэкап создан в backups/$(RESET)"

setup: ## Первоначальная настройка (создать .env)
	@test -f .env || (cp .env.example .env && echo "$(YELLOW)⚠️ Заполни .env файл!$(RESET)")
	@echo "$(GREEN)✅ Готово. Редактируй: nano .env$(RESET)"
