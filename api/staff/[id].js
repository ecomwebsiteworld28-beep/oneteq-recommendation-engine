// ONETEQ Staff Agreed Plan Page
// Password-gated. Stage 2 of the staff page: rebuilt around the engine's
// three tiers (Essential/Recommended/VIP, from result.tieredPackages) as
// loadable presets, edited down into a single "Agreed Plan" - the actual
// client-facing quote - rather than a flat 27-item checklist. See the
// COMPONENTS registry below for how each control maps onto v3Catalogue.

const crypto = require('crypto');
const { v3Catalogue, getPhysioPricing, calculateV3PackageTotal } = require('../../index.js');
const {
  GHL_CUSTOM_FIELD_IDS,
  GHL_CUSTOM_FIELD_KEYS,
  getGhlContact,
  getCustomFieldValue,
  updateGhlContactCustomFields,
} = require('../../lib/ghl.js');
const { escapeHtml, renderPage, renderRadarChart } = require('../../lib/html.js');

// Membership tiers and ongoing coaching are what qualify a client for
// getPhysioPricing()'s discounted physio price — matches the rule already
// defined in index.js (MEMBERSHIP_OR_ONGOING_COACHING_IDS).
const MEMBERSHIP_OR_COACHING_KEYS = new Set([
  'bronze_membership',
  'silver_membership',
  'gold_membership',
  'platinum_membership',
  'unlimited_membership',
  'coaching_1x_week',
  'coaching_2x_week',
]);

// ===== SECTION 16 COMPONENT REGISTRY =====
// Declarative definition of every control the Agreed Plan exposes, grouped
// exactly as section 16 describes them. Both the page render and the
// save-side price recomputation walk this same registry, so there's one
// place that says "what does this control map to in v3Catalogue."

const MEMBERSHIP_OPTIONS = [
  { key: 'none', label: 'None' },
  { key: 'bronze_membership', label: 'Bronze - 4 sessions/month' },
  { key: 'silver_membership', label: 'Silver - 8 sessions/month' },
  { key: 'gold_membership', label: 'Gold - 12 sessions/month' },
  { key: 'platinum_membership', label: 'Platinum - 16 sessions/month' },
  { key: 'unlimited_membership', label: 'Unlimited' },
];

const COACHING_FREQUENCY_OPTIONS = [
  { key: 'none', label: 'None' },
  { key: 'payg_1to1', label: 'PAYG — single session' },
  { key: 'coaching_technical_programming', label: 'Technical + Programming session' },
  { key: 'coaching_1x_week', label: '1x per week (recurring)' },
  { key: 'coaching_2x_week', label: '2x per week (recurring)' },
];

const NUTRITION_LEVEL_OPTIONS = [
  { key: 'none', label: 'None' },
  { key: 'nutrition_app_support', label: 'App Support' },
  { key: 'nutrition_essentials', label: 'Essentials' },
  { key: 'nutrition_transform', label: 'Transform' },
  { key: 'nutrition_full_platter', label: 'Full Platter' },
];

const NUTRITION_ADDON_KEYS = ['nutrition_followup', 'nutrition_family', 'nutrition_high_performance'];

// "toggle" components are a plain add/remove decision against one
// v3Catalogue product id, with only the shared accepted/declined/deferred
// + If Desired state — no sub-choice of their own.
const COMPONENTS = [
  { id: 'membership', group: 'Membership', label: 'Membership', kind: 'membership' },
  // Split into two independently-tracked products rather than one
  // "coaching" component sharing a single status — initial_assessment and
  // the chosen frequency are separate v3Catalogue products that can have
  // different origins within the same tier (e.g. VIP for a HIGH-band
  // client = an inherited initial_assessment + a VIP-only
  // coaching_2x_week upgrade). A shared status meant loading VIP deferred
  // the inherited assessment too, just because it shared a row with the
  // VIP-only upgrade — a staff member shouldn't have to notice that to
  // avoid quietly losing the initial assessment.
  { id: 'coachingInitial', group: '1:1 Coaching', label: 'Initial Assessment', kind: 'toggle', productKey: 'initial_assessment' },
  { id: 'coachingFrequency', group: '1:1 Coaching', label: 'Ongoing Coaching', kind: 'frequency', options: COACHING_FREQUENCY_OPTIONS },
  { id: 'nutrition', group: 'Nutrition', label: 'Nutrition', kind: 'nutrition' },
  // Singled out from Physio's other products (below, under Optional
  // Extras) because this is the one section 16 calls out for its own
  // firm accepted/declined/deferred decision — it's sometimes an
  // ESSENTIAL_PREREQUISITE, not just an optional add-on.
  { id: 'clinical', group: 'Clinical', label: 'Initial Physio Assessment', kind: 'toggle', productKey: 'physio_initial' },
  // OPEN QUESTION FOR THE CLIENT (flagged 2026-09-05): sports_massage is a
  // single flat one-off product in v3Catalogue — there is no recurring
  // recovery product. "Frequency" here is a quantity multiplier on that
  // one-off price (e.g. 2 sessions = 2x the price), NOT a recurring
  // monthly line. If ongoing/recurring recovery support is what's
  // actually wanted, that needs a new catalogue product and a price from
  // the client — this control can't invent one.
  { id: 'recovery', group: 'Recovery', label: 'Sports Massage (45 min)', kind: 'recovery', productKey: 'sports_massage' },
  // OPEN QUESTION FOR THE CLIENT (flagged 2026-09-05): section 16 lists
  // "Body Composition" as its own testing control, but v3Catalogue has no
  // separate body-composition product — the engine (Stage 1) already
  // treats deep_dive as the body-composition test (see
  // determineBodyCompositionService/ANCILLARY_SERVICE_TO_PRODUCT_ID in
  // index.js). Shown as one combined control using deep_dive rather than
  // inventing a second catalogue item; confirm with the client whether
  // these should ever actually be split into two products.
  { id: 'vo2', group: 'Testing', label: 'VO2 / Metabolic', kind: 'toggle', productKey: 'vo2_metabolic' },
  { id: 'deepDive', group: 'Testing', label: 'Deep Dive / Body Composition', kind: 'toggle', productKey: 'deep_dive' },
  { id: 'endurance', group: 'Testing', label: 'Endurance Metabolic', kind: 'toggle', productKey: 'endurance_metabolic' },
  { id: 'rmr', group: 'Testing', label: 'RMR', kind: 'toggle', productKey: 'rmr_test' },
  // Optional Extras — everything in v3Catalogue not already addressable
  // above. payg_1to1 is deliberately NOT here; it's one of the Coaching
  // frequency options instead, so it isn't represented twice.
  { id: 'physioFollowup', group: 'Optional Extras', label: 'Physio Follow-up', kind: 'toggle', productKey: 'physio_followup' },
  { id: 'directorConsultation', group: 'Optional Extras', label: 'Director Consultation', kind: 'toggle', productKey: 'director_consultation' },
  { id: 'progressCheckin', group: 'Optional Extras', label: 'Progress Check-in', kind: 'toggle', productKey: 'progress_checkin' },
];

