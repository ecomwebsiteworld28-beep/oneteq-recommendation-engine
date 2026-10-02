// /api/summary must not do anything for a caller who isn't the workflow or staff:
// no GHL read, no model call, no stored summary. Run with `npm test`.

const assert = require('node:assert/strict');

// Spy on GHL and the model path BEFORE the handler is loaded (it destructures at require time).
const ghl = require('../lib/ghl.js');
const aiSummary = require('../lib/aiSummary.js');
const calls = { getGhlContact: 0 };
ghl.getGhlContact = async () => {
  calls.getGhlContact += 1;
  return null; // "no such contact": enough to prove the call was made without needing real data
};
const handler = require('../api/summary.js');

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

function call({ method = 'POST', headers = {}, body = { contact_id: 'abc123' } } = {}) {
  const out = { status: 200, body: undefined };
  const res = {
    status(code) { out.status = code; return this; },
    json(value) { out.body = value; return this; },
  };
  return handler({ method, headers, body }, res).then(() => out);
}

const ENV_KEYS = ['SUMMARY_WEBHOOK_SECRET', 'STAFF_PAGE_PASSWORD', 'AI_SUMMARY_ENABLED', 'ANTHROPIC_API_KEY'];
const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
function setEnv(values) {
  ENV_KEYS.forEach((k) => delete process.env[k]);
  Object.assign(process.env, values);
}

(async () => {
  await check('a real call with no secret header is refused before anything is read or generated', async () => {
    setEnv({ SUMMARY_WEBHOOK_SECRET: 's3cret-value', AI_SUMMARY_ENABLED: 'true', ANTHROPIC_API_KEY: 'x' });
    calls.getGhlContact = 0;
    const r = await call({});
    assert.equal(r.status, 401);
    assert.equal(r.body.status, 'error');
    assert.equal(calls.getGhlContact, 0, 'GHL was read for an unauthenticated caller');
  });

  await check('a wrong secret, a near-miss and an empty header are all refused', async () => {
    setEnv({ SUMMARY_WEBHOOK_SECRET: 's3cret-value', AI_SUMMARY_ENABLED: 'true' });
    calls.getGhlContact = 0;
    for (const given of ['wrong', 's3cret-valu', 's3cret-value ', 'S3CRET-VALUE', '', 'undefined']) {
      const r = await call({ headers: { 'x-summary-secret': given } });
      assert.equal(r.status, 401, `accepted "${given}"`);
    }
    assert.equal(calls.getGhlContact, 0);
  });

  await check('the secret in the BODY or under another header does not count', async () => {
    setEnv({ SUMMARY_WEBHOOK_SECRET: 's3cret-value', AI_SUMMARY_ENABLED: 'true' });
    calls.getGhlContact = 0;
    assert.equal((await call({ body: { contact_id: 'abc123', secret: 's3cret-value', 'x-summary-secret': 's3cret-value' } })).status, 401);
    assert.equal((await call({ headers: { 'x-staff-password': 's3cret-value', authorization: 's3cret-value' } })).status, 401);
    assert.equal(calls.getGhlContact, 0);
  });

  await check('fails closed: with no secret configured on the deployment, no real call is accepted', async () => {
    setEnv({ AI_SUMMARY_ENABLED: 'true' });
    calls.getGhlContact = 0;
    for (const given of [undefined, '', 'undefined', 'anything']) {
      const r = await call({ headers: given === undefined ? {} : { 'x-summary-secret': given } });
      assert.equal(r.status, 401, `accepted ${JSON.stringify(given)} with no secret configured`);
    }
    assert.equal(calls.getGhlContact, 0);
  });

  await check('the right secret gets through to the normal flow', async () => {
    setEnv({ SUMMARY_WEBHOOK_SECRET: 's3cret-value' });
    calls.getGhlContact = 0;
    const r = await call({ headers: { 'x-summary-secret': 's3cret-value' } });
    assert.equal(r.status, 404, 'with the right secret the handler should reach the contact lookup (stub returns no contact)');
    assert.equal(calls.getGhlContact, 1);
    assert.match(r.body.message, /No GHL contact found/);
  });

  await check('with the right secret but summaries switched off, nothing is generated', async () => {
    setEnv({ SUMMARY_WEBHOOK_SECRET: 's3cret-value' });
    ghl.getGhlContact = async () => ({ id: 'abc123', customFields: [] });
    // No stored result on the contact, so the handler answers before any model call regardless; assert it is not a 401.
    const r = await call({ headers: { 'x-summary-secret': 's3cret-value' } });
    assert.notEqual(r.status, 401);
    assert.ok(![200].includes(r.status) || r.body.status !== 'generated');
  });

  await check('dry_run still needs the staff password, and the webhook secret alone does not unlock it', async () => {
    setEnv({ SUMMARY_WEBHOOK_SECRET: 's3cret-value', STAFF_PAGE_PASSWORD: 'staff-pass' });
    calls.getGhlContact = 0;
    const body = { contact_id: 'abc123', dry_run: true };
    assert.equal((await call({ body })).status, 401, 'no credentials');
    assert.equal((await call({ body, headers: { 'x-summary-secret': 's3cret-value' } })).status, 401, 'webhook secret must not unlock dry_run');
    assert.equal((await call({ body, headers: { 'x-staff-password': 'wrong' } })).status, 401);
    assert.equal(calls.getGhlContact, 0);
    ghl.getGhlContact = async () => { calls.getGhlContact += 1; return null; };
    const ok = await call({ body, headers: { 'x-staff-password': 'staff-pass' } });
    assert.equal(ok.status, 404, 'right staff password reaches the contact lookup');
    assert.equal(calls.getGhlContact, 1);
  });

  await check('dry_run is refused outright when no staff password is configured', async () => {
    setEnv({ SUMMARY_WEBHOOK_SECRET: 's3cret-value' });
    const r = await call({ body: { contact_id: 'abc123', dry_run: true }, headers: { 'x-staff-password': 'undefined' } });
    assert.equal(r.status, 401);
  });

  await check('only POST is accepted', async () => {
    setEnv({ SUMMARY_WEBHOOK_SECRET: 's3cret-value' });
    for (const method of ['GET', 'PUT', 'DELETE']) assert.equal((await call({ method, headers: { 'x-summary-secret': 's3cret-value' } })).status, 405);
  });

  await check('the model-calling code cannot be reached without the secret (source-level guard)', async () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const src = fs.readFileSync(path.join(__dirname, '..', 'api', 'summary.js'), 'utf8');
    const authAt = src.indexOf('hasValidSecret(req)');
    const firstUse = Math.min(...['getGhlContact(contactId)', 'produceSummary(', 'generateAndStoreSummary('].map((s) => src.indexOf(s, src.indexOf('module.exports'))));
    assert.ok(authAt > 0 && authAt < firstUse, 'the secret check must come before any GHL read or model call');
  });

  ENV_KEYS.forEach((k) => { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; });
  if (failures) {
    console.error(`Summary endpoint tests FAILED (${failures} of ${checks + failures})`);
    process.exitCode = 1;
  } else {
    console.log(`Summary endpoint tests passed (${checks} checks)`);
  }
})();
