"""Typed domain models for the storefront decision loop."""

from datetime import datetime, timezone
from enum import Enum

from pydantic import BaseModel, Field


class EventType(str, Enum):
    PRODUCT_VIEW = "product_view"
    REPEAT_PRODUCT_VIEW = "repeat_product_view"
    SIZE_GUIDE_OPEN = "size_guide_open"
    RETURN_POLICY_VIEW = "return_policy_view"
    SHIPPING_INFO_VIEW = "shipping_info_view"
    ADD_TO_CART = "add_to_cart"
    CART_IDLE = "cart_idle"
    CHECKOUT_START = "checkout_start"
    COUPON_ATTEMPT = "coupon_attempt"
    INTERVENTION_SHOWN = "intervention_shown"
    OFFER_SHOWN = "offer_shown"
    PURCHASE = "purchase"
    EXIT = "exit"


class IntentLevel(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class HesitationType(str, Enum):
    FIT_UNCERTAINTY = "fit_uncertainty"
    RETURNS_UNCERTAINTY = "returns_uncertainty"
    SHIPPING_UNCERTAINTY = "shipping_uncertainty"
    PRICE_SENSITIVITY = "price_sensitivity"
    CHECKOUT_HESITATION = "checkout_hesitation"


class RecommendedAction(str, Enum):
    NO_ACTION = "no_action"
    SHOW_RETURN_REASSURANCE = "show_return_reassurance"
    SHOW_SIZE_HELP = "show_size_help"
    SHOW_SHIPPING_REASSURANCE = "show_shipping_reassurance"
    SHOW_SOCIAL_PROOF = "show_social_proof"
    SHOW_VALUE_PROOF = "show_value_proof"
    OFFER_SMALL_DISCOUNT = "offer_small_discount"


class GuardrailResult(BaseModel):
    discount_allowed: bool
    reason: str


class ShopperEvent(BaseModel):
    session_id: str
    event_type: EventType
    product_id: str | None = None
    cart_value: float | None = None
    margin_pct: float | None = None
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ShopperSession(BaseModel):
    session_id: str
    events: list[ShopperEvent] = Field(default_factory=list)
    product_id: str | None = None
    cart_value: float | None = None
    margin_pct: float | None = None
    offer_already_shown: bool = False
    intervention_already_shown: bool = False
    purchased: bool = False
    exited: bool = False


class DecisionResponse(BaseModel):
    session_id: str
    intent_score: int
    intent_level: IntentLevel
    hesitation_types: list[HesitationType] = Field(default_factory=list)
    should_act: bool
    recommended_action: RecommendedAction
    suggested_copy: str
    guardrail: GuardrailResult
    confidence: float = Field(ge=0.0, le=1.0)
    reason: str
