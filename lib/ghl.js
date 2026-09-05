// Shared GHL (GoHighLevel) API config and helpers, used by both the
// assessment scoring endpoint (api/assessment.js) and the results page
// endpoint (api/results/[id].js).

const GHL_API_BASE = 'https://services.leadconnectorhq.com';
const GHL_API_VERSION = '2021-07-28';

// GHL custom field "key" values (Settings → Custom Fields in your GHL
// sub-account). Confirmed against the actual field names in this
// sub-account. Used when *writing* fields via PUT /contacts/:id, which
// accepts a "key" — GHL resolves it to the right field internally.
const GHL_CUSTOM_FIELD_KEYS = {
  classMatch: 'class_match',
  recommendedPackageSummary: 'recommended_package_summary',
  recommendedPriceMonthly: 'recommended_price_monthly',
  recommendedPriceOneOff: 'recommended_price_oneoff',
  ptNeedBand: 'pt_need_band',
  ptNeedScore: 'pt_need_score',
  assessmentRawResponse: 'assessment_raw_response',
  resultsPageUrl: 'results_page_url',
  // Staff's manually-overridden final package (separate from the
  // AI-recommended one above). Write-only for now — nothing reads these
  // back yet, so no matching GHL_CUSTOM_FIELD_IDS entries exist for them.
  finalPackageSummary: 'final_package_summary',
  finalPriceMonthly: 'final_price_monthly',
  finalPriceOneOff: 'final_price_oneoff',
  finalPackageItemKeys: 'final_package_item_keys',
  // Full accepted/declined/deferred decision set from the staff Agreed
  // Plan page, as JSON - an audit trail alongside the summary/price/keys
  // above, which only ever capture the final *accepted* outcome. Created
  // 2026-09-05 (field id wgdkBlI5TGFE5faNBqvi) after checking for an
  // existing suitable field first - Plan_State, Client_Decision and
  // Plan_Tier_Provisional already exist in this GHL location and look
  // provisioned for this same feature, but each is a SINGLE_OPTIONS
  // picklist (can only hold one value, not a decision set) and none is
  // referenced anywhere in this codebase yet - not wired up here pending
  // confirmation of their intended semantics.
  finalPackageDecisions: 'final_package_decisions',
  // Essential/Recommended/VIP tier grand totals (recurring + one-off
  // combined into a single number per tier, since these are NUMERICAL
  // fields in GHL) — write-only for now, same as the finalPackage* fields
  // above, so no matching GHL_CUSTOM_FIELD_IDS entries exist for them.
  packageEssentialTotal: 'package_essential_total',
  packageRecommendedTotal: 'package_recommended_total',
  packageVipTotal: 'package_vip_total',
};

// GHL's internal field ids for the same fields, pulled from
// GET /locations/:locationId/customFields. Reads (GET /contacts/:id) only
// ever return customFields as {id, value} — no "key" is echoed back — so
// looking a field up after reading a contact has to go through this map
// instead of GHL_CUSTOM_FIELD_KEYS. These ids are permanent for the life
// of the field; only re-derive them if a field is deleted and recreated.
const GHL_CUSTOM_FIELD_IDS = {
  classMatch: 'pRiYJPDnPZaxbB73Ntei',
  recommendedPackageSummary: 'GeQEuJFy1OO5GS8GrOjs',
  recommendedPriceMonthly: 'J87m2n3MowxhRXJop9ZY',
  recommendedPriceOneOff: '95VYCzLCMt7hv5xExhCC',
  ptNeedBand: 'eaEx2SyOPrFC3c1as5B9',
  ptNeedScore: 'FHi3xUxuzaNxP4fBYK5P',
  assessmentRawResponse: 'evY2KMdSVrv5BnPicP5V',
  resultsPageUrl: 'BTJzfBPkdGoSFEE3bZQc',
};

// GHL field ids for the 18 raw survey answers (Q3-Q20) plus the two goal
// fields, pulled from GET /locations/:locationId/customFields. Read
// directly off the contact instead of trusting webhook merge tags, which
// have repeatedly been wrong or duplicated. Note Q6's field is named
// "ONETEQ Assessment" in GHL, not anything starting with "Q6" — found by
// matching its picklist options against scoreProgrammingSupportNeed's.
const GHL_SURVEY_ANSWER_FIELD_IDS = {
  q3: 'E4Bhej4rk8Bn1ir2Kkzd',
  q4: '60u7naPCR1JskNLVqrUz',
  q5: '1sGPYFEmxYvu11k7gVhl',
  q6: 'otIaNKJIkLH9WKDhcSM6', // "ONETEQ Assessment"
  q7: 'zyJWefBzXGPE0r5dpz9C',
  q8: '3xtOgMY7Y8uKdKv1xthH',
  q9: '8huCpWx0bmGczYbWN77f',
  q10: 'gMiIMgTUyfDnC0tVsati',
  q11: '122eOj6lcw1OihAulbrE',
  q12: 'QoLjol1bnPO7lKE6QZJH',
  q13: 'i2qNPBVUgl3CZOQY2bi0',
  q14: 'Q5fx0chYEsLM4G4DSxf4',
  q15: '01mrGgYCRodM7DuwU7KX',
  q16: 'pzDmI4JUZSlYU4i0SqGf',
  q17: 'YYuCMOpRP2m5E9J2RJ7Q',
  q18: 'uPq9CwixsZQ1qIrC5nfX',
  q19: 'GP0pfRtw0qUmVcogHVnO',
  q20: 'fOBrvr1WkNwC9LmXlLzg',
  q1Goal: 'pJl1D51PazBUhTuKAnRH',
  q2Goals: 'MgAhMd7R0uBmPdOUS9oj',
  q21: 'I4G6tIFvArYJPrjbYLR9', // Q21_Longterm_Focus (multi-select)
  q22: 'wJEMT5zL033UYlrYmGf2', // Q22_Current_Activities (multi-select)
};

function ghlHeaders() {
  return {
    Authorization: `Bearer ${process.env.GHL_API_KEY}`,
    Version: GHL_API_VERSION,
    'Content-Type': 'application/json',
  };
}

async function getGhlContact(contactId) {
  const response = await fetch(`${GHL_API_BASE}/contacts/${contactId}`, {
    method: 'GET',
    headers: ghlHeaders(),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`GHL get contact failed (${response.status}): ${body}`);
  }

  const data = await response.json();
  return data.contact;
}

async function updateGhlContactCustomFields(contactId, customFields) {
  const response = await fetch(`${GHL_API_BASE}/contacts/${contactId}`, {
    method: 'PUT',
    headers: ghlHeaders(),
    body: JSON.stringify({ customFields }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`GHL contact update failed (${response.status}): ${body}`);
  }
}

// Confirmed against a real GET /contacts/:id response: customFields
// entries come back as {id, value} — never {key, fieldValue} despite what
// GHL's docs show for the update endpoint. Match by GHL's internal field
// id (see GHL_CUSTOM_FIELD_IDS above), and still check both "value" and
// "fieldValue" for the value itself as a defensive fallback.
function getCustomFieldValue(contact, fieldId) {
  const fields = (contact && contact.customFields) || [];
  const field = fields.find((f) => f.id === fieldId);
  if (!field) return undefined;
  return field.fieldValue ?? field.value;
}

module.exports = {
  GHL_API_BASE,
  GHL_API_VERSION,
  GHL_CUSTOM_FIELD_KEYS,
  GHL_CUSTOM_FIELD_IDS,
  GHL_SURVEY_ANSWER_FIELD_IDS,
  ghlHeaders,
  getGhlContact,
  updateGhlContactCustomFields,
  getCustomFieldValue,
};
