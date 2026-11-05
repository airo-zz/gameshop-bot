# Эксплуатация: серверы, деплой, бэкапы

## Сервер

| | |
|---|---|
| Хостер | waicore |
| IP | 138.124.38.169 |
| ОС | Ubuntu 22.04, 1 CPU / 4 GB RAM / 30 GB |
| Проект | `/opt/gameshop/` |
| Доступ | `ssh root@138.124.38.169` (пароль у владельца, ключ — по договорённости) |

Домены:
- **redonate.gg** — основной (регистратор Regtons, DNS: A на сервер, wildcard CNAME).
- **admin.redonate.gg** — админка.
- **redonate.su** — запасной. На нём открыты только `/api`, `/webhooks`, `/static`, всё остальное → 301 на .gg. Продлевать, пока в кабинете Platega может стоять старый адрес.

Сертификаты Let's Encrypt продлевает контейнер `certbot` (webroot). Лежат на хосте в `/etc/letsencrypt/`.

## Деплой

Автоматический: **push в ветку `main`** → GitHub Actions (`.github/workflows/deploy.yml`):

1. **Detect Changed Paths** — что поменялось (бэкенд, фронт).
2. **Tests & Lint** — pytest + ruff.
3. **Build Mini App** — три сборки фронта: `dist` (Mini App, `/app`), `dist-web` (сайт), `dist-admin` (админка).
4. **Deploy Mini App** — копирует сборки на сервер и перезагружает nginx.
5. **Deploy Backend** — по SSH на сервере: `git pull`, `docker compose build api`, затем `build bot`, затем `up -d --no-build`. Миграции применяет сервис `migrations`.
6. **Notify** — итог в Telegram.

Деплой идёт 3–4 минуты. Если дольше 10 минут — смотрите нагрузку на сервере (`uptime`, `docker stats`). Сервер слабый, сборка образов может уйти в своп.

Секреты GitHub (Settings → Secrets, доступ только у владельца репозитория): `VPS_HOST`, `VPS_USER`, `VPS_PASSWORD`, `VPS_APP_DIR`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`.

Новый Python-сервис в `docker-compose.yml` добавляйте с `image: gameshop-app:latest` (или `gameshop-botimg:latest`) и `pull_policy: never`, без своего `build:` — иначе сервер не потянет сборку. И допишите его в path filter и в список `up` в `deploy.yml`.

## Частые команды на сервере

```bash
cd /opt/gameshop
docker compose ps                              # что запущено
docker compose logs -f --tail=200 api          # логи (api | bot | support_bot | worker | beat | nginx)
docker compose restart api                     # перезапуск одного сервиса
docker compose restart nginx                   # после правки nginx.conf (он смонтирован файлом)

# SQL-консоль
docker compose exec db sh -c 'psql -U $POSTGRES_USER -d $POSTGRES_DB'
```

Диск забивается Docker'ом. Безопасная очистка:

```bash
docker image prune -af; docker builder prune -af; docker container prune -f
journalctl --vacuum-time=7d; apt-get clean
```

**Не трогать:** `/var/lib/docker/volumes/` (БД и Redis), `/opt/gameshop/*`, `/etc/letsencrypt/`.

## Бэкапы

- `scripts/backup_db.sh` — `pg_dump` → gzip → S3-бакет `redonate-backups/db/`, плюс локальная копия с ротацией. Запускается **cron на хосте каждый час** (не Celery, поэтому работает, даже если приложение лежит):
  `0 * * * * cd /opt/gameshop && bash ./scripts/backup_db.sh >> /var/log/redonate-backup.log 2>&1`
- Если бэкап упал — уведомление персоналу. Если бэкап давно не проходил (cron пропал) — это ловит задача `check_integrity` и тоже шлёт тревогу.
- Восстановление: `./scripts/restore_db.sh latest` (последний дамп из S3), или путь к файлу, или `s3://…`. **Перезаписывает текущую БД.**

## Если сервер потерян

1. Новый VPS с Ubuntu → `scripts/bootstrap_vps.sh` (базовые пакеты, ufw, Docker, aws cli, каталоги, строка cron бэкапа). Отдельно: `apt install -y cron fail2ban` (в чистом образе cron может не быть).
2. `git clone` в `/opt/gameshop`, положить `.env` (копия — у владельца; без него ничего не запустится).
3. DNS `redonate.gg`, `admin.redonate.gg`, `redonate.su` → новый IP. Получить сертификаты certbot.
4. `docker compose up -d db` → `./scripts/restore_db.sh latest` → `docker compose up -d`.
5. Обновить секрет `VPS_HOST` в GitHub. Проверить вебхук бота (`getWebhookInfo`) и callback в кабинете Platega.

## Безопасность (кратко)

- Лимиты запросов: slowapi по реальному IP (`api/rate_limit.py`) и зоны в `nginx/nginx.conf`. Вебхуки не лимитируются.
- Заголовки безопасности: `nginx/conf.d/security_headers.inc` подключается в **каждую** location, где есть свой `add_header`. `security_map.conf` задаёт, кто может встраивать страницы во frame (Telegram для `/app`, Метрика для Вебвизора).
- fail2ban на SSH.
- Ключи товаров и креды интеграций в БД шифруются Fernet (`ENCRYPTION_KEY` из `.env`). **Потеря `ENCRYPTION_KEY` = потеря этих данных.**
- Поиск с `ilike` по пользовательскому вводу — только через `api/utils/search.escape_like`.

## Связанные серверы

- **Хаб UchetFP** (airo.uchet.tech) — отдельный проект и сервер, через него операторы ведут чаты и заказы reDonate. См. [INTEGRATIONS.md](INTEGRATIONS.md).
- На этом же сервере вне compose работают контейнеры `hub-relay` (socat, порт 8443 — обход для связи дедика с хабом) и `dc-relay` (`python relay.py serve`, подключён к сети магазина). Их нет в `docker-compose.yml`, но удалять без проверки нельзя.
