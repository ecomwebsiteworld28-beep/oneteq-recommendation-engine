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
  ghlHeaders,
  getGhlContact,
  updateGhlContactCustomFields,
  getCustomFieldValue,
};
