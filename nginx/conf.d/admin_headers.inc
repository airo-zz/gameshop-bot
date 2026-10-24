# Заголовки админки: общие заголовки безопасности + запрет индексации.
# Подключать в server и в каждой location со своим add_header (как security_headers.inc).
include /etc/nginx/conf.d/security_headers.inc;
add_header X-Robots-Tag "noindex, nofollow" always;
