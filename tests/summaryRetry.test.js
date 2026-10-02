// The retry loop: up to three attempts, and each retry is told what was wrong with the draft
// before it. Uses a scripted fake model, so no network and no API key are needed.
// Run with `npm test`.

const assert = require('node:assert/strict');
const summary = require('../lib/aiSummary.js');

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

const FILLER = ['we', 'recommend', 'a', 'coached', 'class', 'for', 'you'];
const clean = (n) => Array.from({ length: n }, (_, i) => FILLER[i % FILLER.length]).join(' ');

const stored = {
  classMatch: { bestStartingMatch: 'lift', overrideApplied: false },
  classScores: {},
  axes: { coaching: { score: 8 }, accountability: { score: 6 }, clinicalSupport: { score: 5 }, nutritionSupport: { score: 7 }, performanceFocus: { score: 4 }, recoverySupport: { score: 5 } },
  rawAnswers: { q5: '2 sessions per week' },
  tieredPackages: { recommended: { lineItems: [{ productId: 'nutrition_essentials' }] } },
};
const facts = summary.buildSummaryFacts(stored, ['Get stronger']);

// A structurally valid summary whose second paragraph contains `sentence`.
const draft = (sentence) =>
  [
    `${clean(100)}.`,
    sentence,
    facts.frequencySentence,
    'On top of your sessions, nutrition support with the ONETEQ Health team is something the team can go through with you.',
    'The next step is simply a conversation with the team.',
  ].join('\n\n');
const GOOD = draft('Performance and event focus also came through in your answers.');
const BAD_WORTH = draft('These are topics worth going through together.');
const BAD_DEDICATED = draft('This is something dedicated support can help shape.');
const BAD_EASIER = draft('This structure is easier than Lift to begin with.');

// Scripted model: each call returns the next response and records the messages it was sent.
function fakeModel(responses) {
  const calls = [];
  const createMessage = async (model, timeoutMs, messages) => {
    calls.push(messages);
    const next = responses[calls.length - 1];
    if (next instanceof Error) throw next;
    return { stop_reason: 'end_turn', content: [{ type: 'text', text: next }], usage: { input_tokens: 10, output_tokens: 20 } };
  };
  return { calls, createMessage };
}