const COMPONENTS_BY_ID = COMPONENTS.reduce((acc, c) => {
  acc[c.id] = c;
  return acc;
}, {});

// Every component id whose only state is accepted/declined/deferred + If
// Desired against a single fixed product id (i.e. everything except
// membership/coachingFrequency/nutrition/recovery, which each have their
// own sub-choice). coachingInitial is a toggle like any other — it's the
// coachingFrequency selector that carries the "which product" choice.
const TOGGLE_COMPONENT_IDS = COMPONENTS.filter((c) => c.kind === 'toggle').map((c) => c.id);
const FREQUENCY_COMPONENT_IDS = COMPONENTS.filter((c) => c.kind === 'frequency').map((c) => c.id);

const GROUP_ORDER = ['Membership', '1:1 Coaching', 'Nutrition', 'Clinical', 'Recovery', 'Testing', 'Optional Extras'];

function sessionToken() {
  return crypto.createHash('sha256').update(String(process.env.STAFF_PAGE_PASSWORD || '')).digest('hex');
}

function parseCookies(req) {
  const header = req.headers.cookie || '';
  const cookies = {};
  header.split(';').forEach((pair) => {
    const idx = pair.indexOf('=');
    if (idx === -1) return;
    const key = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    if (key) cookies[key] = decodeURIComponent(value);
  });
  return cookies;
}

function isAuthed(req) {
  const cookies = req.cookies || parseCookies(req);
  return Boolean(process.env.STAFF_PAGE_PASSWORD) && cookies.staff_session === sessionToken();
}

// ===== TIER -> COMPONENT STATE =====
// Turns one of the engine's tiers (result.tieredPackages.essential/
// recommended/vip — each a flat lineItems list with productId, and
// vipType/vipLabel on VIP-only additions) into the full per-component
// state the Agreed Plan form uses. Used to build the three loadable
// presets server-side once per page render.

function lineItemsByProductId(tier) {
  const map = {};
  (tier.lineItems || []).forEach((item) => {
    map[item.productId] = item;
  });
  return map;
}

// A component is "accepted" if the tier includes it at all, "deferred" if
// every product it contributes is a VIP-only addition (vipType set) —
// i.e. something the AI proposed as an enhancement/preference rather than
// the tier's own baseline — and "declined" if the tier doesn't include it.
// This can mark a component deferred even when part of its contribution
// is an inherited baseline item (e.g. VIP's coaching = an inherited
// initial_assessment + a VIP-only coaching_2x_week upgrade) — loading a
// tier is a starting point for staff to review, and treating anything
// with an unagreed addition as "pending" is safer than silently accepting
// it outright.
function deriveComponentStatus(byId, productKeys) {
  let hasAny = false;
  let hasVipOnly = false;
  productKeys.forEach((key) => {
    const item = byId[key];
    if (!item) return;
    hasAny = true;
    if (item.vipType) hasVipOnly = true;
  });
  if (!hasAny) return 'declined';
  return hasVipOnly ? 'deferred' : 'accepted';
}

