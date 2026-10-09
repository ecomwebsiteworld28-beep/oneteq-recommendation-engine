// The pages a visitor sees instead of their results when those are not ready yet. All are branded,
// all are HTTP 200, none looks like an error: arriving before scoring has landed is normal.

const { escapeHtml } = require('./escape.js');
const { renderShell, ASSET_BASE, CTA_URL, CTA_LABEL } = require('./clientPage.js');

// How many automatic retries before a soft fallback: about 2 s apart plus the time each check takes.
const MAX_SLOW_TRIES = 15; // answers not on the contact yet, or GHL slow: roughly 40 to 60 s in all
const MAX_NOT_FOUND_TRIES = 5; // GHL does not know the id: a wrong link should not spin for a minute

const PREP_CSS = `
  .prep { min-height: 70vh; display: flex; flex-direction: column; justify-content: center; }
  .prep h1 { font-size: 1.9rem; margin-bottom: 12px; }
  .prep__bar { margin-top: 28px; height: 6px; border-radius: 3px; background: rgba(255,255,255,0.1); overflow: hidden; max-width: 420px; }
  .prep__bar span { display: block; height: 100%; width: 40%; border-radius: 3px; background: var(--teal); }
  @media (prefers-reduced-motion: no-preference) {
    .prep__bar span { animation: prep-slide 1.3s ease-in-out infinite; }
  }
  @keyframes prep-slide { 0% { transform: translateX(-100%); } 100% { transform: translateX(260%); } }
`;

function logo() {
  return `<img class="hero__logo" src="${ASSET_BASE}/logo-white.png" width="720" height="160" alt="ONETEQ Health" style="margin-bottom: 40px" />`;
}

// attempt: how many checks have been made so far. The script keeps checking (a lightweight request
// that runs the same logic as the page) and moves on as soon as the answer is ready or it gives up.
function renderPreparingPage({ attempt = 0 } = {}) {
  const n = Math.max(0, Math.min(Number(attempt) || 0, 99));
  return renderShell(
    'Preparing your ONETEQ results',
    `<style>${PREP_CSS}</style>
<main class="wrap message prep">
  ${logo()}
  <p class="eyebrow">Your assessment</p>
  <h1>Preparing your results</h1>
  <p class="muted">This takes a few seconds. This page opens your results by itself as soon as they are ready.</p>
  <div class="prep__bar" role="progressbar" aria-label="Preparing your results"><span></span></div>
  <noscript><p class="note"><a href="?w=${n + 1}">Open my results</a></p></noscript>
</main>
<script>
(function () {
  var n = ${n};
  var path = location.pathname;
  function done(state) {
    // ready -> the real page; anything else -> the soft page (the server decides from the count)
    location.replace(state === 'ready' ? path : path + '?w=' + n);
  }
  function tick() {
    n += 1;
    fetch(path + '?w=' + n, { cache: 'no-store', headers: { 'X-Results-Poll': '1' } })
      .then(function (r) {
        var state = r.headers.get('X-Results-State');
        if (state && state !== 'preparing') done(state);
        else setTimeout(tick, 2000);
      })
      .catch(function () { setTimeout(tick, 2500); });
  }
  setTimeout(tick, 1800);
})();
</script>`,
  );
}

// kind: 'gaveup' (results are still being prepared after the retries) or 'notfound' (GHL does not know the id).
function renderSoftPage({ kind, retryHref = '' }) {
  const notFound = kind === 'notfound';
  const heading = notFound ? "We can't find those results" : 'Your results are taking a little longer';
  const text = notFound
    ? 'Please check the link you were given. If it looks right, get in touch with the team and we will sort it out.'
    : 'They are saved to this link and will appear here shortly. Please try again in a minute.';
  const action = notFound
    ? `<a class="button" href="${escapeHtml(CTA_URL)}">${escapeHtml(CTA_LABEL)}</a>`
    : `<a class="button" href="${escapeHtml(retryHref || '?')}">Try again</a>`;
  return renderShell(
    notFound ? 'Results not found' : 'Your ONETEQ results',
    `<main class="wrap message">
  ${logo()}
  <p class="eyebrow">Your assessment</p>
  <h1>${escapeHtml(heading)}</h1>
  <p class="muted">${escapeHtml(text)}</p>
  <p style="margin-top: 24px">${action}</p>
</main>`,
  );
}

module.exports = { renderPreparingPage, renderSoftPage, MAX_SLOW_TRIES, MAX_NOT_FOUND_TRIES };
