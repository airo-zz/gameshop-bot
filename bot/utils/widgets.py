"""
bot/utils/widgets.py
─────────────────────────────────────────────────────────────────────────────
Виджеты (Bot API 10.4): интерактивный HTML прямо в сообщении. Работает в песочнице
Telegram без сети и клавиатуры — только нажатия; с ботом говорит запросами
TelegramWidget.request() (до 64 байт), бот отвечает answerWidgetQuery.

Здесь — методы API (в aiogram 3.31 их ещё нет) и виджет выбора товаров раздела
(описание у шаблона ниже). Запросы обрабатывает bot/handlers/client/widget_query.py.

Лимит кода — 4096 байт после zlib: большой раздел виджетом не отправляется
(category_widget_html вернёт None), тогда — обычный список кнопок.
Выключатель — BOT_WIDGETS в .env.
─────────────────────────────────────────────────────────────────────────────
"""

import base64
import json
import re
import uuid
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
# Список в одну колонку: число + подпись, цена, «+» → счётчик «− N +». Количество
# меняется сразу, без бота; кнопка внизу кладёт всё выбранное в корзину одним
# запросом «b:<раздел>:<число товаров>:<номер.кол-во,…>» (номера — в порядке
# category_products()). Раздел из одного товара «за единицу» (звёзды) — крупное
# число, ползунок, пресеты и ±.
# D = {c: id раздела (base64url), p: [[число, подпись, цена, мин. кол-во «за единицу»
#      (0 — штучный), нет в наличии, макс. штук, единица]]}
_TEMPLATE = """<style>
body{margin:0;padding:4px 0 0;font:15px/1.3 system-ui,sans-serif}
.i{display:flex;align-items:center;gap:10px;padding:7px 12px}
.i+.i{border-top:1px solid var(--tg-theme-section-separator-color)}
.i.o{opacity:.45}
.nm{flex:1;min-width:0}
.n{font-weight:650;font-size:16px;font-variant-numeric:tabular-nums}
.u,.h{font-size:12px;color:var(--tg-theme-hint-color)}
.lb{font-size:14px;font-weight:550}
.pr{font-weight:600;white-space:nowrap;font-variant-numeric:tabular-nums}
.k{display:flex;align-items:center;gap:2px}
.k b{min-width:24px;text-align:center;font-variant-numeric:tabular-nums}
.c{width:32px;height:32px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:600;background:var(--tg-theme-secondary-bg-color);color:var(--tg-theme-link-color)}
.c.p{background:var(--tg-theme-button-color);color:var(--tg-theme-button-text-color)}
.pg{display:flex;justify-content:center;align-items:center;gap:16px;padding:4px 0 0}
.bar{display:flex;align-items:center;gap:10px;margin-top:6px;padding:10px 12px max(10px,env(safe-area-inset-bottom));border-top:1px solid var(--tg-theme-section-separator-color)}
.bar .x{flex:1}.bar .x b{display:block;font-size:18px;font-variant-numeric:tabular-nums}
.go{padding:10px 16px;border-radius:12px;font-weight:600;background:var(--tg-theme-button-color);color:var(--tg-theme-button-text-color)}
.go.d{opacity:.45}
.m{font-size:13px;padding:6px 12px 0}
.ok{color:#2fb36b}.er{color:var(--tg-theme-destructive-text-color)}
.big{display:flex;align-items:center;justify-content:center;gap:14px;padding:10px 12px 0}
.big div{text-align:center;min-width:120px}.big b{display:block;font-size:34px;font-weight:700;letter-spacing:-.5px;font-variant-numeric:tabular-nums}
.tr{position:relative;height:36px;margin:6px 28px 0;touch-action:none}
.ln,.fl{position:absolute;left:0;top:15px;height:6px;border-radius:3px}
.ln{right:0;background:var(--tg-theme-secondary-bg-color)}.fl{background:var(--tg-theme-button-color)}
.th{position:absolute;top:5px;width:26px;height:26px;margin-left:-13px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.4)}
.ps{display:flex;gap:5px;flex-wrap:wrap;justify-content:center;padding:10px 12px 0}
.ps span{padding:6px 10px;border-radius:9px;font-size:13px;background:var(--tg-theme-secondary-bg-color);border:1.5px solid transparent;font-variant-numeric:tabular-nums}
.ps span.a{border-color:var(--tg-theme-button-color)}
</style><div id="A"></div>
<script>
var W=window.TelegramWidget,D=__DATA__,P=D.p,Q={},g=0,N=10,busy=0,msg='',mc='',S=P.length==1&&P[0][3]&&!P[0][4];
var F=new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2}),E=function(i){return document.getElementById(i)};
function r(x){return F.format(Math.round(x*100)/100)+'\\u00a0₽'}
function hp(){try{W.HapticFeedback.selectionChanged()}catch(e){}}
function sum(){var t=0,c=0;for(var k in Q){t+=P[k][2]*Q[k];c+=P[k][3]?1:Q[k]}return[t,c]}
function ch(i,d){var p=P[i];if(p[4]||busy)return;var v=(Q[i]||0)+d*(p[3]||1);if(!p[3]&&v>p[5])v=p[5];
if(v<=0)delete Q[i];else{if(!(i in Q)&&Object.keys(Q).length>=6){msg='Сначала добавьте выбранное в корзину';mc='er';R();return}Q[i]=v}msg='';hp();R()}
function req(){var s='b:'+D.c+':'+P.length.toString(36)+':'+Object.keys(Q).map(function(k){return(+k).toString(36)+'.'+Q[k]}).join(',');return s}
function go(){var t=sum();if(busy||!t[1])return;busy=1;msg='Добавляю…';mc='';R();
W.request(req()).then(function(a){busy=0;var o={};try{o=JSON.parse(a.result)}catch(e){}
if(o.ok){if(!S)Q={};msg='✓ '+o.m;mc='ok';try{W.HapticFeedback.notificationOccurred('success')}catch(e){}}else{msg=o.e||'Не получилось';mc='er'}R()},
function(e){busy=0;msg=e.code=='RATE_LIMITED'?'Слишком часто — подождите пару секунд':'Нет ответа от бота, попробуйте ещё раз';mc='er';R()})}
var lo=S?P[0][3]:1,hi=lo*200;
function sv(v){v=v<1000?Math.round(v/10)*10:Math.round(v/50)*50;return Math.max(lo,Math.min(hi,v))}
function pos(v){return Math.log(v/lo)/Math.log(hi/lo)}
function upd(){var v=Q[0]||lo,x=pos(v)*100+'%';E('V').textContent=F.format(v);E('L').style.width=x;E('H').style.left=x;E('T').textContent=r(P[0][2]*v);
var c=document.querySelectorAll('.ps span');for(var j=0;j<c.length;j++)c[j].className=+c[j].dataset.v==v?'a':''}
function sl(e){var b=E('K').getBoundingClientRect(),t=Math.max(0,Math.min(1,(e.clientX-b.left)/b.width)),v=sv(lo*Math.pow(hi/lo,t));if(v!=Q[0]){Q[0]=v;hp();msg='';upd()}}
function sd(d){var v=Q[0]||lo;Q[0]=sv(v+d*(v<1000?10:50));msg='';hp();R()}
function bar(t){return'<div class="m '+mc+'">'+msg+'</div><div class="bar"><div class="x"><span class="h">Итого'+(t[1]&&!S?' · '+t[1]+' шт.':'')+'</span><b id="T">'+(t[1]?r(t[0]):'—')+'</b></div><div class="go'+(busy||!t[1]?' d':'')+'" onclick="go()">'+(busy?'…':'В корзину')+'</div></div>'}
function R(){var h='',t=sum(),i,p;
if(S){p=P[0];h='<div class="big"><div class="c" onclick="sd(-1)">−</div><div><b id="V"></b><span class="h">'+p[6]+' · '+r(p[2])+' за 1</span></div><div class="c" onclick="sd(1)">+</div></div>'+
'<div class="tr" id="K"><div class="ln"></div><div class="fl" id="L"></div><div class="th" id="H"></div></div><div class="ps">'+
[1,2,5,10,20,50].map(function(k){return'<span data-v="'+k*lo+'" onclick="Q[0]='+k*lo+';msg=\\'\\';hp();R()">'+F.format(k*lo)+'</span>'}).join('')+'</div>'+bar(t);
E('A').innerHTML=h;upd();var K=E('K');K.onpointerdown=function(e){K.setPointerCapture(e.pointerId);sl(e)};K.onpointermove=function(e){if(e.buttons||e.pressure)sl(e)};return}
var n=Math.ceil(P.length/N);h='<div id="Z">';
for(i=g*N;i<Math.min(P.length,g*N+N);i++){p=P[i];var q=Q[i]||0;
h+='<div class="i'+(p[4]?' o':'')+'"><div class="nm">'+(p[0]?'<span class="n">'+p[0]+'</span> <span class="u">'+p[1]+'</span>':'<div class="lb">'+p[1]+'</div>')+
(p[3]?'<div class="h">'+r(p[2])+' за 1, шаг '+p[3]+'</div>':'')+'</div>'+
(p[4]?'<span class="h">нет</span>':(p[3]?'':'<span class="pr">'+r(p[2])+'</span>')+(q?'<div class="k"><div class="c" onclick="ch('+i+',-1)">−</div><b>'+F.format(q)+'</b><div class="c" onclick="ch('+i+',1)">+</div></div>':'<div class="c p" onclick="ch('+i+',1)">+</div>'))+'</div>'}
h+='</div>';if(n>1)h+='<div class="pg"><div class="c" onclick="pg(-1)">‹</div><span class="h">'+(g+1)+' / '+n+'</span><div class="c" onclick="pg(1)">›</div></div>';
E('A').innerHTML=h+bar(t);var Z=E('Z'),x0=null;Z.style.touchAction='pan-y';
Z.onpointerdown=function(e){x0=e.clientX};Z.onpointerup=function(e){if(x0!=null&&Math.abs(e.clientX-x0)>60)pg(e.clientX<x0?1:-1);x0=null}}
function pg(d){var n=Math.ceil(P.length/N);if(n<2)return;g=(g+d+n)%n;hp();R()}
if(S)Q[0]=sv(lo*2);R();if(W.ready)W.ready();
</script>"""


