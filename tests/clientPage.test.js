// Run with `npm test`; vercel.json runs it as the build command, so a
// failure here stops a deploy. No framework: plain assert.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { renderResultsPage, renderMessagePage, CTA_URL, CTA_LABEL, PROCESS_STEPS } = require('../lib/clientPage.js');
const fixtures = require('./fixtures.js');

const PRICE_WORDS = /[£$€]|\b(?:price[sd]?|pricing|costs?|per month|a month|\/month|one-off|billing|packages?|memberships?|tiers?|discount\w*)\b/i;
const PRICE_VALUES = ['4817', '912.5', '912.50'];

let passed = 0;
function check(name, fn) {
  try {
    fn();
    passed += 1;
  } catch (error) {
    console.error(`FAIL: ${name}\n${error.message}`);
    process.exitCode = 1;
  }
}

const pages = fixtures.ALL.map((fixture) => ({
  fixture,
  html: renderResultsPage({ clientName: fixture.name, result: fixture.result, aiSummary: fixture.aiSummary }),
}));
const messages = [
  renderMessagePage('Result not found', 'Result not found', 'No contact matches this link.'),
  renderMessagePage('Could not load results', 'Could not load this result right now', 'Please try again shortly.'),
];

// Visible text only: drop the stylesheet and tags so CSS can't trip the check.
const visibleText = (html) =>
  html
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/g, ' ');

