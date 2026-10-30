# ─────────────────────────────────────────────────────────────────────────────
# Фронтенд: Mini App (/app) и страницы сайта (SEO-рендер, sitemap/robots,
# SPA) — только на redonate.gg.
# На redonate.su вместо них постоянное перенаправление на redonate.gg.
# ─────────────────────────────────────────────────────────────────────────────
    # ── Mini App (React SPA) ──────────────────────────────────────────────────
    location /app {
        root /usr/share/nginx/html;
        index index.html;
        try_files $uri $uri/index.html @spa_fallback;
        add_header Cache-Control "no-cache, no-store, must-revalidate";
        include /etc/nginx/conf.d/security_headers.inc;
        add_header Pragma "no-cache";

        location ~* \.(js|css|png|jpg|svg|ico|woff2)$ {
            root /usr/share/nginx/html;
            expires 30d;
            add_header Cache-Control "public, immutable";
            include /etc/nginx/conf.d/security_headers.inc;
        }
    }

    location @spa_fallback {
        root /usr/share/nginx/html;
        add_header Cache-Control "no-cache, no-store, must-revalidate";
        include /etc/nginx/conf.d/security_headers.inc;
        add_header Pragma "no-cache";
        try_files /app/index.html =404;
    }

    # ── SEO: индексируемые страницы сайта отдаёт API (api/routers/seo.py) ──────
    # Готовый HTML с метаданными, schema.org и текстом страницы; React затем
    # запускается как обычно. Если API недоступен — статический index.html.
    location ~ ^/(catalog|cashback|reviews|faq)?$ {
        set $upstream_api http://api:8000;
        rewrite ^/(.*)$ /seo/render/$1 break;
        proxy_pass         $upstream_api;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $remote_addr;  # только реальный адрес: клиентский заголовок не пропускаем (лимиты API)
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_connect_timeout 3s;
        proxy_read_timeout 10s;
        proxy_intercept_errors on;
        error_page 502 503 504 = @web_index;
        add_header Cache-Control "no-cache";
        include /etc/nginx/conf.d/security_headers.inc;
    }

    # Страница игры и страница раздела (/game/<игра>/<раздел>)
    location ~ ^/game/[^/]+(/[^/]+)?/?$ {
        set $upstream_api http://api:8000;
        rewrite ^/game/([^/]+)/?$ /seo/render/game/$1 break;
        rewrite ^/game/([^/]+)/([^/]+)/?$ /seo/render/game/$1/$2 break;
        proxy_pass         $upstream_api;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $remote_addr;  # только реальный адрес: клиентский заголовок не пропускаем (лимиты API)
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_connect_timeout 3s;
        proxy_read_timeout 10s;
        proxy_intercept_errors on;
        error_page 502 503 504 = @web_index;
        add_header Cache-Control "no-cache";
        include /etc/nginx/conf.d/security_headers.inc;
    }

    # llms.txt — описание магазина для нейросетей; <32 hex>.txt — ключ IndexNow.
    # Регулярка с {} в nginx — только в кавычках.
    location ~ "^/(sitemap\.xml|robots\.txt|llms\.txt|[0-9a-f]{32}\.txt)$" {
        set $upstream_api http://api:8000;
        proxy_pass         $upstream_api;
        proxy_set_header   Host $host;
        proxy_connect_timeout 3s;
        proxy_read_timeout 10s;
    }

    location @web_index {
        root /usr/share/nginx/web;
        add_header Cache-Control "no-cache";
        include /etc/nginx/conf.d/security_headers.inc;
        try_files /index.html =404;
    }

    # ── Public Website (React SPA, base /) ─────────────────────────────────────
    # Отдаёт dist-web из /usr/share/nginx/web. Неизвестные пути → index.html
    # (клиентский роутинг). Более специфичные локации (/app, /api, /static, …)
    # матчатся раньше этого catch-all.
    location / {
        root /usr/share/nginx/web;
        index index.html;
        try_files $uri /index.html;
        add_header Cache-Control "no-cache, no-store, must-revalidate";
        include /etc/nginx/conf.d/security_headers.inc;

        location ~* \.(js|css|png|jpg|jpeg|gif|svg|ico|woff2?)$ {
            root /usr/share/nginx/web;
            expires 30d;
            add_header Cache-Control "public, immutable";
            include /etc/nginx/conf.d/security_headers.inc;
        }
    }

