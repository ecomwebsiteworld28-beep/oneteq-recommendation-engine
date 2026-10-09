// Arriving at /results/<id> early must be safe: the survey redirects there before scoring has landed.
// Covers the loader's states, the handler (never an error status, never throws), the waiting pages,
// the summary placeholder and its polling, the read-only summary status endpoint, and the
// "already stored, skip" guard on the summary webhook. Run with `npm test`.

const assert = require('node:assert/strict');

// Spy on GHL BEFORE api/summary.js is loaded (it destructures at require time).
const ghl = require('../lib/ghl.js');
const ghlCalls = { getGhlContact: 0 };
let ghlContact = null;
ghl.getGhlContact = async () => {
  ghlCalls.getGhlContact += 1;
  return ghlContact;
};

const { SURVEY_IDS, IDS } = { SURVEY_IDS: ghl.GHL_SURVEY_ANSWER_FIELD_IDS, IDS: ghl.GHL_CUSTOM_FIELD_IDS };
const { loadResultsForPage, hasSurveyAnswers } = require('../lib/resultsLoader.js');
const { renderPreparingPage, renderSoftPage, MAX_SLOW_TRIES, MAX_NOT_FOUND_TRIES } = require('../lib/resultsStates.js');
const { renderResultsPage } = require('../lib/clientPage.js');
const { summaryPollScript, renderSummaryPlaceholder, SAFE_ID } = require('../lib/summaryPending.js');
const fixtures = require('./fixtures.js');

let checks = 0;
let failures = 0;
async function check(name, fn) {
  try {
    await fn();
    checks += 1;
  } catch (error) {
    failures += 1;
    console.error(`FAIL: ${name}\n  ${error.message}`);
  }
}

const ID = 'Xko2KH0Ml3bUIAPCbp5N';
const field = (id, value) => ({ id, value });
const answered = (extra = []) => ({
  firstName: 'Sam',
  lastName: 'Test',
  customFields: [field(SURVEY_IDS.q1Goal, 'Build strength'), field(SURVEY_IDS.q3, 'Yes'), ...extra],
});
const FAKE_RESULT = { classMatch: { bestStartingMatch: 'lift', overrideApplied: false }, ptNeed: {}, recommendedPackage: {}, tieredPackages: {} };
const stub = {
  score: () => ({ result: FAKE_RESULT, answers: { q3: 'Yes' }, q21Answer: [], q22Answer: [], derivedFlags: {} }),
};

function run(handler, { id = ID, query = {}, headers = {}, url } = {}) {
  const out = { status: undefined, body: undefined, headers: {} };
  const res = {
    setHeader(k, v) { out.headers[k.toLowerCase()] = v; },
    status(code) { out.status = code; return this; },
    send(body) { out.body = body; return this; },
    json(body) { out.body = body; return this; },
  };
  return Promise.resolve(handler({ query: { id, ...query }, headers, url: url || `/results/${id}` }, res)).then(() => out);
}