(async () => {
  process.env.ANTHROPIC_API_KEY = 'test-key';

  await check('a good first draft is accepted on the first attempt, with a single plain message', async () => {
    const model = fakeModel([GOOD]);
    const result = await summary.produceSummary(facts, { createMessage: model.createMessage });
    assert.equal(result.ok, true, result.reason);
    assert.equal(result.attempts, 1);
    assert.deepEqual(result.retryReasons, []);
    assert.equal(model.calls.length, 1);
    assert.equal(model.calls[0].length, 1);
    assert.equal(model.calls[0][0].role, 'user');
  });

  await check('a rejected draft is retried WITH the draft, the exact words that failed, and what to do', async () => {
    const model = fakeModel([BAD_WORTH, GOOD]);
    const result = await summary.produceSummary(facts, { createMessage: model.createMessage });
    assert.equal(result.ok, true, result.reason);
    assert.equal(result.attempts, 2);
    assert.deepEqual(result.retryReasons, ['failed check: "worth" phrasing']);
    assert.deepEqual(result.retryMatches, ['worth']);
    const retry = model.calls[1];
    assert.equal(retry.length, 3, 'facts, the rejected draft, then the feedback');
    assert.deepEqual(retry.map((m) => m.role), ['user', 'assistant', 'user']);
    assert.equal(retry[1].content, BAD_WORTH, 'the model is shown its own rejected draft');
    assert.match(retry[2].content, /it contained "worth"/);
    assert.match(retry[2].content, /Do not use the word "worth" anywhere/);
    assert.match(retry[2].content, /still follows every other rule/);
    assert.equal(retry[0].content, model.calls[0][0].content, 'the original facts are repeated unchanged');
  });

  await check('a third attempt is told about BOTH earlier rejections', async () => {
    const model = fakeModel([BAD_WORTH, BAD_DEDICATED, GOOD]);
    const result = await summary.produceSummary(facts, { createMessage: model.createMessage });
    assert.equal(result.ok, true, result.reason);
    assert.equal(result.attempts, 3);
    assert.deepEqual(result.retryMatches, ['worth', 'dedicated']);
    const third = model.calls[2][2].content;
    assert.match(third, /it contained "dedicated"/);
    assert.match(third, /Earlier drafts were also rejected, so avoid these too: Do not use the word "worth" anywhere/);
    assert.equal(model.calls[2][1].content, BAD_DEDICATED, 'it is shown the latest rejected draft');
  });

  await check('three failures in a row give up: no fourth call, and the last draft and reason are returned', async () => {
    const model = fakeModel([BAD_WORTH, BAD_DEDICATED, BAD_EASIER, GOOD]);
    const result = await summary.produceSummary(facts, { createMessage: model.createMessage });
    assert.equal(result.ok, false);
    assert.equal(result.attempts, 3);
    assert.equal(model.calls.length, 3, 'must stop at MAX_ATTEMPTS');
    assert.equal(summary.MAX_ATTEMPTS, 3);
    assert.match(result.reason, /class ranking wording/);
    assert.equal(result.rejectedText, BAD_EASIER);
    assert.equal(result.retryReasons.length, 2);
  });

  await check('an API failure is not retried as if it were bad wording', async () => {
    const model = fakeModel([Object.assign(new Error('overloaded'), { status: 529 }), GOOD]);
    const result = await summary.produceSummary(facts, { createMessage: model.createMessage });
    assert.equal(result.ok, false);
    assert.equal(result.attempts, 1);
    assert.match(result.reason, /API call failed \(529\)/);
    assert.equal(model.calls.length, 1);
    assert.doesNotMatch(JSON.stringify(result), /overloaded/, 'the error body must not be echoed');
  });

  await check('"easier to keep training" is no longer a rejection (contacts 3 and 6)', async () => {
    const ok = draft('Structure and accountability matter because having that framework in place makes it easier to keep training regularly.');
    const model = fakeModel([ok]);
    const result = await summary.produceSummary(facts, { createMessage: model.createMessage });
    assert.equal(result.ok, true, result.reason);
    assert.equal(result.attempts, 1);
  });

  await check('comparing classes by level is still rejected', async () => {
    for (const sentence of [
      'This structure is easier than Lift to begin with.',
      'Foundation is an easier class to start in.',
      'Hybrid is a harder session than Lift.',
      'Circuits is tougher than Foundation.',
      'This is a gentler way to begin.',
      'It is a more demanding class.',
      'An intense workout.',
      'It can be difficult at first.',
    ]) {
      const verdict = summary.validateSummary(draft(sentence), facts);
      assert.equal(verdict.ok, false, `should be rejected: "${sentence}"`);
      assert.match(verdict.reason, /class ranking wording/);
    }
    for (const sentence of [
      'Having that framework in place makes it easier to keep training regularly.',
      'It is harder to stay consistent without a plan, which is why structure helps.',
    ]) {
      const verdict = summary.validateSummary(draft(sentence), facts);
      assert.equal(verdict.ok, true, `should be accepted: "${sentence}" (${verdict.reason})`);
    }
  });

  await check('every output check has a plain-language hint, and the hints stay out of the model-facing facts', async () => {
    const rules = ['class ranking wording', '"worth" phrasing', 'banned phrase', 'availability claim', 'deficit framing', 'outcome promise', 'client in the third person', 'asserted arrangement', 'good/bad framing', 'lower-priority framing', 'old class name', 'company name', 'wrong brand on an area'];
    for (const rule of rules) {
      const hint = summary.retryHint({ rule, reason: `failed check: ${rule}` });
      assert.ok(hint && hint.length > 20 && !/^Fix that/.test(hint), `no specific hint for "${rule}"`);
    }
    assert.match(summary.retryHint({ reason: 'length out of range (300 words)' }), /too long/);
    assert.match(summary.retryHint({ reason: 'length out of range (60 words)' }), /too short/);
    assert.match(summary.retryHint({ reason: 'frequency sentence not included verbatim' }), /frequencySentence/);
    assert.match(summary.retryHint({ reason: "offers something not in this client's recommendation: physiotherapy" }), /not offered/);
    assert.match(summary.retryHint({ reason: 'some new reason' }), /Fix that and keep to every other rule/);
    assert.deepEqual(summary.buildRetryMessages(facts, null).length, 1);
  });

  delete process.env.ANTHROPIC_API_KEY;
  if (failures) {
    console.error(`Summary retry tests FAILED (${failures} of ${checks + failures})`);
    process.exitCode = 1;
  } else {
    console.log(`Summary retry tests passed (${checks} checks)`);
  }
})();
