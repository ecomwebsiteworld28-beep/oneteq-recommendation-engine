// Client-facing results page, in ONETEQ's brand (dark navy, teal accent).
//
// Pure rendering: takes the stored assessment result plus the stored AI
// summary and returns HTML, so it can be tested without GHL. Deliberately
// separate from lib/html.js, which the staff page still uses.
//
// No prices anywhere on this page. The tiered packages are staff-only;
// nothing here reads recommendedPackage or tieredPackages, and
// tests/clientPage.test.js fails the build if a price ever appears.

const { escapeHtml } = require('./escape.js');
const { renameLegacyClassName } = require('./classNames.js');
const { BRAND_BASE_CSS } = require('./brandTokens.js');
const { buildSummaryFacts, relevanceBand } = require('./aiSummary.js');

// Where the call to action points: the contact form (built in GoHighLevel) where a
// client can ask about pricing or request a call back. It is a full-page GHL form
// (the /widget/form/ URL renders on its own, no embedding needed). One line to change.
const CTA_URL = 'https://api.leadconnectorhq.com/widget/form/DTWPdtZQOy8n4PrDba3x';
const CTA_LABEL = 'Click here to discuss pricing or request a call back from one of the team';

const ASSET_BASE = '/assets';

// target = id of the section on this page that the step jumps to. Steps 1 and
// 2 (answering the questions, the scoring) happened before this page and have
// no section of their own, so they are not links.
const PROCESS_STEPS = [
  { title: 'Assessment', text: '22 questions across goals, activity, confidence and health' },
  { title: 'Analysis', text: 'Our scoring engine reviews your needs across seven key areas' },
  { title: 'Support profile', text: 'Your personalised radar shows what matters most', target: 'support-profile' },
  { title: 'Your recommendation', text: 'Your best starting class at GymTEQ, and the support that looks relevant', target: 'recommendation' },
  { title: 'Next step', text: 'Talk it through with the team', target: 'next-step' },
];
const CURRENT_STEP = 4; // 1-based: the page itself is "Your recommendation"

// Radar order and short labels (the full names appear in the list below it).
const RADAR_AXES = [
  { key: 'training', label: 'Training', name: 'Training' },
  { key: 'coaching', label: 'Coaching', name: 'Coaching and technique' },
  { key: 'accountability', label: 'Accountability', name: 'Structure and accountability' },
  { key: 'clinicalSupport', label: 'Clinical', name: 'Physiotherapy and clinical support' },
  { key: 'nutritionSupport', label: 'Nutrition', name: 'Nutrition support' },
  { key: 'performanceFocus', label: 'Performance', name: 'Performance and event focus' },
  { key: 'recoverySupport', label: 'Recovery', name: 'Recovery support' },
];

// Support areas shown as cards. "Training" is how much the client wants to
// train, not a support need, so it is on the radar but not here. Brand names
// only where the client has confirmed them: physio and clinical and recovery are
// PhysioTEQ; nutrition (and metabolic testing) are the ONETEQ Health team.
const SUPPORT_AREAS = {
  coaching: { title: 'Coaching and technique', text: 'Guidance with your programme and your technique.' },
  accountability: { title: 'Structure and accountability', text: 'Help staying consistent with your training.' },
  clinicalSupport: { title: 'Physiotherapy and clinical support', text: 'Physiotherapy and clinical support at PhysioTEQ.', where: 'PhysioTEQ' },
  nutritionSupport: { title: 'Nutrition support', text: 'The ONETEQ Health team can help with practical advice on eating well around your training and your goals.' },
  performanceFocus: { title: 'Performance and event focus', text: 'Preparing for a sport, event or physical challenge.' },
  recoverySupport: { title: 'Recovery support', text: 'PhysioTEQ can help with rest, sleep and recovery work, so your body adapts well between sessions.', where: 'PhysioTEQ' },
};
const RELEVANT_FROM = 4; // moderate relevance and above (see relevanceBand)

function formatScore(score) {
  return Number.isInteger(score) ? String(score) : score.toFixed(1);
}

function isScored(axis) {
  return Boolean(axis) && !axis.unresolved && typeof axis.score === 'number';
}

// ---- Sections ----

