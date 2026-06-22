/* Brink Lite Session Engine — frontend controller */

const PRODUCT = {
  id: "premium-linen-shirt",
  cartValue: 2499,
  marginPct: 58,
};

const SUGGESTED_COPY = {
  show_return_reassurance:
    "Free 30-day returns. Try it at home and return easily if it does not feel right.",
  show_size_help:
    "Not sure about fit? Most shoppers choose their usual size, and exchanges are easy.",
  show_shipping_reassurance:
    "Fast shipping with clear delivery updates before checkout.",
  show_social_proof:
    "Popular choice this week. Shoppers who viewed this item often complete checkout.",
  show_value_proof:
    "Premium materials, easy returns, and support included — no discount needed yet.",
  offer_small_discount:
    "Still deciding? Here is 5% off to help you complete your order.",
  no_action: "",
};

const ACTION_LABELS = {
  show_return_reassurance: "Show return reassurance",
  show_size_help: "Show size help",
  show_shipping_reassurance: "Show shipping reassurance",
  show_social_proof: "Show social proof",
  show_value_proof: "Show value proof",
  offer_small_discount: "Offer small discount",
  no_action: "No action",
};

const HESITATION_LABELS = {
  returns_uncertainty: "Returns uncertainty",
  fit_uncertainty: "Fit uncertainty",
  shipping_uncertainty: "Shipping uncertainty",
  price_sensitivity: "Price sensitivity",
  checkout_hesitation: "Checkout hesitation",
};

const EVENT_LABELS = {
  product_view: "Product viewed",
  repeat_product_view: "Product viewed again",
  size_guide_open: "Size guide opened",
  return_policy_view: "Return policy viewed",
  shipping_info_view: "Shipping info viewed",
  add_to_cart: "Added to cart",
  cart_idle: "Cart idle",
  checkout_start: "Checkout started",
  coupon_attempt: "Coupon attempted",
  intervention_shown: "Intervention shown",
  offer_shown: "Offer shown",
  purchase: "Purchase completed",
  exit: "Session exited",
};

const PRIMARY_STEPS = [
  { label: "Start session",      eventType: "product_view",       step: 1 },
  { label: "View return policy", eventType: "return_policy_view", step: 2 },
  { label: "Add to cart",        eventType: "add_to_cart",        step: 3 },
  { label: "Simulate cart idle", eventType: "cart_idle",          step: 4 },
  { label: "Apply recommendation", eventType: null,              step: 5, isApply: true },
  { label: "Try coupon",         eventType: "coupon_attempt",     step: 6 },
  { label: "Purchase",           eventType: "purchase",           step: 7 },
];

const SECONDARY_ACTIONS = [
  { label: "View size guide",  eventType: "size_guide_open" },
  { label: "Check shipping",   eventType: "shipping_info_view" },
  { label: "Exit",             eventType: "exit" },
];

let timeline = [];
let latestDecision = null;
let completedSteps = new Set();
let interventionApplied = false;
let sessionTerminal = false;

/* ── Helpers ─────────────────────────────────────────── */

function formatAction(raw) {
  return ACTION_LABELS[raw] || raw.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatHesitations(types) {
  if (!types || types.length === 0) return "None detected";
  return types.map((t) => HESITATION_LABELS[t] || t).join(", ");
}

function formatGuardrail(g) {
  const tag = g.discount_allowed ? "Allowed" : "Blocked";
  return `${tag} — ${g.reason}`;
}

function shouldAct(decision) {
  return decision && decision.recommended_action !== "no_action";
}

function getSuggestedCopy(decision) {
  if (!decision) return "";
  return SUGGESTED_COPY[decision.recommended_action] || "";
}

function getSessionId() {
  let id = sessionStorage.getItem("brink_session_id");
  if (!id) {
    id = `session-${crypto.randomUUID()}`;
    sessionStorage.setItem("brink_session_id", id);
  }
  return id;
}

function newSessionId() {
  const id = `session-${crypto.randomUUID()}`;
  sessionStorage.setItem("brink_session_id", id);
  return id;
}

/* ── API ─────────────────────────────────────────────── */

async function apiPost(path, body) {
  const resp = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!resp.ok) throw new Error(`${path} → ${resp.status}: ${await resp.text()}`);
  return resp.json();
}