(async () => {
  // ---- the loader --------------------------------------------------------------------------
  await check('a stored result is shown as is, with its stored summary, and nothing is recomputed', async () => {
    let scored = 0;
    const contact = answered([field(IDS.assessmentRawResponse, JSON.stringify(FAKE_RESULT)), field(IDS.aiClientSummary, 'Hello Sam.')]);
    const r = await loadResultsForPage(ID, { getContact: async () => contact, score: () => { scored += 1; return stub.score(); } });
    assert.equal(r.kind, 'ready');
    assert.equal(r.computed, false);
    assert.equal(r.summary, 'Hello Sam.');
    assert.equal(scored, 0);
  });

  await check('answers on the contact but no stored result: scored on first view and the result is stored', async () => {
    process.env.GHL_API_KEY = 'test-key';
    const writes = [];
    const r = await loadResultsForPage(ID, { getContact: async () => answered(), score: stub.score, writeResult: async (...args) => writes.push(args) });
    assert.equal(r.kind, 'ready');
    assert.equal(r.computed, true);
    assert.equal(r.stored, true);
    assert.equal(writes.length, 1);
    assert.equal(writes[0][0], ID);
    assert.equal(r.result.classMatch.bestStartingMatch, 'lift');
    assert.ok(r.result.rawAnswers && r.result.derivedFlags, 'the snapshot carries the inputs behind the result, like the stored one');
    assert.equal(r.summary, '');
  });

  await check('a failed or unavailable store never costs the visitor their results', async () => {
    process.env.GHL_API_KEY = 'test-key';
    const failed = await loadResultsForPage(ID, { getContact: async () => answered(), score: stub.score, writeResult: async () => { throw new Error('GHL down'); } });
    assert.equal(failed.kind, 'ready');
    assert.equal(failed.stored, false);
    delete process.env.GHL_API_KEY;
    let wrote = 0;
    const noKey = await loadResultsForPage(ID, { getContact: async () => answered(), score: stub.score, writeResult: async () => { wrote += 1; } });
    assert.equal(noKey.kind, 'ready');
    assert.equal(wrote, 0);
  });

  await check('answers not on the contact yet (or only half of them) means preparing, not an error and not a guess', async () => {
    let scored = 0;
    const score = () => { scored += 1; return stub.score(); };
    for (const contact of [
      { firstName: 'Sam', customFields: [] },
      { firstName: 'Sam' },
      { customFields: [field(SURVEY_IDS.q1Goal, 'Build strength')] },
      { customFields: [field(SURVEY_IDS.q3, 'Yes')] },
      { customFields: [field(SURVEY_IDS.q1Goal, '  '), field(SURVEY_IDS.q3, '')] },
    ]) {
      const r = await loadResultsForPage(ID, { getContact: async () => contact, score });
      assert.equal(r.kind, 'preparing');
      assert.equal(r.reason, 'no-answers');
    }
    assert.equal(scored, 0);
    assert.equal(hasSurveyAnswers(answered()), true);
  });

  await check('every way the read can go wrong becomes preparing and never throws', async () => {
    const reason = async (getContact) => (await loadResultsForPage(ID, { getContact, score: stub.score })).reason;
    const thrower = (props) => async () => { throw Object.assign(new Error('x'), props); };
    assert.equal(await reason(thrower({ status: 404 })), 'not-found');
    assert.equal(await reason(thrower({ status: 422 })), 'not-found');
    assert.equal(await reason(thrower({ status: 500 })), 'slow');
    assert.equal(await reason(thrower({ status: 429 })), 'slow');
    assert.equal(await reason(thrower({ name: 'TimeoutError' })), 'slow');
    assert.equal(await reason(thrower({})), 'slow');
    assert.equal(await reason(async () => null), 'not-found');
    assert.equal(await reason(async () => undefined), 'not-found');
  });

  await check('a scoring crash on first view becomes preparing, not an error page', async () => {
    const r = await loadResultsForPage(ID, { getContact: async () => answered(), score: () => { throw new Error('boom'); } });
    assert.equal(r.kind, 'preparing');
  });

  await check('the real scorer scores a contact straight off the survey answers, and scoring is repeatable', async () => {
    const { scoreContact } = require('../lib/scoreContact.js');
    const log = console.log;
    console.log = () => {};
    let a, b;
    try {
      a = scoreContact(answered());
      b = scoreContact(answered());
    } finally {
      console.log = log;
    }
    const strip = (x) => JSON.stringify({ ...x.result, timestamp: undefined });
    assert.ok(a.result.classMatch.bestStartingMatch);
    assert.equal(strip(a), strip(b));
    // and the webhook now goes through the same function
    const fs = require('node:fs');
    const path = require('node:path');
    const webhook = fs.readFileSync(path.join(__dirname, '..', 'api', 'assessment.js'), 'utf8');
    assert.ok(/scoreContact\(/.test(webhook), 'the scoring webhook and the results page must share one scorer');
  });

  // ---- the handler -------------------------------------------------------------------------
  const handlerWith = (loadResults, isSummaryEnabled = () => true) => require('../api/results/[id].js').createHandler({ loadResults, isSummaryEnabled });
  const preparing = (reason) => async () => ({ kind: 'preparing', reason });
  const ready = (summary = '') => async () => ({ kind: 'ready', contact: { firstName: 'Sam', lastName: 'Test' }, result: fixtures.LIFT.result, summary, computed: false });

  await check('the page never answers with an error status: every state is HTTP 200, uncached and not indexed', async () => {
    const cases = [
      [handlerWith(ready()), {}],
      [handlerWith(preparing('no-answers')), {}],
      [handlerWith(preparing('slow')), {}],
      [handlerWith(preparing('not-found')), {}],
      [handlerWith(preparing('slow')), { query: { w: '99' } }],
      [handlerWith(preparing('not-found')), { query: { w: '99' } }],
      [handlerWith(ready()), { id: '../../etc/passwd' }],
      [handlerWith(ready()), { id: '' }],
      [handlerWith(ready()), { id: '<script>alert(1)</script>' }],
    ];
    for (const [handler, opts] of cases) {
      const out = await run(handler, opts);
      assert.equal(out.status, 200, `status ${out.status} for ${JSON.stringify(opts)}`);
      assert.match(out.headers['cache-control'], /no-store/);
      assert.match(out.headers['x-robots-tag'], /noindex/);
      assert.ok(out.headers['x-results-state']);
      assert.doesNotMatch(out.body, /Internal Server Error|Cannot read|undefined|\[object/i);
    }
  });

  await check('early arrival shows the preparing page, which retries by itself; a ready contact shows the results', async () => {
    const early = await run(handlerWith(preparing('no-answers')));
    assert.equal(early.headers['x-results-state'], 'preparing');
    assert.match(early.body, /Preparing your results/);
    assert.match(early.body, /X-Results-Poll/);
    const done = await run(handlerWith(ready('Hi Sam.')));
    assert.equal(done.headers['x-results-state'], 'ready');
    assert.match(done.body, /Sam Test/);
  });

  await check('after the retry cap the visitor gets a soft "try again" page, and a wrong link gives up sooner', async () => {
    const slowCap = await run(handlerWith(preparing('slow')), { query: { w: String(MAX_SLOW_TRIES) } });
    assert.equal(slowCap.headers['x-results-state'], 'gaveup');
    assert.match(slowCap.body, /Try again/);
    const slowBelow = await run(handlerWith(preparing('slow')), { query: { w: String(MAX_SLOW_TRIES - 1) } });
    assert.equal(slowBelow.headers['x-results-state'], 'preparing');
    const nfCap = await run(handlerWith(preparing('not-found')), { query: { w: String(MAX_NOT_FOUND_TRIES) } });
    assert.equal(nfCap.headers['x-results-state'], 'notfound');
    assert.ok(MAX_NOT_FOUND_TRIES < MAX_SLOW_TRIES);
  });

  await check('a poll request gets the state header and an empty body, not a whole page', async () => {
    const out = await run(handlerWith(ready()), { headers: { 'x-results-poll': '1' } });
    assert.equal(out.headers['x-results-state'], 'ready');
    assert.equal(out.body, '');
    const early = await run(handlerWith(preparing('slow')), { headers: { 'x-results-poll': '1' } });
    assert.equal(early.headers['x-results-state'], 'preparing');
    assert.equal(early.body, '');
  });

  await check('a malformed id is never read from GHL and never reaches the page', async () => {
    let loads = 0;
    const handler = handlerWith(async () => { loads += 1; return { kind: 'preparing', reason: 'slow' }; });
    for (const id of ['', 'abc', 'x'.repeat(41), 'a b c d e f g h', '<img src=x onerror=1>', 'abcd1234"; alert(1); "']) {
      const out = await run(handler, { id });
      assert.equal(out.status, 200);
      assert.equal(out.headers['x-results-state'], 'notfound');
      assert.doesNotMatch(out.body, /alert\(1\)|onerror/);
    }
    assert.equal(loads, 0);
  });

  await check('prices still never reach the client, on the ready page or any waiting page', async () => {
    const pages = [
      (await run(handlerWith(ready()))).body,
      (await run(handlerWith(preparing('slow')))).body,
      renderSoftPage({ kind: 'gaveup', retryHref: '/results/x' }),
      renderSoftPage({ kind: 'notfound' }),
    ];
    for (const html of pages) assert.doesNotMatch(html, /4817|912\.5|£|\$\d/);
  });

  // ---- summary placeholder and polling -----------------------------------------------------
  await check('summary not stored yet: the page shows a "writing your summary" block and polls; stored: no block, no script', async () => {
    const pendingPage = (await run(handlerWith(ready(''), () => true))).body;
    assert.match(pendingPage, /data-summary-pending/);
    assert.match(pendingPage, new RegExp(`/api/summary-status/`));
    assert.match(pendingPage, new RegExp(ID));
    const storedPage = (await run(handlerWith(ready('Your plan is Lift.'), () => true))).body;
    assert.doesNotMatch(storedPage, /data-summary-pending|summary-status/);
    assert.match(storedPage, /Your plan is Lift\./);
    const switchedOff = (await run(handlerWith(ready(''), () => false))).body;
    assert.doesNotMatch(switchedOff, /data-summary-pending|summary-status/, 'with summaries off there is nothing to wait for');
  });

  await check('the poll script is valid JavaScript, bounded, and only ever built for a plain contact id', async () => {
    const script = summaryPollScript(ID).replace(/^<script>|<\/script>$/g, '');
    assert.doesNotThrow(() => new Function(script));
    assert.match(script, /tries >= \d+/, 'polling must have an upper bound');
    for (const bad of ['', undefined, null, 'a"b', '</script><script>x', 'short', 'x'.repeat(41), 'abc def ghi']) {
      assert.equal(summaryPollScript(bad), '');
    }
    assert.ok(SAFE_ID.test(ID));
    assert.doesNotMatch(renderSummaryPlaceholder(), /undefined/);
    const direct = renderResultsPage({ clientName: 'Sam', result: fixtures.LIFT.result, aiSummary: '', summaryPending: true, contactId: ID });
    assert.match(direct, /data-summary-pending/);
    const noId = renderResultsPage({ clientName: 'Sam', result: fixtures.LIFT.result, aiSummary: '', summaryPending: true, contactId: 'bad id' });
    assert.doesNotMatch(noId, /summary-status/, 'no id, no polling');
  });

  await check('the preparing page is branded, calm and has a no-JavaScript way forward', async () => {
    const html = renderPreparingPage({ attempt: 3 });
    assert.match(html, /ONETEQ/);
    assert.match(html, /<noscript>/);
    assert.doesNotMatch(html, /error|failed|went wrong|sorry/i);
    const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
    assert.doesNotThrow(() => new Function(script));
    for (const kind of ['gaveup', 'notfound']) assert.doesNotMatch(renderSoftPage({ kind }), /error|failed|went wrong|exception/i);
  });

  // ---- summary status endpoint -------------------------------------------------------------
  const statusHandler = (getContact) => require('../api/summary-status/[id].js').createHandler({ getContact });

  await check('summary status: ready with text, pending without, pending on any GHL failure, none for a bad id', async () => {
    const withText = await run(statusHandler(async () => answered([field(IDS.aiClientSummary, '  Hello Sam.  ')])));
    assert.deepEqual(withText.body, { state: 'ready', text: 'Hello Sam.' });
    const without = await run(statusHandler(async () => answered()));
    assert.deepEqual(without.body, { state: 'pending' });
    for (const fail of [async () => { throw new Error('GHL down'); }, async () => null]) {
      const out = await run(statusHandler(fail));
      assert.equal(out.status, 200);
      assert.deepEqual(out.body, { state: 'pending' });
    }
    let reads = 0;
    const bad = await run(statusHandler(async () => { reads += 1; return answered(); }), { id: 'no good!' });
    assert.deepEqual(bad.body, { state: 'none' });
    assert.equal(reads, 0);
  });

  await check('summary status is read-only: no write, no model call, nothing it imports can generate', async () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const src = fs.readFileSync(path.join(__dirname, '..', 'api', 'summary-status', '[id].js'), 'utf8');
    assert.doesNotMatch(src, /aiSummary|generateAndStoreSummary|produceSummary|writeAssessmentResult|updateGhl|method:\s*['"](PUT|POST)/i);
    const out = await run(statusHandler(async () => answered()));
    assert.match(out.headers['cache-control'], /s-maxage=\d/);
  });

  // ---- the summary webhook is idempotent ---------------------------------------------------
  await check('the summary webhook skips a contact that already has a summary, unless forced; dry runs are untouched', async () => {
    process.env.SUMMARY_WEBHOOK_SECRET = 's3cret';
    process.env.STAFF_PAGE_PASSWORD = 'staff-pw';
    process.env.AI_SUMMARY_ENABLED = 'true';
    process.env.ANTHROPIC_API_KEY = 'x';
    const summaryHandler = require('../api/summary.js');
    const call = (headers, body) => new Promise((resolve) => {
      const out = { status: 200, body: undefined };
      const res = { status(c) { out.status = c; return this; }, json(v) { out.body = v; return this; }, setHeader() {} };
      Promise.resolve(summaryHandler({ method: 'POST', headers, body }, res)).then(() => resolve(out));
    });
    // Has a summary but, for this test, no stored result: if the guard did not skip first, the
    // next thing that would happen is the "no stored assessment result" 404.
    ghlContact = answered([field(IDS.aiClientSummary, 'Already written.')]);
    const secret = { 'x-summary-secret': 's3cret' };
    const skipped = await call(secret, { contact_id: ID });
    assert.equal(skipped.status, 200);
    assert.equal(skipped.body.status, 'skipped');
    assert.match(skipped.body.reason, /already stored/);
    const forced = await call(secret, { contact_id: ID, force: true });
    assert.equal(forced.status, 404, 'force must get past the guard');
    const dry = await call({ 'x-staff-password': 'staff-pw' }, { contact_id: ID, dry_run: true });
    assert.equal(dry.status, 404, 'a dry run must get past the guard');
    ghlContact = answered(); // no summary yet: goes on to the real work
    const fresh = await call(secret, { contact_id: ID });
    assert.equal(fresh.status, 404);
    ghlContact = answered([field(IDS.aiClientSummary, '   ')]); // whitespace is not a summary
    const blank = await call(secret, { contact_id: ID });
    assert.equal(blank.status, 404);
    ['SUMMARY_WEBHOOK_SECRET', 'STAFF_PAGE_PASSWORD', 'AI_SUMMARY_ENABLED', 'ANTHROPIC_API_KEY'].forEach((k) => delete process.env[k]);
  });

  await check('the new functions have time limits that fit a slow GHL read', async () => {
    const config = require('../vercel.json');
    assert.ok(config.functions['api/results/[id].js'].maxDuration >= 20);
    assert.ok(config.functions['api/summary-status/[id].js'].maxDuration >= 10);
  });

  if (failures) {
    console.error(`Instant results tests FAILED (${failures} of ${checks + failures})`);
    process.exitCode = 1;
  } else {
    console.log(`Instant results tests passed (${checks} checks)`);
  }
})();
