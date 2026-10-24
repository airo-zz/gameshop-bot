# ─────────────────────────────────────────────────────────────────────────────
# Служебные пути, общие для redonate.gg и redonate.su: API, вебхуки,
# загруженные картинки, health. На redonate.su оставлены без перенаправления
# как запасной вход (вебхуки POST нельзя надёжно перенаправить, старые ссылки).
# Подключается из gameshop.conf через include. Расширение .inc — чтобы
# nginx.conf (include conf.d/*.conf) не подхватил файл сам на уровне http.
# ─────────────────────────────────────────────────────────────────────────────
    # Docker internal DNS — резолвит имена контейнеров динамически при запросе,
    # а не при старте/reload nginx. Без этого nginx падает если upstream не запущен.
    resolver 127.0.0.11 valid=30s ipv6=off;

    # ── Static Files (uploaded images) ───────────────────────────────────────
    location /static/ {
        alias /usr/share/nginx/static/;
        expires 30d;
        add_header Cache-Control "public, immutable";
        include /etc/nginx/conf.d/security_headers.inc;
    }

    # ── 429 JSON response ─────────────────────────────────────────────────────
    # Возвращаем JSON вместо дефолтного HTML при превышении лимита.
    # error_page только переопределяет тело — URI не проксируется.
    error_page 429 @rate_limited;
    location @rate_limited {
        default_type application/json;
        return 429 '{"detail":"Слишком много запросов. Попробуйте позже."}';
    }

    # ── Auth endpoints (строгий лимит — брутфорс-защита) ─────────────────────
    location ~* ^/api/v1/payments/auth {
        set $upstream_api http://api:8000;
        limit_req zone=auth_zone burst=3 nodelay;
        proxy_pass         $upstream_api;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $remote_addr;  # только реальный адрес: клиентский заголовок не пропускаем (лимиты API)
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
        proxy_connect_timeout 5s;
    }

    # ── FastAPI Backend ───────────────────────────────────────────────────────
    location /api {
        # Переменная заставляет nginx резолвить имя при каждом запросе (через
        # resolver выше), а не один раз при старте/reload — контейнер может
        # ещё не быть готов в момент перезагрузки конфига.
        set $upstream_api http://api:8000;
        limit_req zone=api_zone burst=20 nodelay;
        proxy_pass         $upstream_api;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $remote_addr;  # только реальный адрес: клиентский заголовок не пропускаем (лимиты API)
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
        proxy_connect_timeout 5s;
        client_max_body_size 15m;
    }

    # ── Bot Webhook ───────────────────────────────────────────────────────────
    location /webhook/bot {
        set $upstream_bot http://bot:8080;
        proxy_pass         $upstream_bot;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
    }

    # ── Support Bot Webhook ──────────────────────────────────────────────────
    location /webhook/support_bot {
        set $upstream_support http://support_bot:8081;
        proxy_pass         $upstream_support;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
    }

    # ── Payment Webhooks (ЮKassa, CryptoBot) ─────────────────────────────────
    location /webhooks {
        set $upstream_api http://api:8000;
        proxy_pass         $upstream_api;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $remote_addr;  # только реальный адрес: клиентский заголовок не пропускаем (лимиты API)
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
        proxy_connect_timeout 5s;
    }

    # ── Health check ──────────────────────────────────────────────────────────
    location /health {
        set $upstream_api http://api:8000;
        proxy_pass $upstream_api;
    }

    location ~ /\. { deny all; }
