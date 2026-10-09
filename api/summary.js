// ONETEQ AI summary endpoint.
//
// Called by a separate GHL workflow webhook action (directly after the scoring webhook, so the
// client's results page can pick the summary up while they are looking at it) rather than
// from api/assessment.js - the scoring response GHL is waiting on is never
// delayed by, or dependent on, this. Safe to call more than once: a contact that already
// has a stored summary is skipped (send force: true to regenerate). Reads the assessment result already
// stored on the contact, so it explains exactly what was decided and never
// re-scores anything.

const crypto = require('crypto');
const { getGhlContact, getCustomFieldValue, GHL_CUSTOM_FIELD_IDS } = require('../lib/ghl.js');
const { buildAnswersAndGoalFields, buildGoals } = require('../lib/deriveFlags.js');
const {
  buildSummaryFacts,
  produceSummary,
  generateAndStoreSummary,
  parseStoredResult,
  isSummaryEnabled,
} = require('../lib/aiSummary.js');

// Real (storing) calls come from the GHL workflow and must carry a shared secret in
// the x-summary-secret header. Contact ids are in the results-page URLs clients receive,
// so without this anyone holding a link could trigger a paid model call and overwrite
// that client's summary. Fails closed: if SUMMARY_WEBHOOK_SECRET is not set on the
// deployment, no real call is accepted. Compared via SHA-256 digests in constant time.
function hasValidSecret(req) {
  const expected = process.env.SUMMARY_WEBHOOK_SECRET;
  const given = req.headers && req.headers['x-summary-secret'];
  if (!expected || typeof given !== 'string' || !given) return false;
  const digest = (value) => crypto.createHash('sha256').update(value).digest();
  return crypto.timingSafeEqual(digest(expected), digest(given));
}

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

  // Authentication comes first, before anything is read, fetched or generated.
  // dry_run generates and validates a summary and returns it WITHOUT storing
  // anything or needing AI_SUMMARY_ENABLED - for reviewing the wording before
  // going live. Staff-password gated, since it also returns the facts the model
  // was given. Every other call is the workflow's real one and needs the secret.
  const dryRun = body.dry_run === true;
  if (dryRun) {
    const password = process.env.STAFF_PAGE_PASSWORD;
    if (!password || req.headers['x-staff-password'] !== password) {
      return res.status(401).json({ status: 'error', message: 'dry_run requires the staff password.' });
    }
  } else if (!hasValidSecret(req)) {
    return res.status(401).json({ status: 'error', message: 'Missing or invalid x-summary-secret header.' });
  }

  const contactId = resolveContactId(body);
  if (!contactId) {
    return res.status(400).json({ status: 'error', message: 'Missing contact_id.' });
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

  // Idempotent: the workflow may call this twice (before and after its Wait). A summary that is
  // already stored is left alone, so a repeat call costs nothing and never rewrites what the client has seen.
  if (!dryRun && body.force !== true) {
    const existing = String(getCustomFieldValue(contact, GHL_CUSTOM_FIELD_IDS.aiClientSummary) || '').trim();
    if (existing) return res.status(200).json({ status: 'skipped', reason: 'summary already stored' });
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
      retryMatches: produced.retryMatches,
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
