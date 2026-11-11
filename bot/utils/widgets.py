"""
bot/utils/widgets.py
─────────────────────────────────────────────────────────────────────────────
Виджеты (Bot API 10.4): интерактивный HTML прямо в сообщении. Работает в песочнице
Telegram без сети и клавиатуры — только нажатия; с ботом говорит запросами
TelegramWidget.request() (до 64 байт), бот отвечает answerWidgetQuery.

Здесь — методы API (в aiogram 3.31 их ещё нет) и виджет выбора товара раздела:
плитки «количество + цена», выбор нажатием, количество — пресетами и −/+,
итог и «В корзину» в самом сообщении. Запрос виджета: «a:<id товара>:<кол-во>»,
обработка — bot/handlers/client/widget_query.py.

Лимит кода — 4096 байт после zlib: большой раздел виджетом не отправляется
(category_widget_html вернёт None), тогда — обычный список кнопок.
Выключатель — BOT_WIDGETS в .env.
─────────────────────────────────────────────────────────────────────────────
"""

import json
import re
import zlib

from aiogram.methods import TelegramMethod
from aiogram.types import InlineKeyboardMarkup, Message

from shared.config import settings

WIDGET_ZLIB_LIMIT = 4096


class SendWidget(TelegramMethod[Message]):
    __returning__ = Message
    __api_method__ = "sendWidget"

    chat_id: int
    html: str
    caption: str | None = None
    parse_mode: str | None = None
    show_caption_above_media: bool | None = None
    allow_queries: bool | None = None
    chat_data: str | None = None
    reply_markup: InlineKeyboardMarkup | None = None


class AnswerWidgetQuery(TelegramMethod[bool]):
    __returning__ = bool
    __api_method__ = "answerWidgetQuery"

    widget_query_id: str
    data: str | None = None


def widgets_enabled() -> bool:
    return settings.BOT_WIDGETS


# ── Количество из названия товара ────────────────────────────────────────────

_AMOUNT_RE = re.compile(r"^(\d+(?: \d{3})*)(?:,(\d+))?\s+(\S.*)$")
_TERM_RE = re.compile(r"^(дн|день|дня|недел|месяц|час|минут|сут)", re.I)


def split_amount(name: str) -> tuple[str, str] | None:
    """«10.000 рунических камней» → («10 000», «рунических камней»); срок («7 дней») — нет."""
    n = re.sub(r"(?<=\d)[.\s ](?=\d{3}(?!\d))", " ", name.strip())
    m = _AMOUNT_RE.match(n)
    if not m or _TERM_RE.match(m.group(3)):
        return None
    num = m.group(1) + (f",{m.group(2)}" if m.group(2) else "")
    return num, m.group(3)


# ── Виджет раздела ───────────────────────────────────────────────────────────

