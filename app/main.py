"""FastAPI interface for the brink-lite session decision engine."""

from collections import Counter
from typing import Any

from fastapi import FastAPI, HTTPException

from app.decision_engine import DecisionEngine
from app.models import (
    DecisionResponse,
    HesitationType,
    RecommendedAction,
    ShopperEvent,
)
from app.session_store import SessionStore
from app.simulator import run_simulations


app = FastAPI(title="Brink Lite Session Engine", version="2.0.0")
store = SessionStore()
engine = DecisionEngine()
_latest_decisions: dict[str, DecisionResponse] = {}


@app.post("/events", response_model=DecisionResponse)
def add_event(event: ShopperEvent) -> DecisionResponse:
    session = store.add_event(event)
    decision = engine.decide(session)
    _latest_decisions[event.session_id] = decision
    return decision


@app.get("/sessions/{session_id}/decision", response_model=DecisionResponse)
def get_decision(session_id: str) -> DecisionResponse:
    session = store.get_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    decision = engine.decide(session)
    _latest_decisions[session_id] = decision
    return decision


@app.post("/simulate")
def simulate() -> list[dict[str, Any]]:
    results = run_simulations(store, engine)
    _latest_decisions.clear()
    for result in results:
        decision = result["final_decision"]
        _latest_decisions[result["session_id"]] = decision
    return results


@app.get("/metrics")
def metrics() -> dict[str, Any]:
    sessions = store.list_sessions()
    decisions = list(_latest_decisions.values())
    action_counts = Counter(
        decision.recommended_action.value for decision in decisions
    )
    hesitation_counts = Counter(
        hesitation.value
        for decision in decisions
        for hesitation in decision.hesitation_types
    )

    return {
        "total_sessions": len(sessions),
        "total_events": sum(len(session.events) for session in sessions),
        "actions_recommended": sum(
            decision.recommended_action != RecommendedAction.NO_ACTION
            for decision in decisions
        ),
        "discounts_blocked": sum(
            not decision.guardrail.discount_allowed
            and HesitationType.PRICE_SENSITIVITY in decision.hesitation_types
            for decision in decisions
        ),
        "purchases": sum(session.purchased for session in sessions),
        "exits": sum(session.exited for session in sessions),
        "hesitation_reason_counts": dict(hesitation_counts),
        "action_type_counts": dict(action_counts),
    }


@app.post("/reset")
def reset() -> dict[str, str]:
    store.reset()
    _latest_decisions.clear()
    return {"status": "reset"}


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