function renderHero(clientName) {
  return `
  <header class="hero">
    <img class="hero__img" src="${ASSET_BASE}/hero.jpg" width="1400" height="933" alt="" fetchpriority="high" />
    <div class="hero__shade"></div>
    <div class="wrap hero__body">
      <img class="hero__logo" src="${ASSET_BASE}/logo-white.png" width="720" height="160" alt="ONETEQ Health" />
      <p class="eyebrow">Your assessment results</p>
      <h1 class="hero__name">${escapeHtml(clientName)}</h1>
    </div>
  </header>`;
}

function renderProcessStrip() {
  const steps = PROCESS_STEPS.map((step, index) => {
    const number = index + 1;
    const state = number === CURRENT_STEP ? 'current' : number < CURRENT_STEP ? 'done' : 'todo';
    const inner = `
        <span class="step__num" aria-hidden="true">${number}</span>
        <span class="step__text"><strong>${escapeHtml(step.title)}</strong><span>${escapeHtml(step.text)}</span></span>`;
    const current = number === CURRENT_STEP ? ' aria-current="step"' : '';
    return `
      <li class="step step--${state}" data-step="${number}">
        ${step.target ? `<a class="step__link" href="#${step.target}"${current}>${inner}
        </a>` : `<div class="step__link"${current}>${inner}
        </div>`}
      </li>`;
  }).join('');
  return `
  <section class="wrap section" aria-label="How your assessment works">
    <ol class="steps">${steps}
    </ol>
    <p class="note">Tap a step to jump to that part of the page.</p>
  </section>`;
}

