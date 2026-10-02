// Run with `npm test`; vercel.json runs it as the build command, so a
// failure here stops a deploy. No framework: plain assert.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
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
    const text = visibleText(html);
    assert.doesNotMatch(html, /[£$€]/, 'currency symbol in page');
    assert.doesNotMatch(text, PRICE_WORDS, 'price wording in page text');
    for (const value of PRICE_VALUES) assert.ok(!html.includes(value), `price value ${value} leaked into page`);
  });

  check(`exactly one call to action: ${fixture.name}`, () => {
    assert.equal((html.match(/class="button"/g) || []).length, 1);
    assert.ok(html.includes(`href="${CTA_URL}"`));
    assert.ok(html.includes(CTA_LABEL));
  });

  check(`five-step process with the fourth current: ${fixture.name}`, () => {
    assert.equal(PROCESS_STEPS.length, 5);
    assert.equal((html.match(/class="step step--/g) || []).length, 5);
    assert.equal((html.match(/aria-current="step"/g) || []).length, 1);
    assert.match(html, /step--current"[^>]*aria-current="step">\s*<span class="step__num"[^>]*>4</);
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

check('class sits at GymTEQ and physio at PhysioTEQ; other areas carry no brand', () => {
  const { html } = pages.find(({ fixture }) => fixture === fixtures.LIFT);
  assert.match(html, /At GymTEQ/);
  assert.match(html, /Physiotherapy and clinical support at PhysioTEQ/);
  assert.doesNotMatch(html, /(?:nutrition|recovery)[^<]{0,40}(?:GymTEQ|PhysioTEQ)/i);
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
