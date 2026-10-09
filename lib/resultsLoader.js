// Decides what the client results page should show for a contact, so that arriving early is safe.
//
// The survey now redirects to /results/<id> the moment it is submitted. Scoring lands in GHL about
// 2 to 4 seconds after that, and the page is opened within 1 to 2, so the page will often arrive
// first. The rules:
//   1. A stored result exists            -> show it.
//   2. No result, but the answers are on  -> score them right here (same function as the webhook),
//      the contact                           show the result, and store it (best effort).
//   3. Anything else (answers not on the  -> "preparing": the page retries by itself.
//      contact yet, GHL slow, GHL erroring,
//      contact not readable yet)
// Nothing here throws and nothing leads to an error page: every failure becomes "preparing".

const { GHL_SURVEY_ANSWER_FIELD_IDS: SURVEY, GHL_CUSTOM_FIELD_IDS: IDS, getGhlContact, getCustomFieldValue } = require('./ghl.js');
const { parseStoredResult } = require('./aiSummary.js');

const READ_TIMEOUT_MS = 8000; // a GHL read took up to 10.9 s in testing; never wait that long for a page
const WRITE_TIMEOUT_MS = 6000;

const nonEmpty = (value) => value !== undefined && value !== null && String(Array.isArray(value) ? value.join('') : value).trim() !== '';

// The survey writes all of its answers to the contact together, so the first question and the
// first scored question both being present means the submission has landed. A contact that exists
// without them (created a moment before its answers, or not a survey contact at all) is not scored.
function hasSurveyAnswers(contact) {
  return nonEmpty(getCustomFieldValue(contact, SURVEY.q1Goal)) && nonEmpty(getCustomFieldValue(contact, SURVEY.q3));
}

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${ms} ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// What the page shows alongside the result. A stored summary, if there is one.
function readSummary(contact) {
  return String(getCustomFieldValue(contact, IDS.aiClientSummary) || '').trim();
}

// deps are replaceable for tests: { getContact, score, writeResult }.
async function loadResultsForPage(contactId, deps = {}) {
  const getContact = deps.getContact || getGhlContact;
  const score = deps.score || ((contact) => require('./scoreContact.js').scoreContact(contact));
  const writeResult = deps.writeResult || ((...args) => require('./writeAssessmentResult.js').writeAssessmentResultToGhl(...args));

  let contact;
  try {
    contact = await getContact(contactId, { timeoutMs: READ_TIMEOUT_MS });
  } catch (error) {
    // 400/404/422 mean GHL does not know this id (yet): keep the reason separate so a wrong link
    // gives up sooner than a slow GHL does. Anything else (timeout, 5xx, network) is just slow.
    const unknown = [400, 404, 422].includes(error && error.status);
    console.warn(`results page: could not read contact (${(error && (error.status || error.name)) || 'error'})`);
    return { kind: 'preparing', reason: unknown ? 'not-found' : 'slow' };
  }
  if (!contact) return { kind: 'preparing', reason: 'not-found' };

  const stored = parseStoredResult(contact);
  if (stored && typeof stored === 'object' && Object.keys(stored).length) {
    return { kind: 'ready', contact, result: stored, summary: readSummary(contact), computed: false };
  }

  if (!hasSurveyAnswers(contact)) return { kind: 'preparing', reason: 'no-answers' };

  // Score here, exactly as the webhook would.
  let scored;
  try {
    scored = score(contact);
  } catch (error) {
    console.error('results page: scoring on first view failed:', error && error.message);
    return { kind: 'preparing', reason: 'slow' };
  }
  const { result, answers, q21Answer, q22Answer, derivedFlags } = scored;
  // The shape the GHL writer stores (and the page reads): the result plus the inputs behind it.
  const snapshot = { ...result, rawAnswers: { ...answers, q21: q21Answer, q22: q22Answer }, derivedFlags };

  // Storing it is best effort: the visitor sees their results either way. The workflow's webhook
  // writes the same values a moment later, so a failed or slow write here costs nothing.
  let stored_ok = false;
  if (process.env.GHL_API_KEY) {
    try {
      await withTimeout(writeResult(contactId, result, answers, q21Answer, q22Answer, derivedFlags), WRITE_TIMEOUT_MS);
      stored_ok = true;
    } catch (error) {
      console.warn('results page: could not store the result computed on first view:', error && error.message);
    }
  }
  console.log(`results page: scored on first view (stored=${stored_ok})`);
  return { kind: 'ready', contact, result: snapshot, summary: readSummary(contact), computed: true, stored: stored_ok };
}

module.exports = { loadResultsForPage, hasSurveyAnswers, READ_TIMEOUT_MS };