async function apiGet(path) {
  const resp = await fetch(path);
  if (!resp.ok) throw new Error(`${path} → ${resp.status}: ${await resp.text()}`);
  return resp.json();
}

/* ── Error display ───────────────────────────────────── */

function showError(msg) {
  document.getElementById("action-error").textContent = msg || "";
}

/* ── Disable / enable buttons ────────────────────────── */

function setButtonsDisabled(disabled) {
  document.querySelectorAll("#primary-buttons .btn, #secondary-buttons .btn").forEach((b) => {
    b.disabled = disabled;
  });
}

function applyTerminalState() {
  document.querySelectorAll("#primary-buttons .btn, #secondary-buttons .btn").forEach((b) => {
    if (b.id !== "btn-apply") {
      b.disabled = true;
    }
  });
  const applyBtn = document.getElementById("btn-apply");
  if (applyBtn) applyBtn.disabled = true;
}

/* ── Render: timeline ────────────────────────────────── */

function renderTimeline() {
  const list = document.getElementById("event-timeline");
  const empty = document.getElementById("timeline-empty");
  const scrollContainer = document.getElementById("timeline-scroll");

  if (timeline.length === 0) {
    list.innerHTML = "";
    empty.style.display = "";
    scrollContainer.style.display = "none";
    return;
  }
  empty.style.display = "none";
  scrollContainer.style.display = "block";

  list.innerHTML = timeline
    .map((entry, i) => {
      const cls = entry.isIntervention
        ? "step-intervention"
        : entry.isTerminal
        ? "step-terminal"
        : i === timeline.length - 1
        ? "step-active"
        : "";
      return `<li class="${cls}">
        <span class="step-label">${entry.label}</span>
        <span class="step-time">${entry.time}</span>
      </li>`;
    })
    .join("");

  scrollContainer.scrollTop = scrollContainer.scrollHeight;
}

/* ── Render: intent badge ────────────────────────────── */

function renderIntentBadge(level) {
  const badge = document.getElementById("intent-badge");
  if (!level) {
    badge.className = "intent-badge none";
    badge.textContent = "Intent: —";
    return;
  }
  const display = level.charAt(0).toUpperCase() + level.slice(1);
  badge.className = `intent-badge ${level}`;
  badge.textContent = `Intent: ${display}`;
}

/* ── Render: decision card ───────────────────────────── */

function renderDecision(decision) {
  latestDecision = decision;
  const act = shouldAct(decision);

  const statusEl = document.getElementById("decision-status");
  const statusLabel = document.getElementById("decision-status-label");
  statusEl.className = `decision-status-badge ${act ? "act" : "no-act"}`;
  statusLabel.textContent = act ? "Should act" : "No action";

  const actionEl = document.getElementById("decision-action");
  actionEl.textContent = formatAction(decision.recommended_action);
  actionEl.className = `decision-action-headline ${act ? "action-highlight" : ""}`;

  document.getElementById("decision-reason").textContent = decision.reason;

  document.getElementById("metric-intent-score").textContent = decision.intent_score;
  document.getElementById("metric-intent-level").textContent =
    decision.intent_level.charAt(0).toUpperCase() + decision.intent_level.slice(1);
  document.getElementById("metric-hesitation").textContent = formatHesitations(decision.hesitation_types);
  document.getElementById("metric-confidence").textContent = `${Math.round(decision.confidence * 100)}%`;
  document.getElementById("metric-guardrail").textContent = formatGuardrail(decision.guardrail);

  renderIntentBadge(decision.intent_level);

  const copySection = document.getElementById("decision-copy");
  const copy = getSuggestedCopy(decision);
  if (act && copy) {
    document.getElementById("decision-copy-text").textContent = `"${copy}"`;
    copySection.classList.add("visible");
  } else {
    copySection.classList.remove("visible");
  }

  updateApplyButton();
}

function resetDecisionCard() {
  latestDecision = null;
  const statusEl = document.getElementById("decision-status");
  statusEl.className = "decision-status-badge idle";
  document.getElementById("decision-status-label").textContent = "Waiting for events";
  document.getElementById("decision-action").textContent = "—";
  document.getElementById("decision-action").className = "decision-action-headline";
  document.getElementById("decision-reason").textContent =
    "Send a shopper event to see the backend decision.";
  ["metric-intent-score", "metric-intent-level", "metric-hesitation", "metric-confidence", "metric-guardrail"].forEach(
    (id) => { document.getElementById(id).textContent = "—"; }
  );
  document.getElementById("decision-copy").classList.remove("visible");
  renderIntentBadge(null);
}

