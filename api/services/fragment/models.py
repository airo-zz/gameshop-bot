from pydantic import BaseModel, Field
from bs4 import BeautifulSoup
from .utils import fix_payload


class Recipient(BaseModel):
    myself: bool
    recipient: str
    photo: str
    name: str
    
    @property
    def photo_url(self) -> str | None:
        soup = BeautifulSoup(self.photo, "lxml")
        return soup.img["src"] if soup.img["src"].startswith("http") else None
    
    @property
    def photo_svg_hash(self) -> str | None:
        soup = BeautifulSoup(self.photo, "lxml")
        return soup.img["src"].split(",")[-1] if soup.img["src"].startswith("data") else None


class SearchRecipientResponse(BaseModel):
    ok: bool
    found: Recipient


class UpdateBuyStateResponse(BaseModel):
    ok: bool
    need_update: bool
    mode: str
    options_html: str | None = None
    dh: int | None = None


class InitBuyRequestResponse(BaseModel):
    req_id: str
    myself: bool
    to_bot: bool | None = None
    amount: str
    item_title: str
    content: str
    button: str
    
    @property
    def ton_amount(self) -> float:
        return float(self.amount)


class TransactionMessage(BaseModel):
    address: str
    amount: int
    payload: str
    
    @property
    def fixed_payload(self) -> str:
        return fix_payload(self.payload)


class Transaction(BaseModel):
    validUntil: int
    from_: str = Field(alias="from")
    messages: list[TransactionMessage]


class ConfirmParams(BaseModel):
    id_: str = Field(alias="id")


class GetBuyLinkResponse(BaseModel):
    ok: bool
    transaction: Transaction
    confirm_method: str
    confirm_params: ConfirmParams