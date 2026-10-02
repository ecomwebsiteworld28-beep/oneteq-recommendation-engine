// Wording rules for the AI summary, enforced in code (validateSummary), not just asked for in the
// prompt. Each rule has phrases it must reject and near-misses it must NOT reject (a false
// rejection leaves a client with no summary). Run with `npm test`.

const assert = require('node:assert/strict');
const summary = require('../lib/aiSummary.js');

let checks = 0;
let failures = 0;
function check(name, fn) {
  try {
    fn();
    checks += 1;
  } catch (error) {
    failures += 1;
    console.error(`FAIL: ${name}\n  ${error.message}`);
  }
}

// A clean text of exactly `n` words that trips no rule.
const FILLER = ['we', 'recommend', 'a', 'coached', 'class', 'for', 'you'];
const clean = (n) => Array.from({ length: n }, (_, i) => FILLER[i % FILLER.length]).join(' ');
const base = clean(130);
const verdict = (sentence) => summary.validateSummary(`${base} ${sentence}`);

function expectRejected(rule, phrases) {
  for (const phrase of phrases) {
    const result = verdict(phrase);
    assert.equal(result.ok, false, `${rule}: should have been rejected: "${phrase}"`);
    assert.match(result.reason, new RegExp(rule), `${rule}: wrong reason (${result.reason}) for "${phrase}"`);
  }
}
function expectAccepted(phrases) {
  for (const phrase of phrases) {
    const result = verdict(phrase);
    assert.equal(result.ok, true, `should have been accepted: "${phrase}" (${result.reason})`);
  }
}

check('1. the client is "you", never "they" or "the client"', () => {
  expectRejected('client in the third person', [
    'These are things the team can go through if they feel they would be useful.',
    'The team can talk it through if they find it useful.',
    'The team can help the client with this.',
    "The client's goals come first.",
  ]);
  expectAccepted([
    'These are things the team can go through with you if you feel they would be useful.',
    'If you find it useful, the team can explain this in more detail.',
    'They are things the team can talk through with you.', // "they" = the items, not the client
  ]);
});

check('2. length: 90 to 280 words, exact edges', () => {
  const ok = (n) => summary.validateSummary(clean(n));
  assert.equal(ok(89).ok, false, '89 words should be too short');
  assert.equal(ok(90).ok, true);
  assert.equal(ok(264).ok, true, 'the 264-word draft that used to be thrown away is now kept');
  assert.equal(ok(280).ok, true);
  assert.equal(ok(281).ok, false, '281 words should be too long');
  assert.match(ok(281).reason, /length out of range \(281 words\)/);
});

check('3. a high score is never a deficit or a problem', () => {
  expectRejected('deficit framing', [
    'Physiotherapy would need addressing properly through PhysioTEQ.',
    'This would need attention.',
    'What came through is a need for physiotherapy and clinical support.',
    'There is a need for recovery support.',
    'You are in need of coaching support.',
    'Your technique needs addressing.',
    'Your recovery needs attention.',
    'Your posture needs fixing.',
    'This needs working on.',
    'It requires treating.',
    'There are problems with your technique.',
    'This is holding you back.',
  ]);
  expectAccepted([
    'We would like to understand your coaching needs around programming and technique better.',
    'We need a bit more from you before we can say where support would help most.',
    'We would need a bit more detail on that, so we will go through it with you.',
    'We do not yet have enough on your nutrition needs.',
    'Physiotherapy and clinical support at PhysioTEQ is where we would put the most emphasis.',
  ]);
});

check('4a. no promised outcomes or routes to a goal', () => {
  expectRejected('outcome promise', [
    'This structure is built around lifting, which gives you a direct route towards that goal.',
    'It is the surest path to getting stronger.',
    'It is a clear route to your goal.',
    'This is guaranteed to help.',
    'We guarantee results.',
    'It is a route to getting fitter.',
    'It gives you a path towards that.',
  ]);
  expectAccepted([
    'This structure gives you a solid strength foundation to build all of that from.',
    'It is a simple, effective and enjoyable way to get fitter and stronger.', // the client's own Circuits wording
    'Each session works in a straightforward way.',
  ]);
});