function buildComponentsFromTier(tier) {
  const byId = lineItemsByProductId(tier);
  const has = (key) => Boolean(byId[key]);
  const isIfDesired = (key) => Boolean(byId[key]) && byId[key].vipLabel === 'If Desired';

  const membershipLevel =
    MEMBERSHIP_OPTIONS.map((o) => o.key).find((key) => key !== 'none' && has(key)) || 'none';
  const coachingFrequencyValue =
    COACHING_FREQUENCY_OPTIONS.map((o) => o.key).find((key) => key !== 'none' && has(key)) || 'none';
  const nutritionLevel =
    NUTRITION_LEVEL_OPTIONS.map((o) => o.key).find((key) => key !== 'none' && has(key)) || 'none';

  const components = {
    membership: {
      status: deriveComponentStatus(byId, membershipLevel === 'none' ? [] : [membershipLevel]),
      level: membershipLevel,
      ifDesired: membershipLevel !== 'none' && isIfDesired(membershipLevel),
    },
    // coachingInitial (initial_assessment) is handled by the generic
    // toggle loop below — its status depends only on itself now, not on
    // whatever frequency happens to be chosen alongside it.
    coachingFrequency: {
      status: deriveComponentStatus(byId, coachingFrequencyValue === 'none' ? [] : [coachingFrequencyValue]),
      value: coachingFrequencyValue,
      ifDesired: coachingFrequencyValue !== 'none' && isIfDesired(coachingFrequencyValue),
    },
    nutrition: {
      status: deriveComponentStatus(byId, [
        ...(nutritionLevel !== 'none' ? [nutritionLevel] : []),
        ...NUTRITION_ADDON_KEYS.filter(has),
      ]),
      level: nutritionLevel,
      addons: NUTRITION_ADDON_KEYS.reduce((acc, key) => {
        acc[key] = has(key);
        return acc;
      }, {}),
      ifDesired:
        (nutritionLevel !== 'none' && isIfDesired(nutritionLevel)) ||
        NUTRITION_ADDON_KEYS.some((key) => has(key) && isIfDesired(key)),
    },
    recovery: {
      status: deriveComponentStatus(byId, ['sports_massage']),
      quantity: 1, // the engine never suggests a quantity — always starts at 1
      ifDesired: isIfDesired('sports_massage'),
    },
  };

  TOGGLE_COMPONENT_IDS.forEach((id) => {
    const productKey = COMPONENTS_BY_ID[id].productKey;
    components[id] = {
      status: deriveComponentStatus(byId, [productKey]),
      ifDesired: isIfDesired(productKey),
    };
  });

  return components;
}

// ===== COMPONENT STATE -> PRODUCT IDS / PRICING =====
// The save-side mirror of buildComponentsFromTier: given a (sanitized)
// component state, which v3Catalogue product ids does the *accepted* set
// resolve to. This is the only thing ever priced server-side — nothing
// about price is ever taken from the client.

function expandComponentsToProductIds(components) {
  const ids = [];

  if (components.membership.status === 'accepted' && components.membership.level !== 'none') {
    ids.push(components.membership.level);
  }

  // coachingInitial (initial_assessment) is priced by the generic toggle
  // loop below, independently of whatever frequency is chosen.
  if (components.coachingFrequency.status === 'accepted' && components.coachingFrequency.value !== 'none') {
    ids.push(components.coachingFrequency.value);
  }

  if (components.nutrition.status === 'accepted') {
    if (components.nutrition.level !== 'none') ids.push(components.nutrition.level);
    NUTRITION_ADDON_KEYS.forEach((key) => {
      if (components.nutrition.addons[key]) ids.push(key);
    });
  }

  if (components.recovery.status === 'accepted') {
    // Quantity is represented as repeated line items (calculateV3PackageTotal
    // has no quantity concept) — e.g. quantity 2 pushes "sports_massage"
    // twice, so the total and Final_Package_Item_Keys both reflect 2
    // sessions rather than 1.
    for (let i = 0; i < components.recovery.quantity; i++) ids.push('sports_massage');
  }

  TOGGLE_COMPONENT_IDS.forEach((id) => {
    if (components[id].status === 'accepted') ids.push(COMPONENTS_BY_ID[id].productKey);
  });

  return ids;
}

// Never trust the shape or values of a client payload — every field is
// checked against a known-good list/type here, with a safe default for
// anything missing or invalid, before it's used for pricing or saved.
function sanitizeComponentState(raw) {
  raw = raw && typeof raw === 'object' ? raw : {};

  const status = (value) => (['accepted', 'declined', 'deferred'].includes(value) ? value : 'declined');
  const bool = (value) => Boolean(value);
  const oneOf = (value, options, fallback) => (options.includes(value) ? value : fallback);
  const clampQuantity = (value) => {
    const n = parseInt(value, 10);
    if (!Number.isFinite(n) || n < 1) return 1;
    return Math.min(n, 10);
  };
  const sanitizeToggle = (value) => {
    value = value && typeof value === 'object' ? value : {};
    return { status: status(value.status), ifDesired: bool(value.ifDesired) };
  };

  const membershipKeys = MEMBERSHIP_OPTIONS.map((o) => o.key);
  const frequencyKeys = COACHING_FREQUENCY_OPTIONS.map((o) => o.key);
  const nutritionLevelKeys = NUTRITION_LEVEL_OPTIONS.map((o) => o.key);

  const membershipRaw = (raw.membership && typeof raw.membership === 'object') ? raw.membership : {};
  const coachingFrequencyRaw = (raw.coachingFrequency && typeof raw.coachingFrequency === 'object') ? raw.coachingFrequency : {};
  const nutritionRaw = (raw.nutrition && typeof raw.nutrition === 'object') ? raw.nutrition : {};
  const recoveryRaw = (raw.recovery && typeof raw.recovery === 'object') ? raw.recovery : {};
  const nutritionAddonsRaw = (nutritionRaw.addons && typeof nutritionRaw.addons === 'object') ? nutritionRaw.addons : {};

  const components = {
    membership: {
      status: status(membershipRaw.status),
      level: oneOf(membershipRaw.level, membershipKeys, 'none'),
      ifDesired: bool(membershipRaw.ifDesired),
    },
    // coachingInitial is sanitized generically below, alongside the other
    // toggle components.
    coachingFrequency: {
      status: status(coachingFrequencyRaw.status),
      value: oneOf(coachingFrequencyRaw.value, frequencyKeys, 'none'),
      ifDesired: bool(coachingFrequencyRaw.ifDesired),
    },
    nutrition: {
      status: status(nutritionRaw.status),
      level: oneOf(nutritionRaw.level, nutritionLevelKeys, 'none'),
      addons: NUTRITION_ADDON_KEYS.reduce((acc, key) => {
        acc[key] = bool(nutritionAddonsRaw[key]);
        return acc;
      }, {}),
      ifDesired: bool(nutritionRaw.ifDesired),
    },
    recovery: {
      status: status(recoveryRaw.status),
      quantity: clampQuantity(recoveryRaw.quantity),
      ifDesired: bool(recoveryRaw.ifDesired),
    },
  };

  TOGGLE_COMPONENT_IDS.forEach((id) => {
    components[id] = sanitizeToggle(raw[id]);
  });

  return components;
}

