# Заголовки безопасности. Подключать в каждом server (443) и в каждой location,
# где есть свой add_header: в nginx location с add_header НЕ наследует заголовки server.
# HSTS без includeSubDomains: поддомены (трекинг писем email.redonate.gg) могут быть по http.
add_header Strict-Transport-Security "max-age=31536000" always;
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Content-Security-Policy "frame-ancestors $frame_ancestors" always;
add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