def _esc(s: str) -> str:
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def category_key(category_id) -> str:
    """id раздела для запроса виджета: 22 символа base64url вместо 36."""
    return base64.urlsafe_b64encode(category_id.bytes).decode().rstrip("=")


def category_from_key(key: str):
    return uuid.UUID(bytes=base64.urlsafe_b64decode(key + "=" * (-len(key) % 4)))


def category_widget_html(category_id, products: list) -> str | None:
    """HTML виджета раздела или None, если раздел не помещается в лимит виджета.
    products — в порядке category_products(): по номерам бот найдёт выбранное."""
    rows = []
    for p in products:
        qty = next((f for f in (p.input_fields or []) if isinstance(f, dict) and f.get("type") == "quantity"), None)
        out = 1 if (p.is_out_of_stock or (p.stock is not None and p.stock <= 0)) else 0
        max_pcs = 10 if p.stock is None else max(1, min(10, int(p.stock)))
        price = round(float(p.price), 2)
        if qty:
            try:
                qmin = max(1, int(qty.get("min") or 1))
            except (TypeError, ValueError):
                qmin = 1
            unit = _esc((qty.get("unit") or "шт.").strip())
            rows.append(["", f"{_esc(p.name)}", price, qmin, out, max_pcs, unit])
            continue
        amount = split_amount(p.name)
        num, label = (amount[0], _esc(amount[1])) if amount else ("", _esc(p.name))
        rows.append([num, label, price, 0, out, max_pcs, ""])
    data = json.dumps({"c": category_key(category_id), "p": rows}, ensure_ascii=False, separators=(",", ":"))
    html = _TEMPLATE.replace("__DATA__", data.replace("</", "<\\/"))
    if len(html.encode()) > 32768 or len(zlib.compress(html.encode(), 9)) > WIDGET_ZLIB_LIMIT:
        return None
    return html