// ===== RENDERING =====

function optionsHtml(options, selectedKey) {
  return options
    .map(
      (o) =>
        `<option value="${escapeHtml(o.key)}"${o.key === selectedKey ? ' selected' : ''}>${escapeHtml(o.label)}</option>`,
    )
    .join('');
}

function renderTriState(componentId, status) {
  const states = [
    { key: 'accepted', label: 'Accept' },
    { key: 'declined', label: 'Decline' },
    { key: 'deferred', label: 'Defer' },
  ];
  return `
    <div class="tri-state" data-tri-state="${escapeHtml(componentId)}">
      ${states
        .map(
          (s) => `
        <button type="button" class="tri-state-btn tri-state-${escapeHtml(s.key)}${s.key === status ? ' active' : ''}"
          data-status="${escapeHtml(s.key)}">${escapeHtml(s.label)}</button>`,
        )
        .join('')}
    </div>`;
}

function renderIfDesired(componentId, ifDesired) {
  return `
    <label class="if-desired">
      <input type="checkbox" data-if-desired="${escapeHtml(componentId)}" ${ifDesired ? 'checked' : ''} />
      If Desired
    </label>`;
}

function renderComponentRow(def, state) {
  let controlsHtml = '';

  if (def.kind === 'membership') {
    controlsHtml = `<select data-membership-level>${optionsHtml(MEMBERSHIP_OPTIONS, state.level)}</select>`;
  } else if (def.kind === 'frequency') {
    controlsHtml = `<select data-frequency-value="${escapeHtml(def.id)}">${optionsHtml(def.options, state.value)}</select>`;
  } else if (def.kind === 'nutrition') {
    controlsHtml = `
      <select data-nutrition-level>${optionsHtml(NUTRITION_LEVEL_OPTIONS, state.level)}</select>
      <div class="nutrition-addons">
        <label class="inline-check"><input type="checkbox" data-nutrition-addon="nutrition_followup" ${state.addons.nutrition_followup ? 'checked' : ''} /> Follow-up</label>
        <label class="inline-check"><input type="checkbox" data-nutrition-addon="nutrition_family" ${state.addons.nutrition_family ? 'checked' : ''} /> Family Package</label>
        <label class="inline-check"><input type="checkbox" data-nutrition-addon="nutrition_high_performance" ${state.addons.nutrition_high_performance ? 'checked' : ''} /> High Performance</label>
      </div>`;
  } else if (def.kind === 'recovery') {
    controlsHtml = `
      <label class="inline-check">Sessions:
        <input type="number" min="1" max="10" data-recovery-quantity value="${escapeHtml(state.quantity)}" style="width: 56px;" />
      </label>`;
  }
  // 'toggle' kind has no sub-control beyond the tri-state itself.

  return `
    <div class="component-row" data-component="${escapeHtml(def.id)}">
      <div class="component-label">${escapeHtml(def.label)}</div>
      <div class="component-controls">${controlsHtml}</div>
      ${renderTriState(def.id, state.status)}
      ${renderIfDesired(def.id, state.ifDesired)}
    </div>`;
}

function renderComponentGroups(components) {
  return GROUP_ORDER.map((group) => {
    const defs = COMPONENTS.filter((c) => c.group === group);
    const rows = defs.map((def) => renderComponentRow(def, components[def.id])).join('');
    return `
      <div class="component-group">
        <h3>${escapeHtml(group)}</h3>
        ${rows}
      </div>`;
  }).join('');
}

function renderTierCard(name, label, tier, highlighted) {
  return `
    <div class="tier-card${highlighted ? ' tier-card-highlight' : ''}" data-tier-card="${escapeHtml(name)}">
      <div class="tier-card-name">${escapeHtml(label)}</div>
      <div class="tier-card-price">£${escapeHtml(tier.recurringMonthlyTotal)}<span>/mo</span></div>
      <div class="tier-card-oneoff">+ £${escapeHtml(tier.oneOffTotal)} one-off</div>
      <button type="button" class="load-tier-btn" data-load-tier="${escapeHtml(name)}">Load this tier</button>
    </div>`;
}

