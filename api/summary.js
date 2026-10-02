// ONETEQ AI summary endpoint.
//
// Called by a separate GHL workflow webhook action (after the workflow's
// existing Wait, so there is no time pressure on the AI call) rather than
// from api/assessment.js - the scoring response GHL is waiting on is never
// delayed by, or dependent on, this. Reads the assessment result already
// stored on the contact, so it explains exactly what was decided and never
// re-scores anything.

const { getGhlContact } = require('../lib/ghl.js');
const { buildAnswersAndGoalFields, buildGoals } = require('../lib/deriveFlags.js');
const {
  buildSummaryFacts,
  produceSummary,
  generateAndStoreSummary,
  parseStoredResult,
  isSummaryEnabled,
} = require('../lib/aiSummary.js');

function resolveContactId(body) {
  const source = body.customData || body;
  return (
    body.contact_id ||
    body.contactId ||
    source.contact_id ||
    source.contactId ||
    (body.contact && body.contact.id) ||
    null
  );
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Only POST requests are allowed' });
  }

  const body = req.body || {};
  const contactId = resolveContactId(body);
  if (!contactId) {
    return res.status(400).json({ status: 'error', message: 'Missing contact_id.' });
  }

  // dry_run generates and validates a summary and returns it WITHOUT
  // storing anything or needing AI_SUMMARY_ENABLED - for reviewing the
  // wording before going live. Staff-password gated, since it also returns
  // the facts the model was given.
  const dryRun = body.dry_run === true;
  if (dryRun) {
    const password = process.env.STAFF_PAGE_PASSWORD;
    if (!password || req.headers['x-staff-password'] !== password) {
      return res.status(401).json({ status: 'error', message: 'dry_run requires the staff password.' });
    }
  }

  let contact;
  try {
    contact = await getGhlContact(contactId);
  } catch (error) {
    console.error('Failed to fetch GHL contact for summary:', error.message);
    return res.status(502).json({ status: 'error', message: 'Could not fetch this contact from GHL.' });
  }
  if (!contact) {
    return res.status(404).json({ status: 'error', message: `No GHL contact found for ${contactId}.` });
  }

  const storedResult = parseStoredResult(contact);
  if (!storedResult) {
    return res.status(404).json({ status: 'error', message: 'No stored assessment result on this contact yet.' });
  }

  const { q1Goal, q2Goals } = buildAnswersAndGoalFields(contact);
  const goals = buildGoals(q1Goal, q2Goals);

  if (dryRun) {
    // Review-only: force a class so wording can be checked for classes no
    // real contact has yet (e.g. Circuits, key "hyrox"). Never used outside dry_run.
    if (['foundation', 'lift', 'hybrid', 'hyrox'].includes(body.class_override)) {
      storedResult.classMatch = { bestStartingMatch: body.class_override, overrideApplied: false };
    }
    const facts = buildSummaryFacts(storedResult, goals);
    if (!facts) return res.status(200).json({ status: 'skipped', reason: 'no class decided' });
    const produced = await produceSummary(facts);
    return res.status(200).json({
      status: produced.ok ? 'generated' : 'failed',
      summary: produced.text,
      rejectedText: produced.rejectedText,
      reason: produced.reason,
      attempts: produced.attempts,
      retryReasons: produced.retryReasons,
      model: produced.model,
      latencyMs: produced.latencyMs,
      usage: produced.usage,
      facts,
    });
  }

  if (!isSummaryEnabled()) {
    return res.status(200).json({ status: 'skipped', reason: 'AI_SUMMARY_ENABLED is not true' });
  }

  // Always a 200 with a status - a failed summary is not a failed workflow.
  const outcome = await generateAndStoreSummary({ contactId, storedResult, goals, clearOnFailure: false });
  return res.status(200).json(outcome);
};
