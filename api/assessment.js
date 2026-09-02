// ONETEQ Assessment API Endpoint
// This receives quiz answers from GHL and runs the real recommendation engine

const { runFullAssessmentWithPricing } = require('../index.js');
const {
  GHL_CUSTOM_FIELD_KEYS,
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

async function updateGhlContact(contactId, result) {
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
      fieldValue: JSON.stringify(result),
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
    // the source when present, otherwise fall back to the raw body (covers
    // both the old nested {answers, flags} format and a flat body sent
    // directly, without the wrapper).
    const source = req.body.customData || req.body;

    const { answers: nestedAnswers, flags: nestedFlags, ...rest } = source;

    // GHL's webhook sends q3, q4, etc. flat at the top level instead of
    // nested under "answers" — fall back to collecting those if "answers"
    // wasn't provided.
    let answers = nestedAnswers;
    if (!answers) {
      answers = {};
      for (const [key, value] of Object.entries(rest)) {
        if (/^q\d+$/i.test(key)) {
          answers[key] = value;
        }
      }
    }

    if (!answers || Object.keys(answers).length === 0) {
      return res.status(400).json({ error: 'Missing answers in request body' });
    }

    let flags = nestedFlags || {};

    // GHL can't send flags.goals as an array — it sends the main goal as
    // "q1_goal" and any extra goals as a comma-separated "q2_goals" string
    // (sometimes already an array) at the top level. Build flags.goals from
    // those when it wasn't already given as an array.
    if (!Array.isArray(flags.goals)) {
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

      addGoal(rest.q1_goal);

      if (Array.isArray(rest.q2_goals)) {
        rest.q2_goals.forEach(addGoal);
      } else if (typeof rest.q2_goals === 'string' && rest.q2_goals.trim()) {
        rest.q2_goals.split(',').forEach(addGoal);
      }

      flags = { ...flags, goals };
    }

    const result = runFullAssessmentWithPricing(answers, flags);

    // Best-effort push of the result into GHL as contact custom fields.
    // Never let a failure here affect the scoring response GHL's Webhook
    // step is waiting on.
    const contactId = resolveContactId(req, source);
    if (!contactId) {
      console.warn('Skipping GHL contact update: no contact id found in request body');
    } else if (!process.env.GHL_API_KEY) {
      console.warn('Skipping GHL contact update: GHL_API_KEY is not set');
    } else {
      try {
        await updateGhlContact(contactId, result);
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
