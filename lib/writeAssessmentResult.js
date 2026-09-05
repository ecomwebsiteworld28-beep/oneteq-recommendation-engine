// Writes the engine's own recommendation (as opposed to the staff page's
// separately-saved Agreed Plan) back to GHL. Shared by api/assessment.js
// (every survey submission) and api/staff/[id].js's Recalculate action,
// so both write the exact same fields the exact same way.

const { GHL_CUSTOM_FIELD_KEYS, updateGhlContactCustomFields } = require('./ghl.js');

// Hardcoded to match the exact URL you asked results_page_url to contain.
// Update this if the production domain ever changes.
const RESULTS_PAGE_BASE_URL = 'https://oneteq-recommendation-engine.vercel.app';

// A null/undefined score means "unresolved" (e.g. a blank/unanswered
// question), not zero. Sending undefined would make JSON.stringify drop
// the field from the request entirely, leaving whatever value GHL already
// had in place silently stale — so always send an explicit value instead.
function valueOrUnresolved(value, unresolvedFallback = 'Unresolved') {
  return value === null || value === undefined ? unresolvedFallback : value;
}

// A tier's recurring + one-off totals combined into the single number the
// Package_*_Total NUMERICAL fields expect.
function tierGrandTotal(tier) {
  return tier.recurringMonthlyTotal + tier.oneOffTotal;
}

async function writeAssessmentResultToGhl(contactId, result, answers, q21Answer, q22Answer, derivedFlags) {
  // Include the raw answer inputs (Q3-Q20 plus the raw Q21/Q22
  // selections) and every derived flag alongside the scored output, so
  // Assessment_Raw_Response shows what came in, what was derived from it,
  // and what was scored — useful for debugging a wrong-looking result
  // without having to separately go find the contact's answers at the
  // time.
  const debugSnapshot = {
    ...result,
    rawAnswers: { ...answers, q21: q21Answer, q22: q22Answer },
    derivedFlags,
  };

  const customFields = [
    {
      key: GHL_CUSTOM_FIELD_KEYS.classMatch,
      fieldValue: result.classMatch.bestStartingMatch || result.classMatch.note,
    },
    {
      key: GHL_CUSTOM_FIELD_KEYS.recommendedPackageSummary,
      fieldValue: result.recommendedPackage.lineItems.map((item) => item.name).join(', '),
    },
    {
      key: GHL_CUSTOM_FIELD_KEYS.recommendedPriceMonthly,
      fieldValue: result.recommendedPackage.recurringMonthlyTotal,
    },
    {
      key: GHL_CUSTOM_FIELD_KEYS.recommendedPriceOneOff,
      fieldValue: result.recommendedPackage.oneOffTotal,
    },
    {
      // PT_Need_Band is a fixed picklist in GHL (LOW/MODERATE/HIGH/VERY
      // HIGH, no "Unresolved" option) — sending arbitrary text risks GHL
      // rejecting the whole update, so clear it instead when unresolved.
      key: GHL_CUSTOM_FIELD_KEYS.ptNeedBand,
      fieldValue: valueOrUnresolved(result.ptNeed.band, ''),
    },
    {
      // PT_Need_Score is a NUMERICAL field — same risk, so clear it with
      // null instead of writing non-numeric text into it.
      key: GHL_CUSTOM_FIELD_KEYS.ptNeedScore,
      fieldValue: valueOrUnresolved(result.ptNeed.score, null),
    },
    {
      // Package_Essential/Recommended/VIP_Total are NUMERICAL fields —
      // one grand total per tier (recurring + one-off combined), same
      // "clear with null when unresolved" handling as PT_Need_Score.
      // The full per-tier line-item breakdown lives in
      // Assessment_Raw_Response via debugSnapshot below (result.tieredPackages
      // is already spread into it).
      key: GHL_CUSTOM_FIELD_KEYS.packageEssentialTotal,
      fieldValue: valueOrUnresolved(tierGrandTotal(result.tieredPackages.essential), null),
    },
    {
      key: GHL_CUSTOM_FIELD_KEYS.packageRecommendedTotal,
      fieldValue: valueOrUnresolved(tierGrandTotal(result.tieredPackages.recommended), null),
    },
    {
      key: GHL_CUSTOM_FIELD_KEYS.packageVipTotal,
      fieldValue: valueOrUnresolved(tierGrandTotal(result.tieredPackages.vip), null),
    },
    {
      key: GHL_CUSTOM_FIELD_KEYS.assessmentRawResponse,
      fieldValue: JSON.stringify(debugSnapshot),
    },
    {
      key: GHL_CUSTOM_FIELD_KEYS.resultsPageUrl,
      fieldValue: `${RESULTS_PAGE_BASE_URL}/results/${contactId}`,
    },
  ];

  return updateGhlContactCustomFields(contactId, customFields);
}

module.exports = { writeAssessmentResultToGhl, tierGrandTotal, valueOrUnresolved };
