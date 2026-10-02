// Staff page totals must agree with the Essential / Recommended / VIP tier cards.
//
// Loading a tier puts VIP-only extras and a suggested membership in as
// "deferred" on purpose (staff decide them), so the saved/accepted total can
// legitimately be lower than the card. What must always hold, and what this
// test enforces for every tier:
//   1. accepting every deferred item reproduces the card exactly, on the
//      server (the authoritative save path) and in the page's own pricing
//      mirror (the live total staff see);
//   2. the page's mirror agrees with the server for what would be saved;
//   3. whenever those two differ, the page shows the "undecided" notice.
//
// Run with `npm test` (also the Vercel build command).

const assert = require('node:assert/strict');
const vm = require('node:vm');

// index.js prints a long self-test on load; keep the test output readable.
const realLog = console.log;
console.log = () => {};
const { runFullAssessmentWithPricing, calculateV3PackageTotal } = require('../index.js');
const { internals } = require('../api/staff/[id].js');
const { GHL_CUSTOM_FIELD_IDS } = require('../lib/ghl.js');
console.log = realLog;

const { buildComponentsFromTier, expandComponentsToProductIds, MEMBERSHIP_OR_COACHING_KEYS, renderUnlockedPage } = internals;

let checks = 0;
let failures = 0;
function check(name, fn) {
  try {
    fn();
    checks += 1;
  } catch (error) {
    failures += 1;
    console.error(`FAIL: ${name}\n  ${error.message}`);
  }
}

const serverPrice = (components) => {
  const ids = expandComponentsToProductIds(components);
  const priced = calculateV3PackageTotal(ids, ids.some((key) => MEMBERSHIP_OR_COACHING_KEYS.has(key)));
  return { monthly: priced.recurringMonthlyTotal, oneOff: priced.oneOffTotal, count: ids.length };
};
const acceptDeferred = (components) => {
  const copy = JSON.parse(JSON.stringify(components));
  Object.values(copy).forEach((c) => {
    if (c.status === 'deferred') c.status = 'accepted';
  });
  return copy;
};

// ---- Tier sources: real engine output, plus hand-built tiers ----

const BASE_ANSWERS = {
  q3: '3–4 times per week', q4: '3 sessions per week', q5: '2 sessions per week', q6: 'Fairly confident',
  q7: 'Quite confident', q8: 'Quite easy – usually consistent', q9: 'Occasional check-ins', q10: 'Not at all',
  q11: 'No', q12: 'Not applicable', q13: 'Moderately', q14: 'Quite confident', q15: 'Occasional guidance',
  q16: 'Slightly', q17: 'No', q18: 'Nice to know', q19: 'Quite well – occasional issues', q20: 'Occasional advice/support',
};
const FLAGS = {
  goals: ['Improve my general health and fitness'], longevityFocus: true, q21_Cardiovascular: true,
  q21_Independence: true, balancedTrainingNeed: true, preferredStyle: 'MIXED',
};

const scenarios = [];
console.log = () => {};
for (const [label, q5] of [
  ['firm frequency', '2 sessions per week'],
  ['asked us to recommend frequency', 'Please recommend this for me'],
  ['asked for advice on frequency', 'I am not sure – advice on this please'],
]) {
  const result = runFullAssessmentWithPricing({ ...BASE_ANSWERS, q5 }, FLAGS);
  scenarios.push({ label: `engine: ${label}`, result });
}
console.log = realLog;

// Hand-built, so the deferred cases are guaranteed regardless of engine tuning.
function buildTier(productIds, { suggested = [], vipOnly = {} } = {}) {
  const qualifies = productIds.some((key) => MEMBERSHIP_OR_COACHING_KEYS.has(key));
  const priced = calculateV3PackageTotal(productIds, qualifies);
  return {
    ...priced,
    lineItems: priced.lineItems.map((item) => ({
      ...item,
      ...(suggested.includes(item.productId) ? { suggested: true } : {}),
      ...(vipOnly[item.productId] ? { vipType: vipOnly[item.productId], vipLabel: vipOnly[item.productId] === 'VIP_IF_DESIRED' ? 'If Desired' : undefined } : {}),
    })),
    membershipSuggested: suggested.length > 0,
  };
}
scenarios.push({
  label: 'synthetic: suggested membership + VIP-only extras',
  result: {
    tieredPackages: {
      essential: buildTier(['silver_membership', 'initial_assessment'], { suggested: ['silver_membership'] }),
      recommended: buildTier(['gold_membership', 'initial_assessment', 'nutrition_essentials'], { suggested: ['gold_membership'] }),
      vip: buildTier(
        ['gold_membership', 'initial_assessment', 'coaching_2x_week', 'nutrition_transform', 'physio_initial', 'deep_dive', 'rmr_test', 'sports_massage'],
        { suggested: ['gold_membership'], vipOnly: { coaching_2x_week: 'VIP_ENHANCEMENT', nutrition_transform: 'VIP_ENHANCEMENT', physio_initial: 'VIP_IF_DESIRED', deep_dive: 'VIP_ENHANCEMENT', rmr_test: 'VIP_IF_DESIRED' } },
      ),
    },
  },
});
scenarios.push({
  label: 'synthetic: nothing deferred',
  result: {
    tieredPackages: {
      essential: buildTier(['silver_membership']),
      recommended: buildTier(['gold_membership', 'initial_assessment']),
      vip: buildTier(['gold_membership', 'initial_assessment', 'physio_initial']),
    },
  },
});