// Square-ish viewBox with room either side so the longest label
// ("Accountability") is never clipped; scores sit under each label in teal.
// An unresolved axis plots at the centre and reads "To discuss", never a
// score of zero.
function renderRadar(axes) {
  const width = 410;
  const height = 305;
  const cx = width / 2;
  const cy = 168;
  const maxRadius = 90;
  const labelRadius = 104;
  const step = (2 * Math.PI) / RADAR_AXES.length;
  const point = (index, radius) => {
    const angle = step * index - Math.PI / 2;
    return { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) };
  };
  const fmt = (p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`;

  const rings = [0.2, 0.4, 0.6, 0.8, 1]
    .map((f) => `<polygon points="${RADAR_AXES.map((_, i) => fmt(point(i, maxRadius * f))).join(' ')}" class="radar__ring" />`)
    .join('');
  const spokes = RADAR_AXES.map((_, i) => {
    const p = point(i, maxRadius);
    return `<line x1="${cx}" y1="${cy}" x2="${p.x.toFixed(1)}" y2="${p.y.toFixed(1)}" class="radar__spoke" />`;
  }).join('');

  const dataPoints = RADAR_AXES.map((axis, i) => {
    const data = axes[axis.key];
    const score = isScored(data) ? Math.max(0, Math.min(data.score, 10)) : 0;
    return point(i, (score / 10) * maxRadius);
  });
  const dots = RADAR_AXES.map((axis, i) =>
    isScored(axes[axis.key]) ? `<circle cx="${dataPoints[i].x.toFixed(1)}" cy="${dataPoints[i].y.toFixed(1)}" r="4.5" class="radar__dot" />` : '',
  ).join('');

  const labels = RADAR_AXES.map((axis, i) => {
    const p = point(i, labelRadius);
    const data = axes[axis.key];
    const anchor = Math.abs(p.x - cx) < 2 ? 'middle' : p.x > cx ? 'start' : 'end';
    // Push top/bottom labels slightly further out so the two lines clear the chart.
    const dy = Math.abs(p.x - cx) < 2 ? -6 : p.y > cy + 40 ? 6 : 0;
    const scoreText = isScored(data) ? formatScore(data.score) : 'To discuss';
    const scoreClass = isScored(data) ? 'radar__score' : 'radar__score radar__score--muted';
    return `<text x="${p.x.toFixed(1)}" y="${(p.y + dy).toFixed(1)}" text-anchor="${anchor}" class="radar__label">
      <tspan x="${p.x.toFixed(1)}" dy="-0.2em">${escapeHtml(axis.label)}</tspan>
      <tspan x="${p.x.toFixed(1)}" dy="1.3em" class="${scoreClass}">${escapeHtml(scoreText)}</tspan>
    </text>`;
  }).join('');

  const rows = RADAR_AXES.map((axis) => {
    const data = axes[axis.key];
    const scored = isScored(data);
    return `
      <li class="axis">
        <span class="axis__name">${escapeHtml(axis.name)}</span>
        <span class="axis__bar" aria-hidden="true"><span style="width:${scored ? Math.max(0, Math.min(data.score, 10)) * 10 : 0}%"></span></span>
        <span class="axis__score${scored ? '' : ' axis__score--muted'}">${scored ? `${escapeHtml(formatScore(data.score))}<small>/10</small>` : 'To discuss'}</span>
      </li>`;
  }).join('');

  return `
  <section class="wrap section" id="support-profile" aria-labelledby="radar-title">
    <p class="eyebrow">Your support profile</p>
    <h2 id="radar-title">Seven key areas</h2>
    <div class="card radar-card">
      <svg class="radar" viewBox="0 0 ${width} ${height}" role="img" aria-label="Radar chart of your scores across seven areas; the list below gives each one">
        ${rings}${spokes}
        <polygon points="${dataPoints.map(fmt).join(' ')}" class="radar__shape" />
        ${dots}${labels}
      </svg>
      <ul class="axes">${rows}
      </ul>
      <p class="note">Scores run from 0 to 10. A higher score means more support would help in that area. It is not a mark of how well you are doing.</p>
    </div>
  </section>`;
}

// hasSummary: the summary section above already owns the #recommendation anchor (step 4 lands
// there), so this section gets #class-detail instead. With no summary, it owns #recommendation.
function renderClass(facts, hasSummary) {
  const sectionId = hasSummary ? 'class-detail' : 'recommendation';
  // With a summary above, the summary already opens the recommendation, so this card is the detail.
  const eyebrow = hasSummary ? 'The class in detail' : 'Your best starting class';
  if (!facts) {
    return `
  <section class="wrap section" id="${sectionId}" aria-labelledby="class-title">
    <p class="eyebrow">${eyebrow}</p>
    <h2 id="class-title">To be confirmed with you</h2>
    <div class="card"><p>We will confirm the best place for you to start when we talk it through together.</p></div>
  </section>`;
  }
  const progression =
    facts.startedAtFoundationByDesign && facts.progressingToward
      ? `
      <div class="card card--accent progression">
        <p class="eyebrow">Where this leads</p>
        <h3>${escapeHtml(facts.progressingToward.name)}</h3>
        <p>Starting in Foundation is deliberate. We build a sound base first, then look to progress you towards ${escapeHtml(facts.progressingToward.name)}.</p>
        <p class="muted">${escapeHtml(facts.progressingToward.meaning)}</p>
      </div>`
      : '';
  return `
  <section class="wrap section" id="${sectionId}" aria-labelledby="class-title">
    <p class="eyebrow">${eyebrow}</p>
    <div class="class-grid${progression ? ' class-grid--pair' : ''}">
    <div class="card card--class">
      <h2 id="class-title" class="class__name">${escapeHtml(facts.startingClass.name)}</h2>
      <p class="pill">At GymTEQ</p>
      <p>${escapeHtml(facts.startingClass.meaning)}</p>
    </div>${progression}
    </div>
  </section>`;
}

function renderSummary(aiSummary) {
  const text = renameLegacyClassName(String(aiSummary || '').trim());
  if (!text) return '';
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => `<p>${escapeHtml(p.trim())}</p>`)
    .join('');
  return `
  <section class="wrap section" id="recommendation" aria-labelledby="summary-title">
    <p class="eyebrow">Your recommendation</p>
    <h2 id="summary-title">Your summary</h2>
    <div class="card prose">${paragraphs}</div>
  </section>`;
}

function renderSupport(axes) {
  const scored = Object.keys(SUPPORT_AREAS)
    .filter((key) => isScored(axes[key]))
    .map((key) => ({ key, score: axes[key].score }))
    .sort((a, b) => b.score - a.score);
  const relevant = scored.filter((entry) => entry.score >= RELEVANT_FROM);
  const toDiscuss = Object.keys(SUPPORT_AREAS).filter((key) => !isScored(axes[key]));

  // When every card sits in the same band the tag says nothing; the order already shows priority.
  const showBands = new Set(relevant.map(({ score }) => relevanceBand(score))).size > 1;
  let body;
  if (relevant.length) {
    body = `<ul class="support">${relevant
      .map(({ key, score }) => {
        const area = SUPPORT_AREAS[key];
        return `
      <li class="card support__item">
        <div class="support__head">
          <h3>${escapeHtml(area.title)}</h3>
          ${showBands ? `<span class="badge">${escapeHtml(relevanceBand(score))} relevance</span>` : ''}
        </div>
        <p>${escapeHtml(area.text)}</p>
      </li>`;
      })
      .join('')}
    </ul>`;
  } else {
    body = `<div class="card"><p>We need a bit more from you before we can say where support would help most, so we would like to go through that with you.</p></div>`;
  }

  const discuss =
    relevant.length && toDiscuss.length
      ? `<p class="note">We would also like to go through these with you: ${escapeHtml(
          toDiscuss.map((key) => SUPPORT_AREAS[key].title.toLowerCase()).join(', ').replace(/, ([^,]*)$/, ', and $1'),
        )}.</p>`
      : '';

  return `
  <section class="wrap section" aria-labelledby="support-title">
    <p class="eyebrow">Support that looks relevant</p>
    <h2 id="support-title">Where we can help</h2>
    ${body}
    ${discuss}
  </section>`;
}

function renderCta() {
  return `
  <section class="cta" id="next-step" aria-labelledby="cta-title">
    <img class="cta__img" src="${ASSET_BASE}/team.jpg" width="1400" height="933" alt="A ONETEQ coach guiding a client through a rope exercise at GymTEQ" loading="lazy" />
    <div class="cta__shade"></div>
    <div class="wrap cta__body">
      <p class="eyebrow">Your next step</p>
      <h2 id="cta-title">Talk it through with the team</h2>
      <a class="button" href="${escapeHtml(CTA_URL)}">${escapeHtml(CTA_LABEL)}</a>
    </div>
  </section>`;
}

// Without this the highlight stays on step 4 (the right answer on load). Once
// the steps are links, tapping 3 or 5 lands in a section whose step is not
// the highlighted one, so the highlight follows the section in view.
// Progressive enhancement: with no JavaScript it simply stays on step 4.
const STEP_SPY_SCRIPT = `<script>
(function () {
  var steps = document.querySelectorAll('.step');
  // Page order is: summary (recommendation), radar (support profile), class card, ..., call to action.
  // Either #recommendation or #class-detail is the first part of step 4, depending on whether a summary exists.
  var targets = [['recommendation', 4], ['class-detail', 4], ['support-profile', 3], ['next-step', 5]];
  if (!steps.length) return;
  var current = 0;
  function setCurrent(n) {
    if (n === current) return;
    current = n;
    for (var i = 0; i < steps.length; i++) {
      var num = Number(steps[i].getAttribute('data-step'));
      steps[i].className = 'step step--' + (num < n ? 'done' : num === n ? 'current' : 'todo');
      var link = steps[i].querySelector('.step__link');
      if (num === n) link.setAttribute('aria-current', 'step'); else link.removeAttribute('aria-current');
    }
  }
  function update() {
    var line = window.innerHeight * 0.4;
    var n = 4;
    var nearest = -Infinity;
    for (var i = 0; i < targets.length; i++) {
      var el = document.getElementById(targets[i][0]);
      if (!el) continue;
      var top = el.getBoundingClientRect().top;
      if (top <= line && top > nearest) { nearest = top; n = targets[i][1]; }
    }
    // Only when the page actually scrolls: on a screen tall enough to show it all, the bottom is not 'reached'.
    var scrolls = document.documentElement.scrollHeight > window.innerHeight + 40;
    if (scrolls && window.innerHeight + window.pageYOffset >= document.documentElement.scrollHeight - 4) n = 5;
    setCurrent(n);
  }
  var queued = false;
  window.addEventListener('scroll', function () {
    if (queued) return;
    queued = true;
    window.requestAnimationFrame(function () { queued = false; update(); });
  }, { passive: true });
  update();
})();
</script>`;

// ---- Shell ----

const STYLES = `
${BRAND_BASE_CSS}
  .section { padding-top: 40px; }

  /* Hero */
  .hero { position: relative; overflow: hidden; min-height: 300px; display: flex; align-items: flex-end; }
  .hero__img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
  .hero__shade { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(0,16,32,0.55) 0%, rgba(0,16,32,0.82) 62%, var(--navy) 100%); }
  .hero__body { position: relative; padding-top: 28px; padding-bottom: 28px; }
  .hero__logo { width: 168px; margin-bottom: 56px; }
  .hero__name { font-size: 1.9rem; overflow-wrap: anywhere; hyphens: auto; }

  /* Process strip: vertical on phones, five across from tablet up */
  .steps { list-style: none; margin: 0; padding: 0; display: grid; gap: 0; counter-reset: none; }
  .step { position: relative; padding-bottom: 18px; }
  .step__link { display: flex; gap: 14px; color: inherit; text-decoration: none; border-radius: 12px; }
  a.step__link:hover .step__num { border-color: var(--teal); color: var(--teal); }
  a.step__link:hover .step__text strong { color: var(--teal); }
  #support-profile, #recommendation, #class-detail, #next-step { scroll-margin-top: 12px; }
  .step:last-child { padding-bottom: 0; }
  .step::before { content: ""; position: absolute; left: 15px; top: 32px; bottom: 0; width: 2px; background: var(--line); }
  .step:last-child::before { display: none; }
  .step__num { flex: none; width: 32px; height: 32px; border-radius: 50%; display: grid; place-items: center; font-weight: 800; font-size: 0.9rem; border: 2px solid var(--line); color: var(--muted); background: var(--navy); position: relative; z-index: 1; }
  .step__text { display: flex; flex-direction: column; font-size: 0.9rem; color: var(--muted); padding-top: 3px; }
  .step__text strong { color: var(--white); font-size: 0.98rem; }
  .step--done .step__num { border-color: var(--teal); color: var(--teal); }
  .step--current .step__num { background: var(--teal); border-color: var(--teal); color: var(--navy); box-shadow: 0 0 0 4px rgba(0, 158, 176, 0.25); }
  .step--current .step__text strong { color: var(--teal); }
  .step--current .step__text { color: var(--white); }

  /* Radar */
  .radar { width: 100%; max-width: 460px; margin: 0 auto; height: auto; display: block; overflow: visible; }
  .radar__ring, .radar__spoke { fill: none; stroke: rgba(255,255,255,0.16); stroke-width: 1; }
  .radar__shape { fill: rgba(0, 158, 176, 0.32); stroke: var(--teal); stroke-width: 2.5; stroke-linejoin: round; }
  .radar__dot { fill: var(--teal); stroke: var(--navy); stroke-width: 2; }
  .radar__label { fill: var(--white); font-size: 15px; font-weight: 600; }
  .radar__score { fill: var(--teal); font-size: 17px; font-weight: 800; }
  .radar__score--muted { fill: var(--faint); font-size: 13px; font-weight: 600; }
  .axes { list-style: none; margin: 20px 0 0; padding: 0; display: grid; gap: 14px; }
  .axis { display: grid; grid-template-columns: 1fr auto; gap: 6px 12px; align-items: center; font-size: 0.92rem; }
  .axis__bar { grid-column: 1 / -1; grid-row: 2; height: 6px; border-radius: 3px; background: rgba(255,255,255,0.1); overflow: hidden; }
  .axis__bar span { display: block; height: 100%; background: var(--teal); border-radius: 3px; }
  .axis__score { font-weight: 800; color: var(--teal); }
  .axis__score small { font-weight: 600; color: var(--faint); margin-left: 2px; }
  .axis__score--muted { color: var(--faint); font-weight: 600; }

  /* Class */
  .card--class { border-color: var(--teal); background: linear-gradient(160deg, var(--surface-2), var(--surface)); }
  .class__name { font-size: 2.2rem; color: var(--white); margin-bottom: 10px; }
  .progression h3 { font-size: 1.5rem; margin-bottom: 8px; }
  .progression .muted { margin-bottom: 0; font-size: 0.92rem; }

  /* Summary */
  .prose p { color: var(--muted); }
  .prose p:last-child { margin-bottom: 0; }

  /* Support */
  .support { list-style: none; margin: 0; padding: 0; display: grid; gap: 12px; }
  .support__item + .support__item { margin-top: 0; }
  .support__head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px 12px; margin-bottom: 8px; }
  .support__item p { margin: 0; color: var(--muted); font-size: 0.95rem; }

  /* Call to action */
  .cta { position: relative; overflow: hidden; margin-top: 48px; min-height: 340px; display: flex; align-items: center; }
  .cta__img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
  .cta__shade { position: absolute; inset: 0; background: linear-gradient(180deg, var(--navy) 0%, rgba(0,16,32,0.8) 40%, rgba(0,16,32,0.9) 100%); }
  .cta__body { position: relative; padding-top: 56px; padding-bottom: 56px; }
  .cta__body h2 { margin-bottom: 22px; }

  .foot { text-align: center; color: var(--faint); font-size: 0.8rem; padding: 24px 20px 32px; }

  /* Message pages (not found, no result yet) */
  .message { min-height: 60vh; display: flex; flex-direction: column; justify-content: center; }
  .message h1 { font-size: 1.7rem; margin-bottom: 12px; }

  @media (min-width: 640px) {
    .hero { min-height: 380px; }
    .hero__logo { width: 210px; }
    .hero__name { font-size: 3rem; }
    .section { padding-top: 56px; }
    .axes { grid-template-columns: 1fr 1fr; gap: 16px 32px; }
  }
  @media (min-width: 820px) {
    .wrap { max-width: 920px; }
    .steps { grid-template-columns: repeat(5, 1fr); gap: 12px; }
    .step { padding-bottom: 0; }
    .step__link { flex-direction: column; gap: 10px; }
    .step::before { left: 32px; right: -12px; top: 15px; bottom: auto; width: auto; height: 2px; }
    .step__text { padding-top: 0; }
  }
  /* Wide screens: widen the column and use the space, but keep reading lines short. */
  .class-grid { display: grid; gap: 12px; }
  .class-grid .card + .card { margin-top: 0; }
  @media (min-width: 900px) {
    .wrap { max-width: 1040px; }
    .radar-card { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 8px 40px; align-items: center; }
    .radar-card .axes { grid-template-columns: 1fr; margin-top: 0; }
    .radar-card .note { grid-column: 1 / -1; }
    .class-grid--pair { grid-template-columns: 1fr 1fr; align-items: stretch; }
    .support { grid-template-columns: 1fr 1fr; }
    .prose { max-width: 760px; }
  }
  @media (prefers-reduced-motion: no-preference) {
    html { scroll-behavior: smooth; }
    .button { transition: filter 0.15s ease; }
  }