/* ── Render: intervention banner on product card ─────── */

function showInterventionBanner(text) {
  const banner = document.getElementById("intervention-banner");
  document.getElementById("intervention-banner-text").textContent = text;
  banner.classList.add("visible");
}

function hideInterventionBanner() {
  document.getElementById("intervention-banner").classList.remove("visible");
}

/* ── Apply recommendation button state ───────────────── */

function updateApplyButton() {
  const btn = document.getElementById("btn-apply");
  if (!btn) return;

  const canApply =
    latestDecision &&
    shouldAct(latestDecision) &&
    getSuggestedCopy(latestDecision) &&
    !interventionApplied &&
    !sessionTerminal;

  btn.disabled = !canApply;
}

/* ── Core: send event ────────────────────────────────── */

async function sendEvent(eventType) {
  if (sessionTerminal) return;

  showError("");
  setButtonsDisabled(true);

  try {
    const decision = await apiPost("/events", {
      session_id: getSessionId(),
      event_type: eventType,
      product_id: PRODUCT.id,
      cart_value: PRODUCT.cartValue,
      margin_pct: PRODUCT.marginPct,
    });

    const isTerminalEvent = eventType === "purchase" || eventType === "exit";

    timeline.push({
      eventType,
      label: EVENT_LABELS[eventType] || eventType,
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
      isIntervention: eventType === "intervention_shown" || eventType === "offer_shown",
      isTerminal: isTerminalEvent,
    });
    renderTimeline();
    renderDecision(decision);

    if (isTerminalEvent) {
      sessionTerminal = true;
      applyTerminalState();
    }
  } catch (err) {
    showError(err.message);
  } finally {
    if (!sessionTerminal) setButtonsDisabled(false);
  }
}

/* ── Apply recommendation handler ────────────────────── */

async function handleApplyRecommendation() {
  if (!latestDecision || !shouldAct(latestDecision)) return;
  if (sessionTerminal) return;

  const savedCopy = getSuggestedCopy(latestDecision);
  const savedAction = latestDecision.recommended_action;

  if (!savedCopy) return;

  showError("");
  setButtonsDisabled(true);

  try {
    const decision = await apiPost("/events", {
      session_id: getSessionId(),
      event_type: "intervention_shown",
      product_id: PRODUCT.id,
      cart_value: PRODUCT.cartValue,
      margin_pct: PRODUCT.marginPct,
    });

    timeline.push({
      eventType: "intervention_shown",
      label: "Intervention shown",
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
      isIntervention: true,
    });

    showInterventionBanner(savedCopy);
    interventionApplied = true;

    if (savedAction === "offer_small_discount") {
      const offerDecision = await apiPost("/events", {
        session_id: getSessionId(),
        event_type: "offer_shown",
        product_id: PRODUCT.id,
        cart_value: PRODUCT.cartValue,
        margin_pct: PRODUCT.marginPct,
      });

      timeline.push({
        eventType: "offer_shown",
        label: "Offer shown",
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
        isIntervention: true,
      });

      renderTimeline();
      renderDecision(offerDecision);
    } else {
      renderTimeline();
      renderDecision(decision);
    }

    markStepDone(5);
  } catch (err) {
    showError(err.message);
  } finally {
    setButtonsDisabled(false);
  }
}

/* ── Build scenario buttons ──────────────────────────── */

function markStepDone(stepNum) {
  completedSteps.add(stepNum);
  const btn = document.querySelector(`[data-step="${stepNum}"]`);
  if (btn) btn.classList.add("done");
}