// ---- Run the page's own pricing code ----

function loadPageMirror(result) {
  const contact = { id: 'test', firstName: 'Test', lastName: 'Client', customFields: [{ id: GHL_CUSTOM_FIELD_IDS.aiClientSummary, value: '' }] };
  const html = renderUnlockedPage(contact, result, 'test');
  const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).find((s) => s.includes('PRICE_MAP'));
  assert.ok(script, 'page script not found');
  const constants = script.match(/var PRICE_MAP = [\s\S]*?(?=\n\s*var container = )/);
  const mirror = script.match(/\/\/ <pricing-mirror>[\s\S]*?\/\/ <\/pricing-mirror>/);
  assert.ok(constants && mirror, 'pricing mirror markers missing from the page script');
  const api = vm.runInNewContext(
    `${constants[0]}\n${mirror[0]}\n({ expand: expandToProductIds, price: priceProductIds, presets: TIER_PRESETS })`,
    {},
  );
  return { html, ...api };
}

let sawDeferredMembership = 0;
let sawDeferredExtras = 0;
let sawNothingDeferred = 0;

for (const { label, result } of scenarios) {
  const page = loadPageMirror(result);

  for (const name of ['essential', 'recommended', 'vip']) {
    const tier = result.tieredPackages[name];
    const card = { monthly: tier.recurringMonthlyTotal, oneOff: tier.oneOffTotal };
    const components = buildComponentsFromTier(tier);
    const deferredIds = Object.entries(components).filter(([, c]) => c.status === 'deferred').map(([id]) => id);

    check(`${label} / ${name}: accepting every deferred item reproduces the tier card (server)`, () => {
      const full = serverPrice(acceptDeferred(components));
      assert.deepEqual({ monthly: full.monthly, oneOff: full.oneOff }, card);
    });

    check(`${label} / ${name}: the page's live total with every item counted equals the tier card`, () => {
      const preset = page.presets[name];
      const live = page.price(page.expand(preset, true));
      assert.deepEqual({ monthly: live.monthly, oneOff: live.oneOff }, card);
    });

    check(`${label} / ${name}: the page prices what would be saved exactly as the server does`, () => {
      const preset = page.presets[name];
      const live = page.price(page.expand(preset, false));
      const saved = serverPrice(components);
      assert.deepEqual({ monthly: live.monthly, oneOff: live.oneOff }, { monthly: saved.monthly, oneOff: saved.oneOff });
      assert.equal(page.expand(preset, false).length, saved.count);
    });

    check(`${label} / ${name}: the undecided notice shows whenever the live total differs from the card`, () => {
      const preset = page.presets[name];
      const undecided = page.expand(preset, true).length > page.expand(preset, false).length;
      const live = page.price(page.expand(preset, false));
      const matchesCard = live.monthly === card.monthly && live.oneOff === card.oneOff;
      assert.ok(matchesCard || undecided, 'live total differs from the card but nothing says items are undecided');
      assert.equal(undecided, deferredIds.length > 0, 'deferred components and the undecided flag disagree');
    });

    if (components.membership.status === 'deferred') sawDeferredMembership += 1;
    if (deferredIds.some((id) => id !== 'membership')) sawDeferredExtras += 1;
    if (!deferredIds.length) sawNothingDeferred += 1;
  }

  check(`${label}: the page carries the undecided-items notice, hidden until needed`, () => {
    assert.match(page.html, /id="pending-plan"[^>]*\shidden/);
    assert.match(page.html, /id="pending-monthly"/);
    assert.match(page.html, /id="pending-oneoff"/);
    assert.match(page.html, /pending-plan[\s\S]*?\.hidden = (?:false|true)|pendingEl\.hidden = false/);
  });
}

// The test is only meaningful if it actually exercised the deferred cases.
check('coverage: suggested memberships, VIP-only extras and fully-accepted tiers were all exercised', () => {
  assert.ok(sawDeferredMembership > 0, 'no scenario produced a deferred (suggested) membership');
  assert.ok(sawDeferredExtras > 0, 'no scenario produced deferred VIP-only items');
  assert.ok(sawNothingDeferred > 0, 'no scenario produced a tier with nothing deferred');
});

if (failures) {
  console.error(`Staff totals tests FAILED (${failures} of ${checks + failures})`);
  process.exitCode = 1;
} else {
  console.log(`Staff totals tests passed (${checks} checks)`);
}