# D = {p: [[id, число, подпись, цена, мин. кол-во «за единицу» (0 — штучный), нет в наличии, макс. штук, единица]]}
_TEMPLATE = """<style>
body{margin:0;padding:10px 12px 0;font:15px/1.3 system-ui,sans-serif}
.g{display:grid;grid-template-columns:1fr 1fr;gap:6px}
.t{border-radius:12px;padding:8px 10px;background:var(--tg-theme-secondary-bg-color);border:1.5px solid transparent;min-height:42px}
.t.a{border-color:var(--tg-theme-button-color)}
.t.o{opacity:.45}
.n{font-weight:650;font-size:17px;font-variant-numeric:tabular-nums}
.u,.h{font-size:12px;color:var(--tg-theme-hint-color)}
.l{font-size:14px;font-weight:550;max-height:36px;overflow:hidden}
.p{margin-top:2px;font-weight:600;color:var(--tg-theme-link-color);font-variant-numeric:tabular-nums}
.r{display:flex;align-items:center;gap:6px;margin-top:10px}
.r button{min-width:40px;padding:6px 10px;border-radius:10px}
.c{display:flex;gap:5px;flex-wrap:wrap;margin-top:8px}
.c span{padding:5px 9px;border-radius:9px;font-size:13px;background:var(--tg-theme-secondary-bg-color);border:1.5px solid transparent;font-variant-numeric:tabular-nums}
.c span.a{border-color:var(--tg-theme-button-color)}
.q{flex:1;text-align:center;font-size:20px;font-weight:650;font-variant-numeric:tabular-nums}
.b{display:flex;align-items:center;gap:10px;margin-top:12px;padding:10px 0 max(10px,env(safe-area-inset-bottom));border-top:1px solid var(--tg-theme-section-separator-color)}
.b .x{flex:1}
.b .x b{display:block;font-size:19px;font-variant-numeric:tabular-nums}
.b button{padding:10px 16px;border-radius:12px;font-weight:600;background:var(--tg-theme-button-color);color:var(--tg-theme-button-text-color)}
.b button[disabled]{opacity:.5}
.m{font-size:13px;margin-top:6px;min-height:17px}
.ok{color:#2fb36b}.er{color:var(--tg-theme-destructive-text-color)}
</style>
<div id="A"></div>
<script>
var W=window.TelegramWidget,D=__DATA__,P=D.p,s=-1,g=0,q=1,busy=0,N=8,msg='',mc='';
var F=new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2});
function r(x){return F.format(Math.round(x*100)/100)+'\\u00a0₽'}
function hp(t){try{W.HapticFeedback.selectionChanged()}catch(e){}}
function pr(m){return[1,2,5,10,20,50].map(function(k){return k*m})}
function pick(i){var p=P[i];if(p[5])return;s=i;q=p[4]?pr(p[4])[1]:1;msg='';hp();R()}
function pg(d){var n=Math.ceil(P.length/N);g=(g+d+n)%n;hp();R()}
function st(d){var p=P[s],m=p[4]||1;q=Math.max(m,Math.min(p[4]?1e6:p[6],q+d*m));msg='';hp();R()}
function setq(v){q=v;msg='';hp();R()}
function add(){if(s<0||busy)return;var p=P[s];busy=1;msg='Добавляю…';mc='';R();
W.request('a:'+p[0]+':'+q).then(function(a){busy=0;var o={};try{o=JSON.parse(a.result)}catch(e){}
if(o.ok){msg='✓ '+o.m;mc='ok';try{W.HapticFeedback.notificationOccurred('success')}catch(e){}}else{msg=o.e||'Не получилось';mc='er'}R()},
function(e){busy=0;msg=e.code=='RATE_LIMITED'?'Слишком часто — подождите':'Нет связи с ботом, попробуйте ещё раз';mc='er';R()})}
function R(){var h='<div class="g">',n=Math.ceil(P.length/N),i,p;
for(i=g*N;i<Math.min(P.length,g*N+N);i++){p=P[i];
h+='<div class="t'+(i==s?' a':'')+(p[5]?' o':'')+'" onclick="pick('+i+')">'+(p[1]?'<span class="n">'+p[1]+'</span> <span class="u">'+p[2]+'</span>':'<div class="l">'+p[2]+'</div>')+
'<div class="p">'+(p[5]?'нет в наличии':r(p[3])+(p[4]?' <span class="h">за 1</span>':''))+'</div></div>'}
h+='</div>';
if(n>1)h+='<div class="r"><button onclick="pg(-1)">‹</button><span class="q h">'+(g+1)+' / '+n+'</span><button onclick="pg(1)">›</button></div>';
if(s>=0){p=P[s];
h+='<div class="r"><button onclick="st(-1)">−</button><span class="q">'+F.format(q)+(p[4]?' <span class="u">'+p[7]+'</span>':' шт.')+'</span><button onclick="st(1)">+</button></div>';
if(p[4])h+='<div class="c">'+pr(p[4]).map(function(v){return'<span class="'+(v==q?'a':'')+'" onclick="setq('+v+')">'+F.format(v)+'</span>'}).join('')+'</div>'}
h+='<div class="m '+mc+'">'+msg+'</div><div class="b"><div class="x"><span class="h">Итого</span><b>'+(s<0?'—':r(P[s][3]*q))+'</b></div><button '+(s<0||busy?'disabled ':'')+'onclick="add()">'+(s<0?'Выберите товар':'В корзину')+'</button></div>';
document.getElementById('A').innerHTML=h}
if(P.length==1&&!P[0][5])pick(0);R();if(W.ready)W.ready();
</script>"""


def _esc(s: str) -> str:
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def category_widget_html(products: list) -> str | None:
    """HTML виджета раздела или None, если раздел не помещается в лимит виджета."""
    rows = []
    for p in products:
        qty = next((f for f in (p.input_fields or []) if isinstance(f, dict) and f.get("type") == "quantity"), None)
        out = 1 if (p.is_out_of_stock or (p.stock is not None and p.stock <= 0)) else 0
        max_pcs = 10 if p.stock is None else max(1, min(10, int(p.stock)))
        if qty:
            # товар «за единицу» (звёзды, сумма Steam): количество выбирают в виджете
            try:
                qmin = max(1, int(qty.get("min") or 1))
            except (TypeError, ValueError):
                qmin = 1
            unit = _esc((qty.get("unit") or "шт.").strip())
            rows.append([p.id.hex, "", f"от {qmin} {unit}", round(float(p.price), 2), qmin, out, max_pcs, unit])
            continue
        amount = split_amount(p.name)
        num, label = (amount[0], _esc(amount[1])) if amount else ("", _esc(p.name))
        rows.append([p.id.hex, num, label, round(float(p.price), 2), 0, out, max_pcs, ""])
    data = json.dumps({"p": rows}, ensure_ascii=False, separators=(",", ":"))
    html = _TEMPLATE.replace("__DATA__", data.replace("</", "<\\/"))
    if len(html.encode()) > 32768 or len(zlib.compress(html.encode(), 9)) > WIDGET_ZLIB_LIMIT:
        return None
    return html
