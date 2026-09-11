from typing import Literal
import base64
from pytoniq_core.boc.builder import Builder

def from_nano(value: int | str) -> float:
    return round(int(value) / 10 ** 9, 9)

def to_nano(value: float | str) -> int:
    return int(float(value) * (10 ** 9))

def fix_payload(payload: str) -> str:
    # Fragment отдаёт payload для usdt_ton в URL-safe base64 (символы -/_ вместо
    # +//). Обычный base64.b64decode молча ВЫКИДЫВАЕТ -/_ → тело ячейки короче →
    # pytoniq падает с BocError 'Not enough bytes for cells data'. TON-payload
    # проходил случайно — в нём этих символов не было. Приводим к стандартному
    # алфавиту ДО паддинга (для обычного base64 это no-op).
    payload = payload.replace('-', '+').replace('_', '/')
    padding = len(payload) % 4
    if padding > 0:
        payload += '=' * (4 - padding)
    return payload

def add_recepient_to_payload(payload: str, recepient: str, category: Literal["stars", "premium"]) -> str:
    fixed_payload = base64.b64decode(payload)
    if category == "stars":
        fixed_payload = fixed_payload.replace(b"Stars", f"Stars for {recepient}".encode())
    else:
        fixed_payload = fixed_payload.replace(b"months", f"months for {recepient}".encode())
        fixed_payload = fixed_payload.replace(b"year", f"year for {recepient}".encode())
    fixed_payload = base64.b64encode(fixed_payload).decode()
    fixed_payload = fix_payload(fixed_payload)
    return fixed_payload