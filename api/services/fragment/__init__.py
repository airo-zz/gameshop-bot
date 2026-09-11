"""Vendored Fragment.com + TON integration (ported from UchetFP).

Самодостаточный платёжный слой автовыдачи Telegram Stars/Premium:
  FragmentAPI(cookie) — клиент fragment.com;
  TonClient(seed)     — перевод TON/USDT-jetton через pytoniq;
  StarsEngine/PremiumEngine — оркестрация init->link->transfer.

Тяжёлые зависимости (pytoniq, bs4, lxml) импортируются лениво внутри классов,
чтобы модуль импортировался даже там, где их нет.
"""
