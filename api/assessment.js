// ONETEQ Assessment API Endpoint
// This receives quiz answers from GHL and runs the real recommendation engine

const { getGhlContact } = require('../lib/ghl.js');
const { scoreContact } = require('../lib/scoreContact.js');
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

    // The scoring itself lives in lib/scoreContact.js, shared with the client results page, which
    // runs the same thing on first view if this webhook has not landed yet.
    const { result, answers, q21Answer, q22Answer, derivedFlags } = scoreContact(contact, source.flags);

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
