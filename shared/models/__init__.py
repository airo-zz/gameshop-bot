"""
shared/models/__init__.py
─────────────────────────────────────────────────────────────────────────────
Центральный реестр всех моделей.
Импортируй отсюда — не из отдельных файлов — чтобы Alembic видел все таблицы.
─────────────────────────────────────────────────────────────────────────────
"""

from .base import Base, TimestampMixin, UUIDMixin

from .user import (
    LoyaltyLevel,
    User,
    BalanceTransaction,
    ReferralReward,
    ShopSettings,
)

from .catalog import (
    DeliveryType,
    Game,
    Category,
    Product,
    ProductLot,
    ProductKey,
    UserFavorite,
    UserViewedProduct,
    Review,
)

from .discount import (
    DiscountType,
    DiscountValueType,
    DiscountRule,
    PromoCode,
    PromoCodeUsage,
)

from .cart import (
    Cart,
    CartItem,
    AbandonedCart,
)

from .order import (
    OrderStatus,
    PaymentMethod,
    PaymentStatus,
    ALLOWED_STATUS_TRANSITIONS,
    Order,
    OrderItem,
    OrderStatusHistory,
    OrderDiscountLog,
    Payment,
)

from .support import (
    TicketStatus,
    SupportTicket,
    TicketMessage,
    SupportTemplate,
    AdminRole,
    DEFAULT_PERMISSIONS,
    AdminUser,
    AdminActionLog,
)

from .chat import (
    Chat,
    ChatMessage,
)

__all__ = [
    # Base
    "Base", "TimestampMixin", "UUIDMixin",
    # User
    "LoyaltyLevel", "User", "BalanceTransaction", "ReferralReward", "ShopSettings",
    # Catalog
    "DeliveryType", "Game", "Category", "Product",
    "ProductLot", "ProductKey", "UserFavorite", "UserViewedProduct", "Review",
    # Discount
    "DiscountType", "DiscountValueType", "DiscountRule", "PromoCode", "PromoCodeUsage",
    # Cart
    "Cart", "CartItem", "AbandonedCart",
    # Order
    "OrderStatus", "PaymentMethod", "PaymentStatus",
    "ALLOWED_STATUS_TRANSITIONS",
    "Order", "OrderItem", "OrderStatusHistory", "OrderDiscountLog", "Payment",
    # Support & Admin
    "TicketStatus", "SupportTicket", "TicketMessage", "SupportTemplate",
    "AdminRole", "DEFAULT_PERMISSIONS", "AdminUser", "AdminActionLog",
    # Chat
    "Chat", "ChatMessage",
]
