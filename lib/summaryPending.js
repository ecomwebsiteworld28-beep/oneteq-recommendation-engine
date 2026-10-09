// The "we're writing your summary" placeholder on the client results page, and the small script that
// swaps the text in when it lands.
//
// The summary is written by the workflow's summary webhook (a few seconds after scoring). The page
// does NOT generate it and cannot: the generating endpoint stays behind its secret. The page only
// polls a read-only status endpoint and shows whatever it returns. If nothing arrives in time the
// placeholder is removed and the page is simply complete without it (the summary will be there on
// the next visit).

const POLL_FIRST_MS = 2500;
const POLL_EVERY_MS = 3000;
const POLL_MAX = 12; // about 38 s in all

// Contact ids are alphanumeric. Anything else is never put into the page.
const SAFE_ID = /^[A-Za-z0-9]{8,40}$/;

const SUMMARY_PENDING_CSS = `
  .summary-skeleton { position: relative; overflow: hidden; }
  .summary-skeleton__label { color: var(--muted); font-size: 0.95rem; margin-bottom: 16px; }
  .skel { display: block; height: 12px; border-radius: 6px; margin: 0 0 12px; background: linear-gradient(90deg, rgba(255,255,255,0.06) 25%, rgba(0,158,176,0.22) 50%, rgba(255,255,255,0.06) 75%); background-size: 200% 100%; }
  .skel--short { width: 62%; }
  @media (prefers-reduced-motion: no-preference) {
    .skel { animation: skel-shimmer 1.4s ease-in-out infinite; }
    .summary-in { animation: summary-fade 0.6s ease both; }
  }
  @keyframes skel-shimmer { 0% { background-position: 100% 0; } 100% { background-position: -100% 0; } }
  @keyframes summary-fade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
`;

function renderSummaryPlaceholder() {
  return `
  <section class="wrap section" id="recommendation" aria-labelledby="summary-title" data-summary-pending>
    <p class="eyebrow">Your recommendation</p>
    <h2 id="summary-title">Your summary</h2>
    <div class="card prose summary-skeleton" aria-live="polite" aria-busy="true">
      <p class="summary-skeleton__label">We're writing your personal summary&hellip;</p>
      <span class="skel"></span><span class="skel"></span><span class="skel skel--short"></span>
    </div>
  </section>`;
}

// Returns '' for an id that is not a plain GHL contact id, so nothing odd can reach the page.
function summaryPollScript(contactId) {
  if (!SAFE_ID.test(String(contactId || ''))) return '';
  return `<script>
(function () {
  var section = document.querySelector('[data-summary-pending]');
  if (!section) return;
  var id = ${JSON.stringify(String(contactId))};
  var tries = 0;
  function giveUp() {
    // No summary after all: remove the block and hand the "recommendation" anchor back to the class card.
    if (section.parentNode) section.parentNode.removeChild(section);
    var cls = document.getElementById('class-detail');
    if (cls) {
      cls.id = 'recommendation';
      var eyebrow = cls.querySelector('.eyebrow');
      if (eyebrow) eyebrow.textContent = 'Your best starting class';
    }
  }
  function show(text) {
    var card = section.querySelector('.card');
    card.className = 'card prose summary-in';
    card.removeAttribute('aria-busy');
    card.innerHTML = '';
    text.split(/\\n\\s*\\n/).forEach(function (part) {
      if (!part.trim()) return;
      var p = document.createElement('p');
      p.textContent = part.trim();
      card.appendChild(p);
    });
    section.removeAttribute('data-summary-pending');
  }
  function next() {
    if (tries >= ${POLL_MAX}) giveUp();
    else setTimeout(poll, ${POLL_EVERY_MS});
  }
  function poll() {
    tries += 1;
    fetch('/api/summary-status/' + id, { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (j) { if (j && j.state === 'ready' && j.text) show(j.text); else next(); })
      .catch(next);
  }
  setTimeout(poll, ${POLL_FIRST_MS});
})();
</script>`;
}

module.exports = { SUMMARY_PENDING_CSS, renderSummaryPlaceholder, summaryPollScript, POLL_MAX, SAFE_ID };
