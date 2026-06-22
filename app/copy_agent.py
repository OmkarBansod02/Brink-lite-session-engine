"""Deterministic copy suggestions for recommended actions."""

from app.models import RecommendedAction


_SUGGESTED_COPY: dict[RecommendedAction, str] = {
    RecommendedAction.SHOW_RETURN_REASSURANCE: (
        "Free 30-day returns. Try it at home and return easily if it does not feel right."
    ),
    RecommendedAction.SHOW_SIZE_HELP: (
        "Not sure about fit? Most shoppers choose their usual size, and exchanges are easy."
    ),
    RecommendedAction.SHOW_SHIPPING_REASSURANCE: (
        "Fast shipping with clear delivery updates before checkout."
    ),
    RecommendedAction.SHOW_SOCIAL_PROOF: (
        "Popular choice this week. Shoppers who viewed this item often complete checkout."
    ),
    RecommendedAction.SHOW_VALUE_PROOF: (
        "Premium materials, easy returns, and support included — no discount needed yet."
    ),
    RecommendedAction.OFFER_SMALL_DISCOUNT: (
        "Still deciding? Here is 5% off to help you complete your order."
    ),
    RecommendedAction.NO_ACTION: "",
}


def get_suggested_copy(action: RecommendedAction) -> str:
    return _SUGGESTED_COPY[action]
