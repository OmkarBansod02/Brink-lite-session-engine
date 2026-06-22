# Brink Lite Session Engine

A small Python backend prototype that captures shopper events, maintains session memory, detects intent and hesitation, applies guardrails, and recommends the next best storefront action.

## Why I built this

I built this to understand the real-time backend loop behind self-improving ecommerce storefronts. The focus is not on cloning Brink, but on modeling the core decision flow:

`shopper event → session memory → intent/hesitation → guardrail → storefront action`

## What it demonstrates

- Real shopper events captured from a simple product page
- FastAPI backend event ingestion
- In-memory session timeline
- Intent scoring
- Hesitation detection
- Guardrails for discounts and interventions
- Recommended storefront action
- Product-page intervention banner
- Deterministic simulator for sample shopper journeys
- Backend tests for decision behavior

## Demo flow

`Start session → View return policy → Add to cart → Shopper hesitates in cart → Apply recommendation → Purchase`

## Tech stack

- Python
- FastAPI
- Pydantic
- Vanilla HTML/CSS/JS
- Pytest

## Run locally

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Open `http://127.0.0.1:8000`.

## Run tests

```bash
.venv/bin/python -m pytest
.venv/bin/python -m py_compile app/*.py
```

## Project structure

- `app/main.py` — FastAPI routes
- `app/decision_engine.py` — intent, hesitation, and guardrail logic
- `app/session_store.py` — in-memory session state
- `app/models.py` — Pydantic models
- `app/simulator.py` — sample shopper journeys
- `static/` — demo UI
- `tests/` — backend tests

## Note

The decision layer is intentionally deterministic and explainable. AI could be added later for copy generation, but guardrails and action decisions should stay controlled by backend logic.