for (const { fixture, html } of pages) {
  check(`no prices on the page: ${fixture.name}`, () => {
    // The call to action invites a pricing conversation ("discuss pricing"). That label is the one
    // allowed use of the word; everything else on the page is still scanned, and so is every digit and symbol.
    const text = visibleText(html).split(CTA_LABEL).join(' ');
    assert.ok(visibleText(html).includes(CTA_LABEL), 'call to action label missing');
    assert.doesNotMatch(html, /[£$€]/, 'currency symbol in page');
    assert.doesNotMatch(text, PRICE_WORDS, 'price wording in page text');
    for (const value of PRICE_VALUES) assert.ok(!html.includes(value), `price value ${value} leaked into page`);
  });

  check(`exactly one call to action: ${fixture.name}`, () => {
    assert.equal((html.match(/class="button"/g) || []).length, 1);
    assert.ok(html.includes(`href="${CTA_URL}"`));
    assert.ok(html.includes(CTA_LABEL));
  });

  check(`five steps; steps 3-5 jump to real sections, 1-2 are not links; step 4 starts current: ${fixture.name}`, () => {
    assert.equal(PROCESS_STEPS.length, 5);
    assert.equal((html.match(/class="step step--/g) || []).length, 5);
    assert.equal((html.match(/aria-current="step"/g) || []).length, 1);
    assert.match(html, /<li class="step step--current" data-step="4">\s*<a class="step__link" href="#recommendation" aria-current="step">/);
    const links = [...html.matchAll(/<li class="step step--\w+" data-step="(\d)">\s*<a class="step__link" href="#([^"]+)"/g)];
    assert.deepEqual(links.map((m) => [m[1], m[2]]), [['3', 'support-profile'], ['4', 'recommendation'], ['5', 'next-step']]);
    for (const [, , id] of links) assert.ok(html.includes(`id="${id}"`), `no section with id "${id}" for a step link`);
    assert.match(html, /<li class="step step--done" data-step="1">\s*<div class="step__link">/);
    assert.match(html, /<li class="step step--done" data-step="2">\s*<div class="step__link">/);
  });

  check(`sections in the requested order: ${fixture.name}`, () => {
    const order = ['class="steps"', 'class="radar"', 'id="class-title"', 'id="support-title"', 'class="cta"'];
    let last = -1;
    for (const marker of order) {
      const at = html.indexOf(marker);
      assert.ok(at > last, `${marker} out of order or missing`);
      last = at;
    }
    if (fixture.aiSummary) {
      assert.ok(html.indexOf('id="summary-title"') > html.indexOf('id="class-title"'));
      assert.ok(html.indexOf('id="summary-title"') < html.indexOf('id="support-title"'));
    } else {
      assert.ok(!html.includes('id="summary-title"'), 'summary section should be hidden when absent');
    }
  });

  check(`mobile viewport and noindex: ${fixture.name}`, () => {
    assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1/);
    assert.match(html, /<meta name="robots" content="noindex/);
  });

  check(`brand colours present: ${fixture.name}`, () => {
    assert.match(html, /--navy: #001020/);
    assert.match(html, /--teal: #009eb0/);
  });

  check(`asset files exist: ${fixture.name}`, () => {
    for (const [, src] of html.matchAll(/src="(\/assets\/[^"]+)"/g)) {
      assert.ok(fs.existsSync(path.join(__dirname, '..', 'public', src)), `${src} missing`);
    }
  });
}

check('unresolved axes read "To discuss", never 0', () => {
  const { html } = pages.find(({ fixture }) => fixture === fixtures.HYROX_UNRESOLVED);
  assert.equal((html.match(/To discuss/g) || []).length >= 6, true, 'radar labels and list rows');
  assert.doesNotMatch(html, /radar__score[^>]*>\s*0\s*</);
});

check('Foundation shows the progression card; Lift does not', () => {
  const foundation = pages.find(({ fixture }) => fixture === fixtures.FOUNDATION).html;
  const lift = pages.find(({ fixture }) => fixture === fixtures.LIFT).html;
  assert.match(foundation, /Where this leads/);
  assert.match(foundation, /progress you towards Hybrid/);
  assert.doesNotMatch(lift, /Where this leads/);
});

check('the internal class note is not shown to clients', () => {
  const { html } = pages.find(({ fixture }) => fixture === fixtures.FOUNDATION);
  assert.doesNotMatch(html, /Override applied/);
});

check('brand ownership: class at GymTEQ; physio and recovery at PhysioTEQ; nutrition with the ONETEQ Health team', () => {
  const { html } = pages.find(({ fixture }) => fixture === fixtures.LIFT);
  assert.match(html, /At GymTEQ/);
  const card = (title) => {
    const m = html.match(new RegExp('<h3>' + title + '</h3>[\\s\\S]*?</li>'));
    assert.ok(m, 'no card for ' + title);
    return m[0];
  };
  assert.match(card('Physiotherapy and clinical support'), /Physiotherapy and clinical support at PhysioTEQ/);
  assert.match(card('Recovery support'), /PhysioTEQ can help with rest, sleep and recovery work/);
  assert.match(card('Nutrition support'), /The ONETEQ Health team can help with practical advice on eating well/);
  assert.doesNotMatch(card('Recovery support') + card('Nutrition support'), /GymTEQ/);
  assert.doesNotMatch(card('Nutrition support'), /PhysioTEQ/);
  assert.doesNotMatch(html, /The team can help with/, 'a support card still says the generic "the team"');
});

check('support cards each have their own sentence, and the tag only shows when bands differ', () => {
  const lift = pages.find(({ fixture }) => fixture === fixtures.LIFT).html;
  const sentences = [...lift.matchAll(/<p>([^<]+)<\/p>\s*<\/li>/g)].map((m) => m[1]);
  assert.ok(sentences.length >= 4);
  assert.equal(new Set(sentences).size, sentences.length, 'two support cards share the same sentence');
  assert.doesNotMatch(lift, /Something the team can go through with you/);
  assert.match(lift, /class="badge"/, 'varied bands should show tags');
  const uniform = renderResultsPage({
    clientName: 'Uniform',
    result: { ...fixtures.LIFT.result, axes: { coaching: { score: 4.4 }, accountability: { score: 5 }, clinicalSupport: { score: 4.8 }, nutritionSupport: { score: 6.1 }, performanceFocus: { score: 5.8 }, recoverySupport: { score: 4.4 } } },
    aiSummary: '',
  });
  assert.doesNotMatch(uniform, /class="badge"/, 'identical bands should not show tags');
});

check('client name is escaped', () => {
  const { html } = pages.find(({ fixture }) => fixture === fixtures.NO_CLASS);
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.ok(html.includes('&lt;script&gt;'));
});

check('a result with no class still renders sensibly', () => {
  const { html } = pages.find(({ fixture }) => fixture === fixtures.NO_CLASS);
  assert.match(html, /To be confirmed with you/);
  assert.match(html, /We need a bit more from you/);
});

check('client page and staff shell do not depend on each other', () => {
  const lib = path.join(__dirname, '..', 'lib');
  const client = fs.readFileSync(path.join(lib, 'clientPage.js'), 'utf8');
  const staffShell = fs.readFileSync(path.join(lib, 'html.js'), 'utf8');
  assert.doesNotMatch(client, /require\(['"]\.\/html\.js['"]\)/, 'clientPage.js must not import html.js');
  assert.doesNotMatch(staffShell, /require\(['"]\.\/clientPage\.js['"]\)/, 'html.js must not import clientPage.js');
  // The staff shell is allowed prices (they live on the staff page); it just shares the brand tokens.
  const staffHtml = require('../lib/html.js').renderPage('Staff', '<p>£46.00 / month</p>');
  assert.match(staffHtml, /--navy: #001020/);
  assert.match(staffHtml, /£46\.00/);
});

check('the highlighted step follows the section in view (starts on 4, no JavaScript needed to be right on load)', () => {
  const { html } = pages.find(({ fixture }) => fixture === fixtures.LIFT);
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const mk = (num) => {
    const link = { attrs: num === 4 ? { 'aria-current': 'step' } : {}, setAttribute(k, v) { this.attrs[k] = v; }, removeAttribute(k) { delete this.attrs[k]; } };
    return { className: 'x', link, getAttribute: () => String(num), querySelector: () => link };
  };
  const steps = [1, 2, 3, 4, 5].map(mk);
  const tops = { 'support-profile': 900, recommendation: 1500, 'next-step': 2600 };
  const win = { innerHeight: 800, pageYOffset: 0, handler: null, addEventListener(type, fn) { this.handler = fn; }, requestAnimationFrame: (fn) => fn() };
  const doc = {
    querySelectorAll: () => steps,
    getElementById: (id) => (tops[id] === undefined ? null : { getBoundingClientRect: () => ({ top: tops[id] }) }),
    documentElement: { scrollHeight: 3400 },
  };
  vm.runInNewContext(script, { document: doc, window: win });
  const state = () => steps.map((s) => s.className.replace('step step--', '')).join(',');
  const active = () => steps.findIndex((s) => 'aria-current' in s.link.attrs) + 1;
  const scrollTo = (y) => {
    const shift = y;
    tops['support-profile'] = 900 - shift; tops.recommendation = 1500 - shift; tops['next-step'] = 2600 - shift;
    win.pageYOffset = y;
    win.handler();
  };
  assert.equal(active(), 4, 'step 4 is current on load');
  scrollTo(700); assert.equal(active(), 3); assert.equal(state(), 'done,done,current,todo,todo');
  scrollTo(1300); assert.equal(active(), 4); assert.equal(state(), 'done,done,done,current,todo');
  scrollTo(2400); assert.equal(active(), 5); assert.equal(state(), 'done,done,done,done,current');
  scrollTo(0); assert.equal(active(), 4, 'back at the top, step 4 again');
  scrollTo(2600); assert.equal(active(), 5, 'bottom of the page is always the last step');
});

// ---- Circuits rename: display only ----
const classLib = require('../lib/classNames.js');
const summaryLib = require('../lib/aiSummary.js');

check('"HYROX" appears nowhere in client-facing output, for every class and every progression', () => {
  const baseAxes = fixtures.LIFT.result.axes;
  const cases = [];
  for (const key of ['foundation', 'lift', 'hybrid', 'hyrox']) {
    cases.push({ classMatch: { bestStartingMatch: key, overrideApplied: false }, classScores: { foundation: 4, lift: 6, hybrid: 12, hyrox: 31 }, axes: baseAxes });
  }
  // Foundation start, progressing to the conditioning class
  cases.push({ classMatch: { bestStartingMatch: 'foundation', overrideApplied: true }, classScores: { foundation: 20, lift: 5, hybrid: 9, hyrox: 31 }, axes: baseAxes });
  for (const stored of cases) {
    // includes a summary stored before the rename, which still says the old name
    const html = renderResultsPage({ clientName: 'Rename Test', result: stored, aiSummary: 'HYROX is the class we recommend.\n\nThe eight HYROX race stations plus HYROX-style cardio.' });
    assert.doesNotMatch(html, /hyrox/i, `old name leaked for class ${stored.classMatch.bestStartingMatch}`);
  }
  const hyroxPage = renderResultsPage({ clientName: 'R', result: cases[3], aiSummary: '' });
  assert.match(hyroxPage, /class="class__name">Circuits</);
  const progressing = renderResultsPage({ clientName: 'R', result: cases[4], aiSummary: '' });
  assert.match(progressing, /Where this leads[\s\S]*?<h3>Circuits<\/h3>/);
  assert.match(progressing, /progress you towards Circuits/);
});

check('the AI summary is built, prompted and checked without the old name', () => {
  for (const info of Object.values(summaryLib.CLASS_INFO)) {
    assert.doesNotMatch(info.name + ' ' + info.meaning, /hyrox/i);
  }
  assert.equal(summaryLib.CLASS_INFO.hyrox.name, 'Circuits');
  assert.doesNotMatch(summaryLib.SYSTEM_PROMPT, /hyrox/i, 'the prompt must not teach the model the old name');
  const stored = { classMatch: { bestStartingMatch: 'hyrox', overrideApplied: false }, classScores: {}, axes: fixtures.LIFT.result.axes };
  const facts = summaryLib.buildSummaryFacts(stored, ['Prepare for a HYROX event', 'Conditioning/HYROX-style training', 'Get stronger']);
  assert.doesNotMatch(JSON.stringify(facts), /hyrox/i, 'facts handed to the model mention the old name');
  assert.ok(facts.goals.some((g) => /fitness racing/.test(g)), 'a goal about the sport is kept, without the brand');
  const prog = summaryLib.buildSummaryFacts({ classMatch: { bestStartingMatch: 'foundation', overrideApplied: true }, classScores: { lift: 3, hybrid: 5, hyrox: 30 }, axes: {} }, []);
  assert.equal(prog.progressingToward.name, 'Circuits');
  const words = Array.from({ length: 130 }, (_, i) => ['we', 'recommend', 'a', 'coached', 'class', 'for', 'you'][i % 7]).join(' ');
  assert.equal(summaryLib.validateSummary(words + ' and Circuits.').ok, true, 'a clean summary should pass');
  const rejected = summaryLib.validateSummary(words + ' and HYROX.');
  assert.equal(rejected.ok, false);
  assert.match(rejected.reason, /old class name/);
});

check('the positioning note survives the rename: Circuits is never presented as only for the fit or advanced', () => {
  assert.match(summaryLib.CLASS_INFO.hyrox.meaning, /Each exercise can be adapted to suit your ability, allowing you to work at your own pace/);
  assert.match(summaryLib.SYSTEM_PROMPT, /Never say or imply that Circuits is only for very fit, elite or advanced people/);
  assert.match(summaryLib.SYSTEM_PROMPT, /Do not compare classes by intensity/);
});

check('only the label changed: stored keys and the GHL class_match value are untouched', () => {
  assert.equal(classLib.classDisplayName('hyrox'), 'Circuits');
  assert.deepEqual(Object.keys(summaryLib.CLASS_INFO), ['foundation', 'lift', 'hybrid', 'hyrox']);
  const writer = fs.readFileSync(path.join(__dirname, '..', 'lib', 'writeAssessmentResult.js'), 'utf8');
  assert.match(writer, /result\.classMatch\.bestStartingMatch/, 'class_match is still written from the engine key');
  assert.doesNotMatch(writer, /classNames|classDisplayName|CLASS_DISPLAY_NAMES|Circuits/, 'the GHL writer must not use display names');
  const engine = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');
  assert.doesNotMatch(engine, /Circuits/, 'the scoring engine must not use the display name');
  assert.match(engine, /hyrox: Math\.max\(0, scores\.hyrox\)/, 'engine scoring key unchanged');
});

const OFFICIAL_CIRCUITS =
  "Circuits is a full-body workout combining strength and cardio exercises in one varied, energetic session. You'll move through a series of stations designed to improve cardiovascular fitness, strength, stamina and muscular endurance. Each exercise can be adapted to suit your ability, allowing you to work at your own pace while still challenging yourself. With a mixture of functional strength and cardio exercises, Circuits is a simple, effective and enjoyable way to get fitter and stronger.";

check('the Circuits description is the client\'s official wording, verbatim, wherever it is shown', () => {
  assert.equal(summaryLib.CLASS_INFO.hyrox.meaning, OFFICIAL_CIRCUITS);
  const stored = { classMatch: { bestStartingMatch: 'hyrox', overrideApplied: false }, classScores: {}, axes: fixtures.LIFT.result.axes };
  const page = renderResultsPage({ clientName: 'R', result: stored, aiSummary: '' });
  assert.ok(page.includes(OFFICIAL_CIRCUITS.split("'").join('&#39;')), 'class card does not carry the official text');
  const progressing = renderResultsPage({
    clientName: 'R',
    result: { classMatch: { bestStartingMatch: 'foundation', overrideApplied: true }, classScores: { foundation: 20, lift: 5, hybrid: 9, hyrox: 31 }, axes: fixtures.LIFT.result.axes },
    aiSummary: '',
  });
  assert.ok(progressing.includes(OFFICIAL_CIRCUITS.split("'").join('&#39;')), '"Where this leads" does not carry the official text');
  assert.doesNotMatch(OFFICIAL_CIRCUITS, /hyrox|eight|station[s]? plus/i);
});

check('no class description collides with the Circuits name', () => {
  assert.doesNotMatch(summaryLib.CLASS_INFO.lift.meaning, /circuit/i, 'Lift still uses the word circuit');
  assert.match(summaryLib.CLASS_INFO.lift.meaning, /^Lift always begins with a barbell lift, followed by a pair of weighted exercises done as a superset, and finishes with a final block of strength exercises\.$/);
  for (const key of ['foundation', 'hybrid']) assert.doesNotMatch(summaryLib.CLASS_INFO[key].meaning.replace(/Circuits\.$/, ''), /circuit/i);
});

check('the AI summary checks enforce brand ownership', () => {
  const words = Array.from({ length: 130 }, (_, i) => ['we', 'recommend', 'a', 'coached', 'class', 'for', 'you'][i % 7]).join(' ');
  const verdict = (sentence) => summaryLib.validateSummary(words + ' ' + sentence);
  for (const ok of [
    'The ONETEQ Health team can go through nutrition support with you.',
    'Fitness and metabolic testing with the ONETEQ Health team may be useful.',
    'Recovery work at PhysioTEQ could help.',
    'Physiotherapy at PhysioTEQ could help.',
  ]) assert.equal(verdict(ok).ok, true, 'should pass: ' + ok);
  for (const bad of [
    'Nutrition support with PhysioTEQ could help.',
    'Nutrition support at GymTEQ could help.',
    'Fitness and metabolic testing at GymTEQ may be useful.',
    'Recovery support at GymTEQ could help.',
    'You can train at ONETEQ.',
    'Speak to the ONETEQ team.',
  ]) assert.equal(verdict(bad).ok, false, 'should be rejected: ' + bad);
  const stored = { classMatch: { bestStartingMatch: 'lift' }, axes: {}, tieredPackages: { recommended: { lineItems: [
    { productId: 'nutrition_essentials' }, { productId: 'sports_massage' }, { productId: 'rmr_test' }, { productId: 'physio_initial' },
  ] } } };
  const areas = summaryLib.buildSummaryFacts(stored, []).supportAreas;
  assert.deepEqual(areas, [
    'nutrition support with the ONETEQ Health team',
    'sports massage and recovery work at PhysioTEQ',
    'fitness and metabolic testing with the ONETEQ Health team',
    'physiotherapy at PhysioTEQ',
  ]);
  assert.match(summaryLib.SYSTEM_PROMPT, /ONETEQ Health team/);
});

check('the call to action label and constant', () => {
  const clientLib = require('../lib/clientPage.js');
  assert.equal(clientLib.CTA_LABEL, 'Click here to discuss pricing or request a call back from one of the team');
  assert.equal(clientLib.CTA_URL, 'https://api.leadconnectorhq.com/widget/form/DTWPdtZQOy8n4PrDba3x', 'the call to action opens the GHL contact form');
  const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'clientPage.js'), 'utf8');
  assert.equal((src.match(/^const CTA_URL = /gm) || []).length, 1, 'CTA_URL must stay a single named constant');
});

check('message pages are branded and price-free', () => {
  for (const html of messages) {
    assert.match(html, /--navy: #001020/);
    assert.doesNotMatch(visibleText(html), PRICE_WORDS);
  }
});

if (process.exitCode) {
  console.error('Client page tests FAILED');
} else {
  console.log(`Client page tests passed (${passed} checks)`);
}
