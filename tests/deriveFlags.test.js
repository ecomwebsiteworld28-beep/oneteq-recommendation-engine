// The conditioning class is being renamed Circuits. The survey/GHL form can be renamed
// independently, so the engine must treat both names identically or the class would
// silently score lower. Run with `npm test`.

const assert = require('node:assert/strict');

const realLog = console.log;
console.log = () => {};
const { runFullAssessmentWithPricing } = require('../index.js');
const flagsLib = require('../lib/deriveFlags.js');
const { GHL_CUSTOM_FIELD_IDS } = require('../lib/ghl.js');
console.log = realLog;

const { deriveEventAndRiskFlags, resolvePreferredStyle, canonicalPreferredStyleOption, buildStaffOverrideFlags, PREFERRED_STYLE_OPTION_TO_VALUE } = flagsLib;

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

const baseAnswers = { q11: 'No', q17: 'Yes – specific event/race/target' };
const flagsFor = (detail, goals) => deriveEventAndRiskFlags(baseAnswers, detail, goals, false);

check('free-text and goal wording is recognised under either name, in any case', () => {
  for (const wording of ['HYROX', 'hyrox', 'Hyrox', 'Circuits', 'circuits', 'CIRCUITS']) {
    const inDetail = flagsFor(`Training for a ${wording} event`, []);
    assert.equal(inDetail.specificHyroxGoal, true, `detail: ${wording}`);
    assert.equal(inDetail.q17SpecificallyHyrox, true, `detail (q17): ${wording}`);
    const inGoal = flagsFor('', [`Prepare for a ${wording} event`]);
    assert.equal(inGoal.specificHyroxGoal, true, `goal: ${wording}`);
  }
});

check('unrelated wording does not trigger the class, including "a strength circuit"', () => {
  for (const wording of ['', 'general fitness', 'a strength circuit', 'I enjoy circuit training', 'a 5k run', 'Mixed/balanced']) {
    assert.equal(flagsFor(wording, [wording]).specificHyroxGoal, false, `should not match: "${wording}"`);
  }
});

check('the preferred-style option is read under either spelling', () => {
  assert.equal(resolvePreferredStyle('Conditioning/HYROX-style'), 'CONDITIONING_HYROX');
  assert.equal(resolvePreferredStyle('Conditioning/Circuits-style'), 'CONDITIONING_HYROX');
  assert.equal(resolvePreferredStyle('Strength-focused'), 'STRENGTH');
  assert.equal(resolvePreferredStyle('Mixed/balanced'), 'MIXED');
  assert.equal(resolvePreferredStyle('No preference'), 'NONE');
  assert.equal(resolvePreferredStyle('something else'), 'NONE');
  assert.equal(resolvePreferredStyle(undefined), 'NONE');
  assert.equal(canonicalPreferredStyleOption('Conditioning/HYROX-style'), 'Conditioning/Circuits-style', 'the old spelling maps to the current option');
  assert.equal(canonicalPreferredStyleOption('Conditioning/Circuits-style'), 'Conditioning/Circuits-style');
  assert.equal(canonicalPreferredStyleOption('Strength-focused'), 'Strength-focused');
});

check('a contact whose GHL field holds either spelling gives the engine the same value', () => {
  const contactWith = (value) => ({ customFields: [{ id: GHL_CUSTOM_FIELD_IDS.preferredTrainingStyle, value }] });
  assert.equal(buildStaffOverrideFlags(contactWith('Conditioning/HYROX-style')).preferredStyle, 'CONDITIONING_HYROX');
  assert.equal(buildStaffOverrideFlags(contactWith('Conditioning/Circuits-style')).preferredStyle, 'CONDITIONING_HYROX');
});

check('the staff dropdown offers exactly one conditioning option, the current one (the old spelling is read-only)', () => {
  const options = Object.keys(PREFERRED_STYLE_OPTION_TO_VALUE);
  assert.equal(options.filter((o) => /^Conditioning/.test(o)).length, 1);
  assert.ok(options.includes('Conditioning/Circuits-style'));
  assert.ok(!options.includes('Conditioning/HYROX-style'), 'the old spelling must not be offered or saved');
  assert.deepEqual(options, ['No preference', 'Strength-focused', 'Mixed/balanced', 'Conditioning/Circuits-style']);
});

check('class scores are identical whichever name the client used', () => {
  const answers = {
    q3: '3–4 times per week', q4: '3 sessions per week', q5: '2 sessions per week', q6: 'Fairly confident',
    q7: 'Quite confident', q8: 'Quite easy – usually consistent', q9: 'Occasional check-ins', q10: 'Not at all',
    q11: 'No', q12: 'Not applicable', q13: 'Moderately', q14: 'Quite confident', q15: 'Occasional guidance',
    q16: 'Slightly', q17: 'Yes – specific event/race/target', q18: 'Nice to know', q19: 'Quite well – occasional issues', q20: 'Occasional advice/support',
  };
  const run = (wording, preferred) => {
    const goals = [`Prepare for a ${wording} event`];
    const event = deriveEventAndRiskFlags(answers, `I am training for ${wording}`, goals, false);
    console.log = () => {};
    const result = runFullAssessmentWithPricing(answers, { goals, ...event, preferredStyle: resolvePreferredStyle(preferred) });
    console.log = realLog;
    return { classScores: result.classScores, best: result.classMatch.bestStartingMatch };
  };
  const old = run('HYROX', 'Conditioning/HYROX-style');
  const renamed = run('Circuits', 'Conditioning/Circuits-style');
  assert.deepEqual(renamed, old);
  const unmatched = run('swimming', 'No preference');
  assert.ok(old.classScores.hyrox > unmatched.classScores.hyrox, 'sanity: the wording must actually raise the class score');
});

if (failures) {
  console.error(`deriveFlags tests FAILED (${failures} of ${checks + failures})`);
  process.exitCode = 1;
} else {
  console.log(`deriveFlags tests passed (${checks} checks)`);
}
