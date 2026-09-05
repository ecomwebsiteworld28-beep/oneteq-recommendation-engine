// ONETEQ Assessment API Endpoint
// This receives quiz answers from GHL and runs the real recommendation engine

const { runFullAssessmentWithPricing } = require('../index.js');
const { getGhlContact } = require('../lib/ghl.js');
const {
  buildAnswersAndGoalFields,
  buildGoals,
  deriveQ21Flags,
  deriveQ22Flags,
  deriveEventAndRiskFlags,
  buildStaffOverrideFlags,
  scalarAnswer,
} = require('../lib/deriveFlags.js');
const { writeAssessmentResultToGhl } = require('../lib/writeAssessmentResult.js');

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

    const { answers, q1Goal, q2Goals, q21Answer, q22Answer, q17DetailAnswer, balancedTrainingNeedAnswer } =
      buildAnswersAndGoalFields(contact);

    // goals is always the contact-derived value (previously kept whatever
    // the webhook body sent if it happened to already be an array) - the
    // flags derived below all need to agree with whatever goals the
    // engine actually scores against, and the same "the contact record is
    // correct, the webhook's merge tags are not" reasoning Q3-Q22 already
    // rely on applies here too.
    const goals = buildGoals(q1Goal, q2Goals);
    const q21Flags = deriveQ21Flags(q21Answer);
    const q22Flags = deriveQ22Flags(q22Answer);
    const eventAndRiskFlags = deriveEventAndRiskFlags(
      answers,
      q17DetailAnswer,
      goals,
      q21Flags.q21_InjuryPrevention,
    );
    // Brief section 21's four staff-only inputs - not survey questions,
    // set on the contact from the staff page's "Staff Assessment" section.
    // Read here too (not just on manual Recalculate) so a future survey
    // resubmission still respects whatever staff already reviewed.
    const staffOverrideFlags = buildStaffOverrideFlags(contact);

    const derivedFlags = {
      ...q21Flags,
      ...q22Flags,
      ...eventAndRiskFlags,
      // Balanced_Training_Need is a GHL CHECKBOX field - confirmed live
      // that it echoes its value as an array (["Yes"]), not a plain
      // string, the same shape scalarAnswer() already exists to unwrap.
      balancedTrainingNeed: scalarAnswer(balancedTrainingNeedAnswer) === 'Yes',
      ...staffOverrideFlags,
    };

    // Other flags not derived above still come from the webhook body —
    // goals and every derived flag take precedence over anything with the
    // same name there.
    let flags = { ...(source.flags || {}), goals };
    flags = { ...flags, ...derivedFlags };

    const result = runFullAssessmentWithPricing(answers, flags);

    // Best-effort push of the result into GHL as contact custom fields.
    // Never let a failure here affect the scoring response GHL's Webhook
    // step is waiting on.
    if (!process.env.GHL_API_KEY) {
      console.warn('Skipping GHL contact update: GHL_API_KEY is not set');
    } else {
      try {
        await writeAssessmentResultToGhl(contactId, result, answers, q21Answer, q22Answer, derivedFlags);
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
