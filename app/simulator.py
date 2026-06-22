"""Deterministic shopper journeys used by the demo API."""

from typing import Any

from app.decision_engine import DecisionEngine
from app.models import EventType, ShopperEvent
from app.session_store import SessionStore


_JOURNEYS: tuple[tuple[str, str, tuple[EventType, ...], float], ...] = (
    (
        "fit uncertainty",
        "simulation-fit",
        (
            EventType.PRODUCT_VIEW,
            EventType.SIZE_GUIDE_OPEN,
            EventType.ADD_TO_CART,
            EventType.CART_IDLE,
        ),
        58,
    ),
    (
        "returns uncertainty",
        "simulation-returns",
        (
            EventType.PRODUCT_VIEW,
            EventType.RETURN_POLICY_VIEW,
            EventType.ADD_TO_CART,
        ),
        58,
    ),
    (
        "shipping uncertainty",
        "simulation-shipping",
        (
            EventType.PRODUCT_VIEW,
            EventType.SHIPPING_INFO_VIEW,
            EventType.CHECKOUT_START,
        ),
        58,
    ),
    (
        "price sensitivity with low margin",
        "simulation-price",
        (
            EventType.PRODUCT_VIEW,
            EventType.ADD_TO_CART,
            EventType.COUPON_ATTEMPT,
        ),
        38,
    ),
)


def run_simulations(
    store: SessionStore, engine: DecisionEngine
) -> list[dict[str, Any]]:
    """Reset the demo store and run the four canonical journeys."""
    store.reset()
    results: list[dict[str, Any]] = []

    for name, session_id, event_types, margin_pct in _JOURNEYS:
        for event_type in event_types:
            session = store.add_event(
                ShopperEvent(
                    session_id=session_id,
                    event_type=event_type,
                    product_id="premium-linen-shirt",
                    cart_value=2499,
                    margin_pct=margin_pct,
                )
            )

        decision = engine.decide(session)
        results.append(
            {
                "simulation_name": name,
                "session_id": session_id,
                "event_timeline": session.events,
                "final_decision": decision,
            }
        )

    return results