function renderUnlockedPage(contact, result, id) {
  const clientName =
    [contact.firstName, contact.lastName].filter(Boolean).join(' ') ||
    contact.name ||
    'This client';

  const classMatch = result.classMatch || {};
  const classMatchLabel = classMatch.bestStartingMatch || 'Not yet determined';
  const classMatchNote = classMatch.note || null;

  const ptNeed = result.ptNeed || {};
  const ptNeedLabel = ptNeed.unresolved ? 'Unresolved — needs discussion' : ptNeed.band || 'Unresolved — needs discussion';

  const tieredPackages = result.tieredPackages || { essential: { lineItems: [], recurringMonthlyTotal: 0, oneOffTotal: 0 }, recommended: { lineItems: [], recurringMonthlyTotal: 0, oneOffTotal: 0 }, vip: { lineItems: [], recurringMonthlyTotal: 0, oneOffTotal: 0 } };

  const tierPresets = {
    essential: buildComponentsFromTier(tieredPackages.essential),
    recommended: buildComponentsFromTier(tieredPackages.recommended),
    vip: buildComponentsFromTier(tieredPackages.vip),
  };

  // Recommended is loaded by default — it's the AI's own highlighted
  // tier, and staff need some starting point rather than a blank form.
  const initialTier = 'recommended';
  const initialComponents = tierPresets[initialTier];

  // Only what the client-side pricing mirror needs — name/price/billing/
  // discountedPrice — not the whole catalogue object.
  const priceMap = Object.entries(v3Catalogue).reduce((acc, [key, item]) => {
    acc[key] = { name: item.name, price: item.price, billing: item.billing, discountedPrice: item.discountedPrice };
    return acc;
  }, {});

  const body = `
    <style>
      .tier-strip { display: flex; gap: 12px; margin: 20px 0 28px; }
      .tier-card { flex: 1; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px; text-align: center; }
      .tier-card-highlight { border-color: #2563eb; background: #eff6ff; }
      .tier-card-name { font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; }
      .tier-card-price { font-size: 1.3rem; font-weight: 700; margin-top: 4px; }
      .tier-card-price span { font-size: 0.8rem; font-weight: 400; color: #64748b; }
      .tier-card-oneoff { font-size: 0.8rem; color: #64748b; margin-top: 2px; }
      .load-tier-btn { margin-top: 10px; padding: 6px 12px; border: 1px solid #2563eb; background: #fff; color: #2563eb; border-radius: 6px; cursor: pointer; font-size: 0.85rem; }
      .load-tier-btn:hover { background: #2563eb; color: #fff; }
      .component-group { margin-top: 22px; }
      .component-group h3 { font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; margin-bottom: 6px; }
      .component-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; padding: 10px 0; border-bottom: 1px solid #f1f5f9; }
      .component-label { flex: 0 0 200px; font-weight: 600; }
      .component-controls { flex: 1 1 260px; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
      .nutrition-addons { display: flex; gap: 10px; flex-wrap: wrap; }
      .inline-check { font-size: 0.85rem; display: flex; align-items: center; gap: 4px; white-space: nowrap; }
      select, input[type=number] { padding: 4px 6px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 0.85rem; }
      .tri-state { display: flex; gap: 4px; }
      .tri-state-btn { padding: 4px 10px; border: 1px solid #cbd5e1; background: #fff; border-radius: 6px; font-size: 0.8rem; cursor: pointer; color: #475569; }
      .tri-state-btn.active.tri-state-accepted { background: #16a34a; border-color: #16a34a; color: #fff; }
      .tri-state-btn.active.tri-state-declined { background: #dc2626; border-color: #dc2626; color: #fff; }
      .tri-state-btn.active.tri-state-deferred { background: #f59e0b; border-color: #f59e0b; color: #fff; }
      .if-desired { font-size: 0.8rem; color: #64748b; display: flex; align-items: center; gap: 4px; white-space: nowrap; }
      .agreed-plan { margin-top: 24px; padding: 16px; background: #f8fafc; border-top: 1px solid #e2e8f0; border-radius: 0 0 12px 12px; }
      .agreed-plan-totals { font-size: 0.95rem; }
      .agreed-plan-totals strong { font-size: 1.2rem; }
      .save-btn { margin-top: 12px; padding: 10px 20px; background: #2563eb; color: #fff; border: none; border-radius: 8px; font-size: 1rem; cursor: pointer; }
    </style>

    <h1 style="margin-bottom: 4px;">${escapeHtml(clientName)}</h1>
    <p style="color: #64748b; margin-top: 0;">ONETEQ Staff — Agreed Plan</p>

    <div style="margin-top: 28px;">
      <h2 style="font-size: 1rem; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; margin-bottom: 8px;">Class Match</h2>
      <div style="font-size: 1.25rem; font-weight: 600;">${escapeHtml(classMatchLabel)}</div>
      ${
        classMatchNote
          ? `<div style="margin-top: 12px; padding: 12px 16px; background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; color: #92400e; font-size: 0.9rem;">${escapeHtml(classMatchNote)}</div>`
          : ''
      }
    </div>

    <div style="margin-top: 28px;">
      <h2 style="font-size: 1rem; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; margin-bottom: 8px;">7-Axis Overview</h2>
      ${renderRadarChart(result.axes || {})}
    </div>

    <div style="margin-top: 28px;">
      <h2 style="font-size: 1rem; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; margin-bottom: 8px;">PT / Coaching Need</h2>
      <div style="font-size: 1.25rem; font-weight: 600;">${escapeHtml(ptNeedLabel)}</div>
    </div>

    <div style="margin-top: 28px;">
      <h2 style="font-size: 1rem; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; margin-bottom: 4px;">Reference Tiers</h2>
      <p style="color: #64748b; font-size: 0.85rem; margin-top: 0;">Load one as a starting point, then adjust below. Loading resets any unsaved edits.</p>
      <div class="tier-strip">
        ${renderTierCard('essential', 'Essential', tieredPackages.essential, false)}
        ${renderTierCard('recommended', 'Recommended', tieredPackages.recommended, true)}
        ${renderTierCard('vip', 'VIP', tieredPackages.vip, false)}
      </div>
    </div>

    <div style="margin-top: 8px;">
      <h2 style="font-size: 1rem; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; margin-bottom: 4px;">Agreed Plan Components</h2>
      <p style="color: #64748b; font-size: 0.85rem; margin-top: 0;">Accept, decline or defer each component. Only accepted items count toward the total below.</p>
      <div id="component-groups">${renderComponentGroups(initialComponents)}</div>
    </div>

    <div class="agreed-plan">
      <div class="agreed-plan-totals">
        <div><strong id="live-monthly-total">£0</strong> / month recurring</div>
        <div><strong id="live-oneoff-total">£0</strong> one-off</div>
      </div>
      <button id="save-final-package" type="button" class="save-btn">Save Agreed Plan</button>
      <span id="save-status" style="margin-left: 12px; font-size: 0.9rem; color: #64748b;"></span>
    </div>

    <script>
    (function () {
      var PRICE_MAP = ${JSON.stringify(priceMap)};
      var TIER_PRESETS = ${JSON.stringify(tierPresets)};
      var QUALIFYING_KEYS = ${JSON.stringify(Array.from(MEMBERSHIP_OR_COACHING_KEYS))}.reduce(function (acc, k) { acc[k] = true; return acc; }, {});
      var NUTRITION_ADDON_KEYS = ${JSON.stringify(NUTRITION_ADDON_KEYS)};
      var TOGGLE_COMPONENT_IDS = ${JSON.stringify(TOGGLE_COMPONENT_IDS)};
      var FREQUENCY_COMPONENT_IDS = ${JSON.stringify(FREQUENCY_COMPONENT_IDS)};
      var COMPONENT_PRODUCT_KEYS = ${JSON.stringify(
        TOGGLE_COMPONENT_IDS.reduce(function (acc, id) {
          acc[id] = COMPONENTS_BY_ID[id].productKey;
          return acc;
        }, {}),
      )};

      var container = document.getElementById('component-groups');
      var monthlyEl = document.getElementById('live-monthly-total');
      var oneOffEl = document.getElementById('live-oneoff-total');
      var saveBtn = document.getElementById('save-final-package');
      var saveStatus = document.getElementById('save-status');
      var loadedTier = ${JSON.stringify(initialTier)};

      function formatMoney(n) {
        return '£' + (Math.round(n * 100) / 100).toString();
      }

      // Reads the live DOM into the same shape sanitizeComponentState
      // produces server-side — this is a display-only mirror; the server
      // never trusts anything computed here, it only trusts these raw
      // selections and re-derives prices itself on save.
      function readComponentState() {
        var components = {};

        var membershipRow = container.querySelector('[data-component=membership]');
        components.membership = {
          status: membershipRow.querySelector('[data-tri-state] .active').dataset.status,
          level: membershipRow.querySelector('[data-membership-level]').value,
          ifDesired: membershipRow.querySelector('[data-if-desired]').checked,
        };

        FREQUENCY_COMPONENT_IDS.forEach(function (id) {
          var row = container.querySelector('[data-component="' + id + '"]');
          components[id] = {
            status: row.querySelector('[data-tri-state] .active').dataset.status,
            value: row.querySelector('[data-frequency-value="' + id + '"]').value,
            ifDesired: row.querySelector('[data-if-desired]').checked,
          };
        });

        var nutritionRow = container.querySelector('[data-component=nutrition]');
        var addons = {};
        NUTRITION_ADDON_KEYS.forEach(function (key) {
          addons[key] = nutritionRow.querySelector('[data-nutrition-addon="' + key + '"]').checked;
        });
        components.nutrition = {
          status: nutritionRow.querySelector('[data-tri-state] .active').dataset.status,
          level: nutritionRow.querySelector('[data-nutrition-level]').value,
          addons: addons,
          ifDesired: nutritionRow.querySelector('[data-if-desired]').checked,
        };

        var recoveryRow = container.querySelector('[data-component=recovery]');
        components.recovery = {
          status: recoveryRow.querySelector('[data-tri-state] .active').dataset.status,
          quantity: parseInt(recoveryRow.querySelector('[data-recovery-quantity]').value, 10) || 1,
          ifDesired: recoveryRow.querySelector('[data-if-desired]').checked,
        };

        TOGGLE_COMPONENT_IDS.forEach(function (id) {
          var row = container.querySelector('[data-component="' + id + '"]');
          components[id] = {
            status: row.querySelector('[data-tri-state] .active').dataset.status,
            ifDesired: row.querySelector('[data-if-desired]').checked,
          };
        });

        return components;
      }

      // Mirrors expandComponentsToProductIds in [id].js — kept in sync by
      // hand; the server re-derives this independently from the same
      // sanitization rules, so a mismatch here only affects the live
      // number shown, never what gets saved.
      function expandToProductIds(components) {
        var ids = [];
        if (components.membership.status === 'accepted' && components.membership.level !== 'none') {
          ids.push(components.membership.level);
        }
        if (components.coachingFrequency.status === 'accepted' && components.coachingFrequency.value !== 'none') {
          ids.push(components.coachingFrequency.value);
        }
        if (components.nutrition.status === 'accepted') {
          if (components.nutrition.level !== 'none') ids.push(components.nutrition.level);
          NUTRITION_ADDON_KEYS.forEach(function (key) {
            if (components.nutrition.addons[key]) ids.push(key);
          });
        }
        if (components.recovery.status === 'accepted') {
          for (var i = 0; i < components.recovery.quantity; i++) ids.push('sports_massage');
        }
        TOGGLE_COMPONENT_IDS.forEach(function (id) {
          if (components[id].status === 'accepted') ids.push(COMPONENT_PRODUCT_KEYS[id]);
        });
        return ids;
      }

      function recompute() {
        var components = readComponentState();
        var productIds = expandToProductIds(components);
        var qualifies = productIds.some(function (key) { return QUALIFYING_KEYS[key]; });

        var monthly = 0, oneOff = 0;
        productIds.forEach(function (key) {
          var item = PRICE_MAP[key];
          if (!item) return;
          var price = qualifies && item.discountedPrice !== undefined ? item.discountedPrice : item.price;
          if (item.billing === 'RECURRING_MONTHLY') monthly += price;
          else oneOff += price;
        });

        monthlyEl.textContent = formatMoney(monthly);
        oneOffEl.textContent = formatMoney(oneOff);
      }

      function applyTriState(row, status) {
        var buttons = row.querySelectorAll('.tri-state-btn');
        for (var i = 0; i < buttons.length; i++) {
          buttons[i].classList.toggle('active', buttons[i].dataset.status === status);
        }
      }

      function applyComponents(components) {
        var membershipRow = container.querySelector('[data-component=membership]');
        applyTriState(membershipRow, components.membership.status);
        membershipRow.querySelector('[data-membership-level]').value = components.membership.level;
        membershipRow.querySelector('[data-if-desired]').checked = components.membership.ifDesired;

        FREQUENCY_COMPONENT_IDS.forEach(function (id) {
          var row = container.querySelector('[data-component="' + id + '"]');
          applyTriState(row, components[id].status);
          row.querySelector('[data-frequency-value="' + id + '"]').value = components[id].value;
          row.querySelector('[data-if-desired]').checked = components[id].ifDesired;
        });

        var nutritionRow = container.querySelector('[data-component=nutrition]');
        applyTriState(nutritionRow, components.nutrition.status);
        nutritionRow.querySelector('[data-nutrition-level]').value = components.nutrition.level;
        NUTRITION_ADDON_KEYS.forEach(function (key) {
          nutritionRow.querySelector('[data-nutrition-addon="' + key + '"]').checked = components.nutrition.addons[key];
        });
        nutritionRow.querySelector('[data-if-desired]').checked = components.nutrition.ifDesired;

        var recoveryRow = container.querySelector('[data-component=recovery]');
        applyTriState(recoveryRow, components.recovery.status);
        recoveryRow.querySelector('[data-recovery-quantity]').value = components.recovery.quantity;
        recoveryRow.querySelector('[data-if-desired]').checked = components.recovery.ifDesired;

        TOGGLE_COMPONENT_IDS.forEach(function (id) {
          var row = container.querySelector('[data-component="' + id + '"]');
          applyTriState(row, components[id].status);
          row.querySelector('[data-if-desired]').checked = components[id].ifDesired;
        });

        recompute();
      }

      // Event delegation — one listener for the whole component list
      // handles tri-state clicks and any control change, since rows never
      // change shape after the initial render.
      container.addEventListener('click', function (e) {
        var btn = e.target.closest('.tri-state-btn');
        if (!btn) return;
        applyTriState(btn.closest('[data-tri-state]'), btn.dataset.status);
        recompute();
      });
      container.addEventListener('change', recompute);
      recompute();

      var tierCards = document.querySelectorAll('[data-load-tier]');
      for (var i = 0; i < tierCards.length; i++) {
        tierCards[i].addEventListener('click', function (e) {
          var tier = e.target.dataset.loadTier;
          loadedTier = tier;
          applyComponents(TIER_PRESETS[tier]);
        });
      }

      saveBtn.addEventListener('click', function () {
        var components = readComponentState();
        saveBtn.disabled = true;
        saveStatus.textContent = 'Saving...';
        fetch(window.location.pathname, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'save', components: components, loadedTier: loadedTier }),
        })
          .then(function (r) {
            return r.json().then(function (data) { return { ok: r.ok, data: data }; });
          })
          .then(function (result) {
            saveBtn.disabled = false;
            if (result.ok) {
              saveStatus.textContent = 'Saved to GHL.';
            } else {
              saveStatus.textContent = 'Save failed: ' + (result.data && result.data.message ? result.data.message : 'unknown error');
            }
          })
          .catch(function (err) {
            saveBtn.disabled = false;
            saveStatus.textContent = 'Save failed: ' + err.message;
          });
      });
    })();
    </script>
  `;

  return renderPage(`Staff Agreed Plan — ${clientName}`, body);
}

