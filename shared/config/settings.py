"""
shared/config/settings.py
─────────────────────────────────────────────────────────────────────────────
Единый конфиг для всей системы (bot, api, worker).
Название магазина (SHOP_NAME) читается из .env и используется везде:
  - в приветствиях бота
  - в заголовках Mini App
  - в письмах/чеках
  - в текстах уведомлений

Изменить название = поменять SHOP_NAME в .env → перезапустить контейнеры.
─────────────────────────────────────────────────────────────────────────────
"""

from functools import lru_cache
from typing import Literal

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class ShopSettings(BaseSettings):
    """Настройки магазина — название, описание, контакты."""

    SHOP_NAME: str = "reDonate"
    SHOP_TAGLINE: str = "Игровой донат и виртуальные товары"
    SHOP_SUPPORT_USERNAME: str = "reDonateSupport_bot"

    # Форматированные варианты названия (генерируются автоматически)
    @property
    def shop_name_upper(self) -> str:
        return self.SHOP_NAME.upper()

    @property
    def shop_name_emoji(self) -> str:
        """Название с эмодзи для заголовков бота."""
        return f"🎮 {self.SHOP_NAME}"

    @property
    def support_link(self) -> str:
        return f"@{self.SHOP_SUPPORT_USERNAME}"


class TelegramSettings(BaseSettings):
    BOT_TOKEN: str
    BOT_USERNAME: str = "redonate_bot"  # username бота без @
    ADMIN_BOT_TOKEN: str = ""           # если нет отдельного — используем BOT_TOKEN
    SUPPORT_BOT_TOKEN: str = ""         # токен бота поддержки
    SUPPORT_NOTIFY_CHAT_ID: int = 0     # chat_id группы операторов для уведомлений
    WEBHOOK_HOST: str = ""
    WEBHOOK_PATH: str = "/webhook/bot"
    WEBHOOK_SECRET: str = ""
    MINIAPP_URL: str = ""

    @property
    def effective_admin_token(self) -> str:
        return self.ADMIN_BOT_TOKEN or self.BOT_TOKEN

    @property
    def effective_support_token(self) -> str:
        return self.SUPPORT_BOT_TOKEN or self.BOT_TOKEN

    @property
    def webhook_url(self) -> str:
        return f"{self.WEBHOOK_HOST}{self.WEBHOOK_PATH}"


class DatabaseSettings(BaseSettings):
    POSTGRES_HOST: str = "db"
    POSTGRES_PORT: int = 5432
    POSTGRES_USER: str = "gameshop"
    POSTGRES_PASSWORD: str
    POSTGRES_DB: str = "gameshop"
    DATABASE_URL: str = ""

    @model_validator(mode="after")
    def build_database_url(self) -> "DatabaseSettings":
        if not self.DATABASE_URL:
            self.DATABASE_URL = (
                f"postgresql+asyncpg://{self.POSTGRES_USER}:"
                f"{self.POSTGRES_PASSWORD}@{self.POSTGRES_HOST}:"
                f"{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
            )
        return self

    @property
    def sync_url(self) -> str:
        """Синхронный URL для Alembic."""
        return self.DATABASE_URL.replace("+asyncpg", "+psycopg2")


class RedisSettings(BaseSettings):
    REDIS_HOST: str = "redis"
    REDIS_PORT: int = 6379
    REDIS_PASSWORD: str = ""
    REDIS_URL: str = ""
    CELERY_BROKER_URL: str = ""
    CELERY_RESULT_BACKEND: str = ""

    @model_validator(mode="after")
    def build_redis_urls(self) -> "RedisSettings":
        auth = f":{self.REDIS_PASSWORD}@" if self.REDIS_PASSWORD else ""
        base = f"redis://{auth}{self.REDIS_HOST}:{self.REDIS_PORT}"
        if not self.REDIS_URL:
            self.REDIS_URL = f"{base}/0"
        if not self.CELERY_BROKER_URL:
            self.CELERY_BROKER_URL = f"{base}/1"
        if not self.CELERY_RESULT_BACKEND:
            self.CELERY_RESULT_BACKEND = f"{base}/2"
        return self


class JWTSettings(BaseSettings):
    JWT_SECRET_KEY: str
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    JWT_REFRESH_TOKEN_EXPIRE_DAYS: int = 30


class PaymentSettings(BaseSettings):
    YUKASSA_SHOP_ID: str = ""
    YUKASSA_SECRET_KEY: str = ""
    CRYPTOBOT_TOKEN: str = ""
    CRYPTOBOT_NETWORK: Literal["mainnet", "testnet"] = "mainnet"


class SecuritySettings(BaseSettings):
    ENCRYPTION_KEY: str = ""           # Fernet key для шифрования ключей выдачи
    RATE_LIMIT_CLIENT: int = 30        # req/min
    RATE_LIMIT_ADMIN: int = 100
    INTERNAL_API_KEY: str = ""         # Токен для межсервисных запросов (bot → api)
    INTERNAL_API_BASE_URL: str = "http://api:8000"  # Адрес API внутри Docker-сети

    @field_validator("ENCRYPTION_KEY")
    @classmethod
    def validate_encryption_key(cls, v: str) -> str:
        if v and len(v) < 32:
            raise ValueError("ENCRYPTION_KEY должен быть минимум 32 символа")
        return v


class StorageSettings(BaseSettings):
    S3_ENDPOINT: str = ""
    S3_ACCESS_KEY: str = ""
    S3_SECRET_KEY: str = ""
    S3_BUCKET: str = "gameshop-media"
    S3_REGION: str = "us-east-1"


class AppSettings(BaseSettings):
    DEBUG: bool = False
    LOG_LEVEL: str = "INFO"
    ENVIRONMENT: Literal["development", "production"] = "production"
    ABANDONED_CART_HOURS: int = 1
    CART_PRICE_RESERVE_HOURS: int = 24

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )


class Settings(
    ShopSettings,
    TelegramSettings,
    DatabaseSettings,
    RedisSettings,
    JWTSettings,
    PaymentSettings,
    SecuritySettings,
    StorageSettings,
    AppSettings,
):
    """
    Главный класс настроек.
    Все группы объединены через множественное наследование.

    Использование:
        from shared.config import settings
        print(settings.SHOP_NAME)
        print(settings.shop_name_emoji)   # "🎮 reDonate"
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """
    Синглтон настроек с кэшированием.
    lru_cache гарантирует одно чтение .env за всё время жизни процесса.
    """
    return Settings()


# Удобный импорт
settings = get_settings()