check('4b. "worth" appears only in "worth a conversation"', () => {
  expectRejected('"worth" phrasing', [
    'These all sit together and are worth going through with the team.',
    'It is worth having in place.',
    'That is worth keeping in mind.',
    'Worth considering.',
  ]);
  expectAccepted(['Each of these is worth a conversation with the team.', 'It is worth a chat.']);
});

check('the instructions handed to the model are written to the client as "you"', () => {
  const seen = new Set();
  for (let i = 0; i < 400; i += 1) {
    const stored = {
      classMatch: { bestStartingMatch: ['foundation', 'lift', 'hybrid', 'hyrox'][i % 4], overrideApplied: i % 3 === 0 },
      classScores: { lift: i % 7, hybrid: i % 5, hyrox: i % 11 },
      axes: { coaching: { score: i % 10 }, nutritionSupport: { score: (i * 3) % 10 }, performanceFocus: { score: (i * 7) % 10 } },
      rawAnswers: { q5: `${(i % 4) + 1} sessions per week` },
    };
    const facts = summary.buildSummaryFacts(stored, [`goal ${i}`, 'Get stronger']);
    seen.add(facts.styleNotes.supportParagraph);
  }
  assert.ok(seen.size >= 4, `only ${seen.size} support framings were exercised`);
  for (const note of seen) {
    assert.doesNotMatch(note, /\b(?:with|for) them\b|\bif they (?:feel|find|like|want|prefer)\b/i, `framing talks about the client in the third person: ${note}`);
  }
});

check('5. "dedicated" is banned everywhere', () => {
  expectRejected('banned phrase', [
    'This benefits from some dedicated attention.',
    'It stands to gain the most from some dedicated support.',
    'A dedicated programme would suit you.',
    'Dedicated time to talk it through.',
  ]);
  expectAccepted(['The team can give this its full attention when you talk it through.']);
});

check('6. availability is never claimed', () => {
  expectRejected('availability claim', [
    'Sports massage is available through PhysioTEQ.',
    'This is available at GymTEQ.',
    'Support is available from the team.',
    'Testing is available to you.',
    'We offer nutrition support.',
    'We also provide testing.',
  ]);
  expectAccepted(['The team can go through this with you if you feel it would be useful.']);
});

// ---- 7. a named service must be in THIS contact's own recommendation ----
function factsFor(productIds) {
  const stored = {
    classMatch: { bestStartingMatch: 'lift', overrideApplied: false },
    classScores: {},
    axes: { coaching: { score: 8 }, accountability: { score: 6 }, clinicalSupport: { score: 5 }, nutritionSupport: { score: 7 }, performanceFocus: { score: 4 }, recoverySupport: { score: 5 } },
    rawAnswers: { q5: '2 sessions per week' },
    tieredPackages: { recommended: { lineItems: productIds.map((productId) => ({ productId })) } },
  };
  return summary.buildSummaryFacts(stored, ['Get stronger']);
}
// A complete, structurally valid summary with `sentence` in the support paragraph.
function textWith(facts, sentence) {
  return [
    `${clean(100)}.`,
    'We would like to talk through where support would help most.',
    facts.frequencySentence,
    `${sentence}`,
    'The next step is simply a conversation with the team.',
  ].join('\n\n');
}
const FULL_LIST = ['physio_initial', 'nutrition_essentials', 'sports_massage', 'rmr_test', 'coaching_1x_week'];

