"""Deterministic, explainable shopper decision engine."""

from app.models import (
    DecisionResponse,
    EventType,
    GuardrailResult,
    HesitationType,
    IntentLevel,
    RecommendedAction,
    ShopperSession,
)


class DecisionEngine:
    _SCORES = {
        EventType.PRODUCT_VIEW: 10,
        EventType.REPEAT_PRODUCT_VIEW: 15,
        EventType.ADD_TO_CART: 35,
        EventType.CHECKOUT_START: 45,
        EventType.COUPON_ATTEMPT: 15,
        EventType.PURCHASE: 100,
    }

    _HESITATIONS = {
        EventType.SIZE_GUIDE_OPEN: HesitationType.FIT_UNCERTAINTY,
        EventType.RETURN_POLICY_VIEW: HesitationType.RETURNS_UNCERTAINTY,
        EventType.SHIPPING_INFO_VIEW: HesitationType.SHIPPING_UNCERTAINTY,
        EventType.COUPON_ATTEMPT: HesitationType.PRICE_SENSITIVITY,
        EventType.CART_IDLE: HesitationType.CHECKOUT_HESITATION,
    }

    def decide(self, session: ShopperSession) -> DecisionResponse:
        score = self._intent_score(session)
        level = self._intent_level(score)
        hesitations = self._hesitations(session)
        guardrail = self._guardrail(session)

        if session.purchased:
            return self._response(session, score, level, hesitations, guardrail,
                                  RecommendedAction.NO_ACTION, 1.0,
                                  "No action: this session has already converted.")
        if session.exited:
            return self._response(session, score, level, hesitations, guardrail,
                                  RecommendedAction.NO_ACTION, 1.0,
                                  "No action: this session has already exited.")
        if level == IntentLevel.LOW:
            return self._response(session, score, level, hesitations, guardrail,
                                  RecommendedAction.NO_ACTION, 0.4,
                                  "No action: shopper intent is still low.")
        if session.intervention_already_shown:
            return self._response(session, score, level, hesitations, guardrail,
                                  RecommendedAction.NO_ACTION, 0.9,
                                  "No action: one intervention has already been shown in this session.")

        action, confidence, reason = self._choose_action(level, hesitations, guardrail)
        return self._response(
            session, score, level, hesitations, guardrail, action, confidence, reason
        )

    def _intent_score(self, session: ShopperSession) -> int:
        score = 0
        has_added_to_cart = False
        for event in session.events:
            score += self._SCORES.get(event.event_type, 0)
            if event.event_type == EventType.ADD_TO_CART:
                has_added_to_cart = True
            elif event.event_type == EventType.CART_IDLE and has_added_to_cart:
                score += 20
        return score

    @staticmethod
    def _intent_level(score: int) -> IntentLevel:
        if score <= 30:
            return IntentLevel.LOW
        if score <= 70:
            return IntentLevel.MEDIUM
        return IntentLevel.HIGH

    def _hesitations(self, session: ShopperSession) -> list[HesitationType]:
        found: list[HesitationType] = []
        for event in session.events:
            hesitation = self._HESITATIONS.get(event.event_type)
            if hesitation is not None and hesitation not in found:
                found.append(hesitation)
        return found

    @staticmethod
    def _guardrail(session: ShopperSession) -> GuardrailResult:
        if session.margin_pct is not None and session.margin_pct < 45:
            return GuardrailResult(
                discount_allowed=False,
                reason="Discount blocked because margin is below 45%.",
            )
        if session.offer_already_shown:
            return GuardrailResult(
                discount_allowed=False,
                reason="Discount blocked because an offer has already been shown.",
            )
        return GuardrailResult(
            discount_allowed=True,
            reason="Discount allowed: margin guardrail passes and no offer was shown.",
        )

    @staticmethod
    def _choose_action(
        level: IntentLevel,
        hesitations: list[HesitationType],
        guardrail: GuardrailResult,
    ) -> tuple[RecommendedAction, float, str]:
        # Reassurance and practical help deliberately take priority over discounts.
        if HesitationType.RETURNS_UNCERTAINTY in hesitations:
            return (RecommendedAction.SHOW_RETURN_REASSURANCE,
                    0.85 if level == IntentLevel.HIGH else 0.72,
                    "Return-policy interest signals uncertainty; reassure this engaged shopper about returns.")
        if HesitationType.FIT_UNCERTAINTY in hesitations:
            return (RecommendedAction.SHOW_SIZE_HELP,
                    0.85 if level == IntentLevel.HIGH else 0.72,
                    "Size-guide interest signals fit uncertainty; offer sizing help before an incentive.")
        if HesitationType.SHIPPING_UNCERTAINTY in hesitations:
            return (RecommendedAction.SHOW_SHIPPING_REASSURANCE,
                    0.85 if level == IntentLevel.HIGH else 0.72,
                    "Shipping-info interest signals delivery uncertainty; clarify shipping for this engaged shopper.")
        if (HesitationType.CHECKOUT_HESITATION in hesitations
                and level == IntentLevel.HIGH):
            return (RecommendedAction.SHOW_SOCIAL_PROOF, 0.85,
                    "The high-intent shopper became idle after cart activity; use social proof to support checkout.")
        if HesitationType.PRICE_SENSITIVITY in hesitations:
            if not guardrail.discount_allowed:
                return (RecommendedAction.SHOW_VALUE_PROOF, 0.82,
                        f"A coupon attempt signals price sensitivity, but {guardrail.reason.lower()}")
            return (RecommendedAction.OFFER_SMALL_DISCOUNT, 0.78,
                    "A coupon attempt signals price sensitivity and the discount guardrail allows a small offer.")
        return (RecommendedAction.NO_ACTION, 0.5,
                "No action: intent is sufficient, but there is no actionable hesitation signal.")

    @staticmethod
    def _response(
        session: ShopperSession,
        score: int,
        level: IntentLevel,
        hesitations: list[HesitationType],
        guardrail: GuardrailResult,
        action: RecommendedAction,
        confidence: float,
        reason: str,
    ) -> DecisionResponse:
        return DecisionResponse(
            session_id=session.session_id,
            intent_score=score,
            intent_level=level,
            hesitation_types=hesitations,
            recommended_action=action,
            guardrail=guardrail,
            confidence=confidence,
            reason=reason,
        )