function renderPasswordForm(id, error) {
  const body = `
    <h1>Staff Access</h1>
    <p style="color: #64748b;">Enter the staff password to view this client's pricing/override page.</p>
    ${
      error
        ? `<div style="margin: 12px 0; padding: 12px 16px; background: #fee2e2; border: 1px solid #ef4444; border-radius: 8px; color: #991b1b; font-size: 0.9rem;">${escapeHtml(error)}</div>`
        : ''
    }
    <form method="POST" action="/staff/${escapeHtml(id)}" style="margin-top: 16px; display: flex; gap: 8px;">
      <input type="hidden" name="action" value="login" />
      <input type="password" name="password" placeholder="Password" required
        style="flex: 1; padding: 10px 12px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 1rem;" />
      <button type="submit"
        style="padding: 10px 20px; background: #2563eb; color: #fff; border: none; border-radius: 8px; font-size: 1rem; cursor: pointer;">Unlock</button>
    </form>
  `;
  return renderPage('Staff Login', body);
}

async function handleSave(req, res, id) {
  if (!isAuthed(req)) {
    res.status(401).json({ status: 'error', message: 'Not authenticated' });
    return;
  }

  const body = req.body || {};
  const components = sanitizeComponentState(body.components);
  const loadedTier = ['essential', 'recommended', 'vip'].includes(body.loadedTier) ? body.loadedTier : null;

  const acceptedProductIds = expandComponentsToProductIds(components);
  const hasQualifyingMembershipOrCoaching = acceptedProductIds.some((key) => MEMBERSHIP_OR_COACHING_KEYS.has(key));
  const priced = calculateV3PackageTotal(acceptedProductIds, hasQualifyingMembershipOrCoaching);
  const summary = priced.lineItems.map((item) => item.name).join(', ') || 'None selected';

  // Full accepted/declined/deferred decision set, as JSON — an audit
  // trail alongside the accepted-only summary/price/keys below, written
  // to the new Final_Package_Decisions field (see lib/ghl.js).
  const decisionAudit = {
    generatedAt: new Date().toISOString(),
    loadedTier,
    components,
  };

  try {
    await updateGhlContactCustomFields(id, [
      { key: GHL_CUSTOM_FIELD_KEYS.finalPackageSummary, fieldValue: summary },
      { key: GHL_CUSTOM_FIELD_KEYS.finalPriceMonthly, fieldValue: priced.recurringMonthlyTotal },
      { key: GHL_CUSTOM_FIELD_KEYS.finalPriceOneOff, fieldValue: priced.oneOffTotal },
      { key: GHL_CUSTOM_FIELD_KEYS.finalPackageItemKeys, fieldValue: acceptedProductIds.join(',') },
      { key: GHL_CUSTOM_FIELD_KEYS.finalPackageDecisions, fieldValue: JSON.stringify(decisionAudit) },
    ]);
    res.status(200).json({
      status: 'success',
      monthlyTotal: priced.recurringMonthlyTotal,
      oneOffTotal: priced.oneOffTotal,
      summary,
    });
  } catch (error) {
    console.error('Failed to save Agreed Plan to GHL:', error.message);
    res.status(502).json({ status: 'error', message: 'Could not save to GHL. Please try again.' });
  }
}

