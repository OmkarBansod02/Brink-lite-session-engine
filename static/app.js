const PRODUCT = {
  id: "premium-linen-shirt",
  cartValue: 2499,
  marginPct: 58,
};

const ACTIONS = [
  { label: "View Product", eventType: "product_view" },
  { label: "View Size Guide", eventType: "size_guide_open" },
  { label: "View Return Policy", eventType: "return_policy_view" },
  { label: "Check Shipping", eventType: "shipping_info_view" },
  { label: "Add to Cart", eventType: "add_to_cart" },
  { label: "Try Coupon", eventType: "coupon_attempt" },
  { label: "Checkout", eventType: "checkout_start" },
  { label: "Simulate Cart Idle", eventType: "cart_idle" },
  { label: "Purchase", eventType: "purchase" },
  { label: "Exit", eventType: "exit" },
];

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

const timeline = [];

function humanize(value) {
  return value
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
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

function shouldAct(decision) {
  return decision.recommended_action !== "no_action";
}

function suggestedCopy(decision) {
  return SUGGESTED_COPY[decision.recommended_action] || "";
}

function formatHesitation(types) {
  if (!types || types.length === 0) {
    return "None detected";
  }
  return types.map(humanize).join(", ");
}

function formatGuardrail(guardrail) {
  const status = guardrail.discount_allowed ? "Discount allowed" : "Discount blocked";
  return `${status} — ${guardrail.reason}`;
}

async function apiPost(path, body) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`${path} failed (${response.status}): ${detail}`);
  }
  return response.json();
}

async function apiGet(path) {
  const response = await fetch(path);
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`${path} failed (${response.status}): ${detail}`);
  }
  return response.json();
}

function setActionError(message) {
  const el = document.getElementById("action-error");
  if (!message) {
    el.textContent = "";
    el.classList.add("hidden");
    return;
  }
  el.textContent = message;
  el.classList.remove("hidden");
}

function renderDecision(decision) {
  const act = shouldAct(decision);
  const statusEl = document.getElementById("decision-status");
  const statusLabel = document.getElementById("decision-status-label");

  statusEl.className = `decision-status ${act ? "act" : "no-act"}`;
  statusLabel.textContent = act ? "Should act" : "No action";

  document.getElementById("decision-action").textContent = humanize(
    decision.recommended_action
  );
  document.getElementById("decision-reason").textContent = decision.reason;

  const copy = suggestedCopy(decision);
  const banner = document.getElementById("copy-banner");
  const bannerText = document.getElementById("copy-banner-text");
  if (act && copy) {
    bannerText.textContent = copy;
    banner.classList.remove("hidden");
  } else {
    banner.classList.add("hidden");
  }

  document.getElementById("metric-intent-score").textContent = decision.intent_score;
  document.getElementById("metric-intent-level").textContent = humanize(
    decision.intent_level
  );
  document.getElementById("metric-hesitation").textContent = formatHesitation(
    decision.hesitation_types
  );
  document.getElementById("metric-confidence").textContent = `${Math.round(
    decision.confidence * 100
  )}%`;
  document.getElementById("metric-guardrail").textContent = formatGuardrail(
    decision.guardrail
  );
}

function renderTimeline() {
  const list = document.getElementById("event-timeline");
  if (timeline.length === 0) {
    list.innerHTML = '<li class="timeline-empty">No events yet.</li>';
    return;
  }

  list.innerHTML = timeline
    .map(
      (entry) =>
        `<li><time>${entry.time}</time><strong>${humanize(entry.eventType)}</strong></li>`
    )
    .join("");
}

function resetDecisionCard() {
  const statusEl = document.getElementById("decision-status");
  statusEl.className = "decision-status idle";
  document.getElementById("decision-status-label").textContent =
    "Waiting for first event";
  document.getElementById("decision-action").textContent = "—";
  document.getElementById("decision-reason").textContent =
    "Click a shopper action to see the backend decision.";
  document.getElementById("copy-banner").classList.add("hidden");
  ["metric-intent-score", "metric-intent-level", "metric-hesitation", "metric-confidence", "metric-guardrail"].forEach(
    (id) => {
      document.getElementById(id).textContent = "—";
    }
  );
}

function updateSessionDisplay() {
  document.getElementById("session-id-display").textContent = getSessionId();
}

