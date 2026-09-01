// Shared GHL (GoHighLevel) API config and helpers, used by both the
// assessment scoring endpoint (api/assessment.js) and the results page
// endpoint (api/results/[id].js).

const GHL_API_BASE = 'https://services.leadconnectorhq.com';
const GHL_API_VERSION = '2021-07-28';

// GHL custom field "key" values (Settings → Custom Fields in your GHL
// sub-account) that assessment results are read from/written to. These
// are best guesses derived from the field names given — open each field
// in GHL and confirm/replace these with the exact key shown there before
// relying on this in production.
const GHL_CUSTOM_FIELD_KEYS = {
  classMatch: 'class_match',
  recommendedPackageSummary: 'recommended_package_summary',
  recommendedPriceMonthly: 'recommended_price_monthly',
  recommendedPriceOneOff: 'recommended_price_oneoff',
  ptNeedBand: 'pt_need_band',
  ptNeedScore: 'pt_need_score',
  assessmentRawResponse: 'assessment_raw_response',
  resultsPageUrl: 'results_page_url',
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

// GHL's own docs are inconsistent about whether a custom field's value
// comes back as "value" or "fieldValue" on read — check both. Match by
// "key" (our snake_case key), not "id" (GHL's internal field id hash,
// which we don't have).
function getCustomFieldValue(contact, key) {
  const fields = (contact && contact.customFields) || [];
  const field = fields.find((f) => f.key === key);
  if (!field) return undefined;
  return field.fieldValue ?? field.value;
}

module.exports = {
  GHL_API_BASE,
  GHL_API_VERSION,
  GHL_CUSTOM_FIELD_KEYS,
  ghlHeaders,
  getGhlContact,
  updateGhlContactCustomFields,
  getCustomFieldValue,
};