module.exports = async function handler(req, res) {
  const { id } = req.query;

  if (!id) {
    res.status(400).send(renderPage('Missing id', '<h1>Missing id</h1><p>No id was provided in the URL.</p>'));
    return;
  }

  if (req.method === 'POST') {
    const body = req.body || {};

    if (body.action === 'login') {
      if (body.password === process.env.STAFF_PAGE_PASSWORD && process.env.STAFF_PAGE_PASSWORD) {
        res.setHeader('Set-Cookie', `staff_session=${sessionToken()}; Path=/; HttpOnly; Max-Age=28800; SameSite=Lax`);
        res.writeHead(302, { Location: `/staff/${id}` });
        res.end();
        return;
      }
      res.status(401).send(renderPasswordForm(id, 'Incorrect password. Try again.'));
      return;
    }

    if (body.action === 'save') {
      await handleSave(req, res, id);
      return;
    }

    res.status(400).send('Unknown action.');
    return;
  }

  if (!isAuthed(req)) {
    res.status(200).send(renderPasswordForm(id, null));
    return;
  }

  let contact;
  try {
    contact = await getGhlContact(id);
  } catch (error) {
    console.error('Failed to fetch GHL contact for staff page:', error.message);
    res
      .status(502)
      .send(renderPage('Could not load', '<h1>Could not load this client right now</h1><p>Please try again shortly.</p>'));
    return;
  }

  if (!contact) {
    res.status(404).send(renderPage('Not found', '<h1>Client not found</h1><p>No contact matches this link.</p>'));
    return;
  }

  const rawResponse = getCustomFieldValue(contact, GHL_CUSTOM_FIELD_IDS.assessmentRawResponse);

  let result;
  try {
    result = JSON.parse(rawResponse);
  } catch (error) {
    console.error(`Could not parse Assessment_Raw_Response for contact ${id}:`, error.message);
    res
      .status(404)
      .send(renderPage('No results yet', '<h1>No assessment result found</h1><p>This contact hasn’t completed an assessment yet, or the result hasn’t saved.</p>'));
    return;
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(renderUnlockedPage(contact, result, id));
};