async function sendEvent(eventType, label) {
  setActionError("");
  const buttons = document.querySelectorAll(".btn-action");
  buttons.forEach((btn) => {
    btn.disabled = true;
  });

  try {
    const decision = await apiPost("/events", {
      session_id: getSessionId(),
      event_type: eventType,
      product_id: PRODUCT.id,
      cart_value: PRODUCT.cartValue,
      margin_pct: PRODUCT.marginPct,
    });

    timeline.push({
      eventType,
      label,
      time: new Date().toLocaleTimeString(),
    });
    renderTimeline();
    renderDecision(decision);
  } catch (error) {
    setActionError(error.message);
  } finally {
    buttons.forEach((btn) => {
      btn.disabled = false;
    });
  }
}

function renderSimulationResults(results) {
  const panel = document.getElementById("simulation-results");
  panel.classList.remove("hidden");
  panel.innerHTML =
    "<p class='product-label'>Simulation results</p>" +
    results
      .map((item) => {
        const decision = item.final_decision;
        const act = shouldAct(decision);
        const copy = suggestedCopy(decision);
        const events = (item.event_timeline || [])
          .map((event) => humanize(event.event_type))
          .join(" → ");
        return `
          <article class="simulation-item">
            <h3>${humanize(item.simulation_name)}</h3>
            <p>Session: <code>${item.session_id}</code></p>
            <p>Events: ${events}</p>
            <p class="sim-action">${act ? "Should act" : "No action"} — ${humanize(decision.recommended_action)}</p>
            <p>${decision.reason}</p>
            ${copy ? `<p><em>"${copy}"</em></p>` : ""}
          </article>
        `;
      })
      .join("");
}

function renderMetrics(metrics) {
  const panel = document.getElementById("metrics-panel");
  panel.classList.remove("hidden");

  const boxes = [
    { name: "Total sessions", value: metrics.total_sessions },
    { name: "Total events", value: metrics.total_events },
    { name: "Actions recommended", value: metrics.actions_recommended },
    { name: "Discounts blocked", value: metrics.discounts_blocked },
    { name: "Purchases", value: metrics.purchases },
    { name: "Exits", value: metrics.exits },
  ];

  const actionCounts = Object.entries(metrics.action_type_counts || {})
    .map(([key, count]) => `<li>${humanize(key)}: ${count}</li>`)
    .join("");
  const hesitationCounts = Object.entries(metrics.hesitation_reason_counts || {})
    .map(([key, count]) => `<li>${humanize(key)}: ${count}</li>`)
    .join("");

  panel.innerHTML = `
    <p class="product-label">Backend metrics</p>
    <div class="metrics-grid">
      ${boxes
        .map(
          (box) => `
        <div class="metric-box">
          <span class="value">${box.value}</span>
          <span class="name">${box.name}</span>
        </div>`
        )
        .join("")}
    </div>
    <div class="metrics-subsection">
      <h4>Action types</h4>
      <ul>${actionCounts || "<li>None</li>"}</ul>
    </div>
    <div class="metrics-subsection">
      <h4>Hesitation reasons</h4>
      <ul>${hesitationCounts || "<li>None</li>"}</ul>
    </div>
  `;
}

function buildActionButtons() {
  const container = document.getElementById("action-buttons");
  ACTIONS.forEach(({ label, eventType }) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn btn-action";
    button.textContent = label;
    button.addEventListener("click", () => sendEvent(eventType, label));
    container.appendChild(button);
  });
}

async function handleReset() {
  setActionError("");
  try {
    await apiPost("/reset");
    timeline.length = 0;
    newSessionId();
    updateSessionDisplay();
    renderTimeline();
    resetDecisionCard();
    document.getElementById("simulation-results").classList.add("hidden");
    document.getElementById("metrics-panel").classList.add("hidden");
  } catch (error) {
    setActionError(error.message);
  }
}

async function handleSimulate() {
  setActionError("");
  try {
    const results = await apiPost("/simulate");
    timeline.length = 0;
    renderTimeline();
    resetDecisionCard();
    renderSimulationResults(results);
    document.getElementById("metrics-panel").classList.add("hidden");
  } catch (error) {
    setActionError(error.message);
  }
}

async function handleMetrics() {
  setActionError("");
  try {
    const metrics = await apiGet("/metrics");
    renderMetrics(metrics);
  } catch (error) {
    setActionError(error.message);
  }
}

function init() {
  updateSessionDisplay();
  buildActionButtons();
  document.getElementById("btn-reset").addEventListener("click", handleReset);
  document.getElementById("btn-simulate").addEventListener("click", handleSimulate);
  document.getElementById("btn-metrics").addEventListener("click", handleMetrics);
}

init();
