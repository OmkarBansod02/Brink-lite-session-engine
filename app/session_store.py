"""In-memory shopper session storage."""

from app.models import EventType, ShopperEvent, ShopperSession


class SessionStore:
    def __init__(self) -> None:
        self._sessions: dict[str, ShopperSession] = {}

    def get_or_create_session(self, session_id: str) -> ShopperSession:
        if session_id not in self._sessions:
            self._sessions[session_id] = ShopperSession(session_id=session_id)
        return self._sessions[session_id]

    def add_event(self, event: ShopperEvent) -> ShopperSession:
        session = self.get_or_create_session(event.session_id)
        session.events.append(event)

        if event.product_id is not None:
            session.product_id = event.product_id
        if event.cart_value is not None:
            session.cart_value = event.cart_value
        if event.margin_pct is not None:
            session.margin_pct = event.margin_pct
        if event.event_type == EventType.PURCHASE:
            session.purchased = True
        elif event.event_type == EventType.EXIT:
            session.exited = True

        return session

    def get_session(self, session_id: str) -> ShopperSession | None:
        return self._sessions.get(session_id)

    def list_sessions(self) -> list[ShopperSession]:
        return list(self._sessions.values())

    def reset(self) -> None:
        self._sessions.clear()