function buildButtons() {
  const primaryContainer = document.getElementById("primary-buttons");
  const secondaryContainer = document.getElementById("secondary-buttons");

  PRIMARY_STEPS.forEach((step) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.setAttribute("data-step", step.step);

    if (step.isApply) {
      btn.className = "btn btn-apply";
      btn.id = "btn-apply";
      btn.disabled = true;
      btn.innerHTML = `<span class="scenario-step-number">${step.step}</span>${step.label}`;
      btn.addEventListener("click", handleApplyRecommendation);
    } else {
      btn.className = "btn btn-step";
      btn.innerHTML = `<span class="scenario-step-number">${step.step}</span>${step.label}`;
      btn.addEventListener("click", async () => {
        await sendEvent(step.eventType);
        markStepDone(step.step);
      });
    }

    primaryContainer.appendChild(btn);
  });

  SECONDARY_ACTIONS.forEach(({ label, eventType }) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn btn-secondary-action";
    btn.textContent = label;
    btn.addEventListener("click", async () => {
      await sendEvent(eventType);
    });
    secondaryContainer.appendChild(btn);
  });
}

/* ── Demo controls ───────────────────────────────────── */

async function handleReset() {
  showError("");
  try {
    await apiPost("/reset");
    timeline = [];
    completedSteps.clear();
    interventionApplied = false;
    sessionTerminal = false;
    latestDecision = null;
    newSessionId();
    renderTimeline();
    resetDecisionCard();
    hideInterventionBanner();
    document.getElementById("simulation-panel").classList.remove("visible");
    document.getElementById("metrics-panel").classList.remove("visible");

    document.querySelectorAll(".btn-step").forEach((b) => {
      b.classList.remove("done");
      b.disabled = false;
    });
    document.querySelectorAll(".btn-secondary-action").forEach((b) => {
      b.disabled = false;
    });
    updateApplyButton();
  } catch (err) {
    showError(err.message);
  }
}

async function handleSimulate() {
  showError("");
  try {
    const results = await apiPost("/simulate");
    const panel = document.getElementById("simulation-panel");
    panel.classList.add("visible");

    panel.innerHTML =
      `<p class="card-label">Simulation results</p>` +
      results
        .map((item) => {
          const d = item.final_decision;
          const act = shouldAct(d);
          const copy = getSuggestedCopy(d);
          const events = (item.event_timeline || [])
            .map((e) => EVENT_LABELS[e.event_type] || e.event_type)
            .join(" → ");
          return `<article class="simulation-item">
            <h3>${item.simulation_name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</h3>
            <p>Events: ${events}</p>
            <p class="sim-action">${act ? "Should act" : "No action"} — ${formatAction(d.recommended_action)}</p>
            <p>${d.reason}</p>
            ${copy ? `<p><em>"${copy}"</em></p>` : ""}
          </article>`;
        })
        .join("");
  } catch (err) {
    showError(err.message);
  }
}

async function handleMetrics() {
  showError("");
  try {
    const m = await apiGet("/metrics");
    const panel = document.getElementById("metrics-panel");
    panel.classList.add("visible");

    const boxes = [
      { name: "Total sessions", value: m.total_sessions },
      { name: "Total events", value: m.total_events },
      { name: "Actions recommended", value: m.actions_recommended },
      { name: "Discounts blocked", value: m.discounts_blocked },
      { name: "Purchases", value: m.purchases },
      { name: "Exits", value: m.exits },
    ];

    const actionItems = Object.entries(m.action_type_counts || {})
      .map(([k, v]) => `<li>${formatAction(k)}: ${v}</li>`)
      .join("");
    const hesiItems = Object.entries(m.hesitation_reason_counts || {})
      .map(([k, v]) => `<li>${HESITATION_LABELS[k] || k}: ${v}</li>`)
      .join("");

    panel.innerHTML = `
      <p class="card-label">Backend metrics</p>
      <div class="metrics-grid">
        ${boxes.map((b) => `<div class="metric-box"><span class="value">${b.value}</span><span class="name">${b.name}</span></div>`).join("")}
      </div>
      <div class="metrics-subsection">
        <h4>Action types</h4>
        <ul>${actionItems || "<li>None</li>"}</ul>
      </div>
      <div class="metrics-subsection">
        <h4>Hesitation reasons</h4>
        <ul>${hesiItems || "<li>None</li>"}</ul>
      </div>`;
  } catch (err) {
    showError(err.message);
  }
}

/* ── Init ────────────────────────────────────────────── */

function init() {
  getSessionId();
  buildButtons();
  document.getElementById("btn-reset").addEventListener("click", handleReset);
  document.getElementById("btn-simulate").addEventListener("click", handleSimulate);
  document.getElementById("btn-metrics").addEventListener("click", handleMetrics);
}

init();