check('7a. a service that was not recommended cannot be named (contact 9: massage offered when only nutrition was)', () => {
  const nutritionOnly = factsFor(['nutrition_essentials']);
  assert.deepEqual(nutritionOnly.supportAreas, ['nutrition support with the ONETEQ Health team']);
  for (const bad of [
    'Recovery support sits alongside this, with sports massage and recovery work available through PhysioTEQ.',
    'Sports massage at PhysioTEQ could help your recovery.',
    'A VO2 test could be useful.',
    'Fitness testing with the ONETEQ Health team may help.',
    'One-to-one coaching could suit you.',
    'A physiotherapy session could help.',
    'Physiotherapy at PhysioTEQ could help.',
  ]) {
    const result = summary.validateSummary(textWith(nutritionOnly, bad), nutritionOnly);
    assert.equal(result.ok, false, `should be rejected: "${bad}"`);
  }
  const accepted = summary.validateSummary(textWith(nutritionOnly, 'On top of your sessions, nutrition support with the ONETEQ Health team is something the team can go through with you.'), nutritionOnly);
  assert.equal(accepted.ok, true, accepted.reason);
});

check('7b. with nothing recommended, no service at all can be named', () => {
  const none = factsFor([]);
  assert.deepEqual(none.supportAreas, []);
  for (const bad of [
    'A meal plan could help.',
    'Nutrition coaching could help.',
    'One-to-one coaching may suit you.',
    'A physiotherapy appointment is possible.',
    'A director consultation could be arranged.',
    'A progress review is possible.',
    'A scan could be useful.',
    'Massage could help.',
  ]) {
    const result = summary.validateSummary(textWith(none, bad), none);
    assert.equal(result.ok, false, `should be rejected: "${bad}"`);
    assert.match(result.reason, /names a service not in this client's recommendation|failed check/, `unexpected reason for "${bad}": ${result.reason}`);
  }
});

check('7c. the same services ARE allowed when they are in the recommendation', () => {
  const full = factsFor(FULL_LIST);
  assert.equal(full.supportAreas.length, 5);
  for (const good of [
    'The team can go through sports massage and recovery work at PhysioTEQ with you.',
    'Fitness and metabolic testing with the ONETEQ Health team may be useful.',
    'One-to-one coaching is something the team can talk through with you.',
    'Physiotherapy at PhysioTEQ is something the team can go through with you.',
    'Nutrition support with the ONETEQ Health team, including a meal plan, can be talked through.',
  ]) {
    const result = summary.validateSummary(textWith(full, good), full);
    assert.equal(result.ok, true, `should be accepted when recommended: "${good}" (${result.reason})`);
  }
  // some things are never allowed, whatever the recommendation
  for (const never of ['A director consultation could help.', 'A scan could help.']) {
    assert.equal(summary.validateSummary(textWith(full, never), full).ok, false, `never allowed: "${never}"`);
  }
});

check('7d. area names (topics, not services) are still fine without a recommendation', () => {
  const none = factsFor([]);
  const ok = summary.validateSummary(
    textWith(none, 'Physiotherapy and clinical support at PhysioTEQ came through most clearly, and recovery support sits alongside that.'),
    none,
  );
  assert.equal(ok.ok, true, ok.reason);
});

check('the prompt states the new rules', () => {
  const p = summary.SYSTEM_PROMPT;
  assert.match(p, /Always speak to the client as "you"/);
  assert.match(p, /higher relevance never means a problem or a deficit/);
  assert.match(p, /Never promise or imply an outcome/);
  assert.match(p, /Never use the word "worth" except in the phrase "worth a conversation"/);
  assert.doesNotMatch(p, /worth having/, 'the old, narrower "worth" rule is gone');
  assert.doesNotMatch(p, /massage/i, 'the prompt must not name a service the model could then offer to anyone');
  assert.match(p, /Only ever offer or name a service[^\n]*that appears in supportAreas/);
  assert.match(p, /never say a service is "available", or that we "offer" or "provide" it/);
});

if (failures) {
  console.error(`Summary wording tests FAILED (${failures} of ${checks + failures})`);
  process.exitCode = 1;
} else {
  console.log(`Summary wording tests passed (${checks} checks)`);
}