`;

function renderShell(title, bodyHtml) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="theme-color" content="#001020" />
<meta name="robots" content="noindex, nofollow" />
<title>${escapeHtml(title)}</title>
<style>${STYLES}</style>
</head>
<body>
${bodyHtml}
<footer class="foot">ONETEQ Health</footer>
</body>
</html>`;
}

// A short branded page for errors and "no result yet".
function renderMessagePage(title, heading, message) {
  return renderShell(
    title,
    `<main class="wrap message">
    <img class="hero__logo" src="${ASSET_BASE}/logo-white.png" width="720" height="160" alt="ONETEQ Health" style="margin-bottom: 40px" />
    <h1>${escapeHtml(heading)}</h1>
    <p class="muted">${escapeHtml(message)}</p>
  </main>`,
  );
}

// result: the stored Assessment_Raw_Response object. aiSummary: the stored
// summary text (may be empty).
function renderResultsPage({ clientName, result, aiSummary }) {
  const stored = result || {};
  const axes = stored.axes || {};
  const facts = buildSummaryFacts(stored, []);
  const name = clientName || 'Your results';
  // Hidden entirely when nothing is stored: the strip then flows straight into the radar.
  const summaryHtml = renderSummary(aiSummary);
  return renderShell(
    `Your ONETEQ assessment — ${name}`,
    `<main>${renderHero(name)}${renderProcessStrip()}${summaryHtml}${renderRadar(axes)}${renderClass(facts, Boolean(summaryHtml))}${renderSupport(axes)}${renderCta()}
</main>
${STEP_SPY_SCRIPT}`,
  );
}

module.exports = { renderResultsPage, renderMessagePage, CTA_URL, CTA_LABEL, PROCESS_STEPS };
