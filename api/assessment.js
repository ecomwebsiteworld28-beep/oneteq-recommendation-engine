// ONETEQ Assessment API Endpoint
// This receives quiz answers from GHL and runs the real recommendation engine

const { runFullAssessmentWithPricing } = require('../index.js');
const {
  GHL_CUSTOM_FIELD_KEYS,
  GHL_SURVEY_ANSWER_FIELD_IDS,
  getGhlContact,
  getCustomFieldValue,
  updateGhlContactCustomFields,
} = require('../lib/ghl.js');

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

// GHL's webhook payload typically carries the contact id as "contact_id"
// at the top level, alongside (not inside) "customData" — but check both
// locations, and both naming casings, to be safe.
function resolveContactId(req, source) {
  return (
    req.body.contact_id ||
    req.body.contactId ||
    source.contact_id ||
    source.contactId ||
    (req.body.contact && req.body.contact.id) ||
    null
  );
}

// A field occasionally comes back as an array even for what should be a
// single-answer question (Q7's GHL field is misconfigured as
// MULTIPLE_OPTIONS) — take the first value in that case rather than
// passing the whole array through to a scoreXXX lookup, which would never
// match an array against a string key.
function scalarAnswer(value) {
  if (Array.isArray(value)) {
    if (value.length > 1) {
      console.warn('Answer field returned multiple values, using the first:', value);
    }
    return value[0];
  }
  return value;
}

// The 18 raw survey answers (Q3-Q20) plus the two goal fields, read
// directly off the GHL contact rather than trusted from webhook merge
// tags — those mappings have repeatedly been wrong or duplicated. A field
// that's genuinely blank on the contact comes back as undefined here,
// which flows straight through to answers.qN — the existing scoreXXX/
// isUnresolved handling in index.js already treats that as unresolved
// rather than guessing a score, so no special-casing is needed for it.
function buildAnswersAndGoalFields(contact) {
  const answers = {};
  for (let q = 3; q <= 20; q++) {
    const fieldId = GHL_SURVEY_ANSWER_FIELD_IDS[`q${q}`];
    answers[`q${q}`] = scalarAnswer(getCustomFieldValue(contact, fieldId));
  }

  const q1Goal = scalarAnswer(getCustomFieldValue(contact, GHL_SURVEY_ANSWER_FIELD_IDS.q1Goal));
  const q2Goals = getCustomFieldValue(contact, GHL_SURVEY_ANSWER_FIELD_IDS.q2Goals);

  return { answers, q1Goal, q2Goals };
}

// flags.goals needs to be an array. Q1_Main_Goal is a single string;
// Q2_Other_Goals is a genuine multi-select field in GHL and comes back as
// an array already, but handle a comma-separated string too in case that
// ever changes.
function buildGoals(q1Goal, q2Goals) {
  const goals = [];
  const seen = new Set();
  const addGoal = (goal) => {
    if (typeof goal !== 'string') return;
    const trimmed = goal.trim();
    if (trimmed && !seen.has(trimmed)) {
      seen.add(trimmed);
      goals.push(trimmed);
    }
  };

  addGoal(q1Goal);

  if (Array.isArray(q2Goals)) {
    q2Goals.forEach(addGoal);
  } else if (typeof q2Goals === 'string' && q2Goals.trim()) {
    q2Goals.split(',').forEach(addGoal);
  }

  return goals;
}

async function updateGhlContact(contactId, result, answers) {
  // Include the raw answer inputs alongside the scored output, so
  // Assessment_Raw_Response shows what came in as well as what was
  // scored from it — useful for debugging a wrong-looking result without
  // having to separately go find what the contact's answers were at the
  // time.
  const debugSnapshot = { ...result, rawAnswers: answers };

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
      key: GHL_CUSTOM_FIELD_KEYS.assessmentRawResponse,
      fieldValue: JSON.stringify(debugSnapshot),
    },
    {
      key: GHL_CUSTOM_FIELD_KEYS.resultsPageUrl,
      fieldValue: `${RESULTS_PAGE_BASE_URL}/results/${contactId}`,
    },
  ];

  await updateGhlContactCustomFields(contactId, customFields);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Only POST requests are allowed' });
  }

  try {
    // GHL wraps the fields we care about inside "customData" — use that as
    // the source when present, otherwise fall back to the raw body.
    const source = req.body.customData || req.body;

    const contactId = resolveContactId(req, source);
    if (!contactId) {
      return res.status(400).json({
        status: 'error',
        message: 'Missing contact_id — cannot fetch survey answers without it.',
      });
    }

    // Survey answers are now always read from the GHL contact itself, not
    // from the webhook payload — the merge-tag field mappings in the
    // workflow have repeatedly been wrong or duplicated, but the contact
    // record is always correct. A failure here means there's nothing
    // reliable to score, so it's a hard error rather than falling back to
    // scoring with empty answers.
    let contact;
    try {
      contact = await getGhlContact(contactId);
    } catch (error) {
      console.error('Failed to fetch GHL contact for scoring:', error.message);
      return res.status(502).json({
        status: 'error',
        message: 'Could not fetch this contact from GHL, so the assessment cannot be scored.',
      });
    }

    if (!contact) {
      return res.status(404).json({
        status: 'error',
        message: `No GHL contact found for contact_id ${contactId}.`,
      });
    }

    const { answers, q1Goal, q2Goals } = buildAnswersAndGoalFields(contact);

    // Flags (Q21/Q22 selections, longevityFocus, preferredStyle, etc.)
    // still come from the webhook body — only the raw Q3-Q20 + goal
    // answers moved to being read from the contact.
    let flags = source.flags || {};
    if (!Array.isArray(flags.goals)) {
      flags = { ...flags, goals: buildGoals(q1Goal, q2Goals) };
    }

    const result = runFullAssessmentWithPricing(answers, flags);

    // Best-effort push of the result into GHL as contact custom fields.
    // Never let a failure here affect the scoring response GHL's Webhook
    // step is waiting on.
    if (!process.env.GHL_API_KEY) {
      console.warn('Skipping GHL contact update: GHL_API_KEY is not set');
    } else {
      try {
        await updateGhlContact(contactId, result, answers);
      } catch (ghlError) {
        console.error('GHL contact update failed:', ghlError.message);
      }
    }

    return res.status(200).json({
      status: 'success',
      result: result
    });

  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
}
