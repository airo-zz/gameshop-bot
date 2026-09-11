import json
import time
import requests
from bs4 import BeautifulSoup
import re
from typing import Literal
from cachetools import TTLCache

from .models import *
from .exceptions import *


class FragmentAPI:
    def __init__(self, cookie: str, rates_cache_time: int = 60):
        self.cookie: str = cookie
        self.base_url: str = "https://fragment.com/"
        self.api_url: str | None = None
        self.rates_cache_time: int = rates_cache_time
        self._caches = TTLCache(maxsize=3, ttl=self.rates_cache_time)
    
    
    def _send_request(self, method: Literal["POST", "GET"], endpoint: str = "", data: dict = None, api_method: bool = True) -> requests.Response:
        headers = {
            "Cookie": self.cookie
        }
        
        url = f"{self.base_url}{endpoint}"
        if api_method:
            if self.api_url is None:
                self._update_data()
                if self.api_url is None:
                    raise HashNotFoundException()
                
            url = f"{url}{self.api_url}"
        
        attempts = 3
        while attempts > 0:
            try:
                response = requests.request(method, url, headers=headers, data=data)
                response.raise_for_status()
                return response
            except Exception as exc:
                attempts -= 1
                if attempts == 0:
                    raise FragmentRequestException(exc)
                else:
                    time.sleep(1)
    
    
    def _update_data(self) -> bool:
        # self._update_stars_rate()
        # self._update_premium_prices()
        
        response = self._send_request("GET", api_method=False)
        soup = BeautifulSoup(response.text, "lxml")
        for script in soup.find_all("script"):
            if script.text and script.text.startswith("ajInit"):
                match = re.search(r"ajInit\((.+)\)", script.text)
                if match:
                    json_data = json.loads(match.group(1))
                    self.api_url = json_data['apiUrl']
                    self._caches['ton_rate'] = json_data['state']['tonRate']
                    return True
        
        return False


    @property
    def ton_rate(self) -> float:
        if self._caches.get("ton_rate") is None:
            self._update_data()
        return self._caches['ton_rate']
    
    
    """
    TG Stars
    """
    def _update_stars_rate(self) -> bool:
        
        data = self.update_stars_buy_state()
        
        soup = BeautifulSoup(data.options_html, "lxml")
        blocks = soup.find_all("label", class_="tm-form-radio-item")
        last_item = blocks[-1]
        stars_amount = int(last_item.find("input", class_="radio")['value'])
        ton_price = float(last_item.find("div", class_="tm-value").text.replace(",", ""))
        self._caches['stars_rate'] = ton_price / stars_amount
        return True
    
    
    @property
    def stars_rate(self) -> float:
        if self._caches.get("stars_rate") is None:
            self._update_stars_rate()
        return self._caches['stars_rate']

    
    def update_stars_buy_state(self) -> UpdateBuyStateResponse:
        data = {"method": "updateStarsBuyState"}
        
        response = self._send_request("POST", data=data)
        json_response = response.json()
        
        if (error_message := json_response.get("error")):
            raise FragmentAPIException(error_message)
        
        obj =  UpdateBuyStateResponse.model_validate(json_response)
        if obj.options_html is None:
            raise NoOptionFoundException()
        
        return obj

    
    # Ошибки от Fragment которые означают "невалидный/несуществующий username"
    # (buyer-error). Эти случаи мы трактуем как None — попросить ввести другой
    # username — а НЕ как technical exception (рефанд).
    _BUYER_ERROR_PHRASES = (
        "no telegram users found",
        "please enter a username",
        "username is invalid",
        "recipient not found",
        "user not found",
        "cannot find user",
        "this user cannot receive",
        "cannot send stars to this user",
    )

    @classmethod
    def _is_buyer_error(cls, message: str) -> bool:
        m = (message or "").lower()
        return any(phrase in m for phrase in cls._BUYER_ERROR_PHRASES)

    def search_stars_recipient(self, query: str, quantity: int = None) -> SearchRecipientResponse | None:
        if quantity is None:
            quantity = ""

        data = {
            "query": query,
            "quantity": quantity,
            "method": "searchStarsRecipient"
        }

        response = self._send_request("POST", data=data)
        json_response = response.json()

        if (error_message := json_response.get("error")):
            if self._is_buyer_error(error_message):
                return None
            raise FragmentAPIException(error_message)

        return SearchRecipientResponse.model_validate(json_response)

    
    def init_stars_buy_request(self, recipient: str, quantity: int,
                               payment_method: str = "ton") -> InitBuyRequestResponse:
        """Инициализация покупки Stars.
        payment_method: 'ton' (нативный TON) или 'usdt_ton' (USDT-jetton на TON).
        ВАЖНО: именно 'usdt_ton' — 'usdt'/'usdc' Fragment отвергает ('Access denied')
        (снято с живого UI 2026-08-04). Одно и то же значение шлём в init и в get_link.
        """
        data = {
            "recipient": recipient,
            "quantity": quantity,
            "method": "initBuyStarsRequest",
            "payment_method": payment_method,
            "transaction": 1,
        }

        response = self._send_request("POST", data=data)
        json_response = response.json()

        if (error_message := json_response.get("error")):
            raise FragmentAPIException(error_message)

        return InitBuyRequestResponse.model_validate(json_response)


    def get_stars_buy_link(self, request_id: str, show_sender: bool = False,
                           payment_method: str = "ton") -> GetBuyLinkResponse:
        data = {
            "transaction": 1,
            "id": request_id,
            "show_sender": int(show_sender),
            "method": "getBuyStarsLink",
            "payment_method": payment_method,
        }

        response = self._send_request("POST", data=data)
        json_response = response.json()

        if (error_message := json_response.get("error")):
            raise FragmentAPIException(error_message)

        return GetBuyLinkResponse.model_validate(json_response)
    
    
    """
    TG Premium
    """
    def _update_premium_prices(self) -> bool:
        prices = {}
        
        attempts = 0
        data = None
        while data is None and attempts <= 5:
            try:
                data = self.update_premium_state()
                break
            except NoOptionFoundException:
                attempts += 1
                time.sleep(1)
        else:
            return False
        
        soup = BeautifulSoup(data.options_html, "lxml")
        blocks = soup.find_all("label", class_="tm-form-radio-item")
        for block in blocks:
            months = int(block.find("input", class_="radio")['value'])
            ton_price = float(block.find("div", class_="tm-value").text.replace(",", ""))
            prices[months] = ton_price
            
        self._caches['premium_prices'] = prices
        return True
    
    
    @property
    def premium_prices(self) -> dict[int, float]:
        if self._caches.get("premium_prices") is None:
            self._update_premium_prices()
        return self._caches['premium_prices']
    
    
    def update_premium_state(self) -> UpdateBuyStateResponse:
        data = {"method": "updatePremiumState"}
        
        response = self._send_request("POST", data=data)
        json_response = response.json()
        if (error_message := json_response.get("error")):
            raise FragmentAPIException(error_message)
        
        obj =  UpdateBuyStateResponse.model_validate(json_response)
        if obj.options_html is None:
            raise NoOptionFoundException()
        
        return obj
    
    
    def search_premium_gift_recipient(self, query: str, months: int = 12) -> SearchRecipientResponse | None:
        data = {
            "query": query,
            "method": "searchPremiumGiftRecipient",
            "months": months
        }
        
        response = self._send_request("POST", data=data)
        json_response = response.json()
        
        if (error_message := json_response.get("error")):
            if error_message == "This account is already subscribed to Telegram Premium.":
                raise AccountAlreadyHasPremium(query)
            if self._is_buyer_error(error_message):
                return None
            raise FragmentAPIException(error_message)

        return SearchRecipientResponse.model_validate(json_response)
    
    
    def init_gift_premium_request(self, recipient: str, months: int,
                                   payment_method: str = "ton") -> InitBuyRequestResponse:
        data = {
            "recipient": recipient,
            "months": months,
            "method": "initGiftPremiumRequest",
            "payment_method": payment_method,
            "transaction": 1,
        }

        response = self._send_request("POST", data=data)
        json_response = response.json()

        if (error_message := json_response.get("error")):
            raise FragmentAPIException(error_message)

        return InitBuyRequestResponse.model_validate(json_response)


    def get_gift_premium_link(self, request_id: str, show_sender: bool = False,
                               payment_method: str = "ton") -> GetBuyLinkResponse:
        data = {
            "transaction": 1,
            "id": request_id,
            "show_sender": int(show_sender),
            "method": "getGiftPremiumLink",
            "payment_method": payment_method,
        }

        response = self._send_request("POST", data=data)
        json_response = response.json()

        if (error_message := json_response.get("error")):
            raise FragmentAPIException(error_message)

        return GetBuyLinkResponse.model_validate(json_response)