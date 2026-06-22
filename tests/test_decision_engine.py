import pytest
from fastapi.testclient import TestClient

from app.decision_engine import DecisionEngine
from app.main import app
from app.models import EventType, RecommendedAction, ShopperEvent
from app.session_store import SessionStore


client = TestClient(app)


@pytest.fixture(autouse=True)
def reset_api_store() -> None:
    client.post("/reset")


def decide_for(*event_types: EventType, margin_pct: float = 58):
    store = SessionStore()
    for event_type in event_types:
        session = store.add_event(
            ShopperEvent(
                session_id="test-session",
                event_type=event_type,
                margin_pct=margin_pct,
            )
        )
    return DecisionEngine().decide(session), session


def test_return_policy_and_cart_recommends_return_reassurance() -> None:
    decision, _ = decide_for(EventType.RETURN_POLICY_VIEW, EventType.ADD_TO_CART)
    assert decision.should_act is True
    assert decision.recommended_action == RecommendedAction.SHOW_RETURN_REASSURANCE
    assert decision.suggested_copy


def test_size_guide_and_cart_recommends_size_help() -> None:
    decision, _ = decide_for(EventType.SIZE_GUIDE_OPEN, EventType.ADD_TO_CART)
    assert decision.recommended_action == RecommendedAction.SHOW_SIZE_HELP


def test_low_margin_coupon_blocks_discount_and_shows_value() -> None:
    decision, _ = decide_for(
        EventType.ADD_TO_CART, EventType.COUPON_ATTEMPT, margin_pct=38
    )
    assert decision.guardrail.discount_allowed is False
    assert decision.recommended_action == RecommendedAction.SHOW_VALUE_PROOF


def test_low_intent_browsing_returns_no_action() -> None:
    decision, _ = decide_for(EventType.PRODUCT_VIEW)
    assert decision.should_act is False
    assert decision.recommended_action == RecommendedAction.NO_ACTION
    assert decision.suggested_copy == ""


def test_recommendation_can_repeat_before_intervention_is_shown() -> None:
    engine = DecisionEngine()
    store = SessionStore()
    for event_type in (EventType.RETURN_POLICY_VIEW, EventType.ADD_TO_CART):
        session = store.add_event(
            ShopperEvent(session_id="repeat", event_type=event_type)
        )

    first = engine.decide(session)
    repeated = engine.decide(session)

    assert first.recommended_action == RecommendedAction.SHOW_RETURN_REASSURANCE
    assert repeated.recommended_action == RecommendedAction.SHOW_RETURN_REASSURANCE
    assert session.intervention_already_shown is False
    assert session.offer_already_shown is False


def test_repeated_intervention_is_blocked_after_shown_event() -> None:
    engine = DecisionEngine()
    store = SessionStore()
    for event_type in (
        EventType.RETURN_POLICY_VIEW,
        EventType.ADD_TO_CART,
        EventType.INTERVENTION_SHOWN,
    ):
        session = store.add_event(
            ShopperEvent(session_id="shown", event_type=event_type)
        )

    repeated = engine.decide(session)

    assert session.intervention_already_shown is True
    assert repeated.recommended_action == RecommendedAction.NO_ACTION
    assert "already been shown" in repeated.reason


def test_offer_shown_event_blocks_another_discount() -> None:
    decision, session = decide_for(
        EventType.ADD_TO_CART,
        EventType.COUPON_ATTEMPT,
        EventType.OFFER_SHOWN,
    )

    assert session.offer_already_shown is True
    assert session.intervention_already_shown is False
    assert decision.guardrail.discount_allowed is False
    assert decision.recommended_action == RecommendedAction.SHOW_VALUE_PROOF


def test_purchase_outcome_is_tracked() -> None:
    store = SessionStore()
    session = store.add_event(
        ShopperEvent(session_id="buyer", event_type=EventType.PURCHASE)
    )
    decision = DecisionEngine().decide(session)
    assert session.purchased is True
    assert decision.recommended_action == RecommendedAction.NO_ACTION
    assert "converted" in decision.reason


def test_simulate_returns_four_sessions() -> None:
    response = client.post("/simulate")
    assert response.status_code == 200
    simulations = response.json()
    assert len(simulations) == 4
    assert {item["final_decision"]["recommended_action"] for item in simulations} == {
        "show_size_help",
        "show_return_reassurance",
        "show_shipping_reassurance",
        "show_value_proof",
    }


def test_metrics_returns_counts() -> None:
    client.post("/simulate")
    response = client.get("/metrics")
    assert response.status_code == 200
    metrics = response.json()
    assert metrics["total_sessions"] == 4
    assert metrics["total_events"] == 13
    assert metrics["actions_recommended"] == 4
    assert metrics["discounts_blocked"] == 1
    assert metrics["action_type_counts"]["show_value_proof"] == 1
