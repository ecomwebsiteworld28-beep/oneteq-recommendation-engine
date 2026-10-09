// ONETEQ client results page.
//
// The survey redirects here the moment it is submitted, usually before scoring has landed in GHL,
// so this handler is built to be arrived at early (see lib/resultsLoader.js): it shows the stored
// result, or scores the answers itself, or shows a "preparing" page that retries by itself.
// It never answers with an error status or an error page for a visitor who is just early.
// No prices anywhere here; the tiered packages are staff-only.

const { SAFE_ID } = require('../../lib/summaryPending.js');
const { renderResultsPage } = require('../../lib/clientPage.js');
const { renderPreparingPage, renderSoftPage, MAX_SLOW_TRIES, MAX_NOT_FOUND_TRIES } = require('../../lib/resultsStates.js');

function createHandler(deps = {}) {
  const loadResults = deps.loadResults || require('../../lib/resultsLoader.js').loadResultsForPage;
  const summaryEnabled = deps.isSummaryEnabled || (() => require('../../lib/aiSummary.js').isSummaryEnabled());

  return async function handler(req, res) {
    const id = String((req.query && req.query.id) || '');
    const attempt = Math.max(0, Math.min(parseInt(req.query && req.query.w, 10) || 0, 99));
    const isPoll = Boolean(req.headers && req.headers['x-results-poll']);

    // Client health information: keep it out of search engines and out of caches.
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.setHeader('Cache-Control', 'private, no-store');

    const send = (state, html) => {
      res.setHeader('X-Results-State', state);
      // A poll only needs the state; do not ship a whole page for it.
      return res.status(200).send(isPoll ? '' : html);
    };

    if (!SAFE_ID.test(id)) return send('notfound', renderSoftPage({ kind: 'notfound' }));

    const loaded = await loadResults(id);

    if (loaded.kind === 'ready') {
      const { contact, result, summary } = loaded;
      const clientName =
        [contact.firstName, contact.lastName].filter(Boolean).join(' ') || contact.name || 'Your results';
      return send(
        'ready',
        renderResultsPage({
          clientName,
          result,
          aiSummary: summary,
          // Not stored yet but the summaries are switched on: a placeholder fills in when the workflow's
          // summary webhook lands (this page never generates it itself).
          summaryPending: !summary && summaryEnabled(),
          contactId: id,
        }),
      );
    }

    // Not ready yet. Keep retrying by itself, then fall back softly. Never an error.
    const notFound = loaded.reason === 'not-found';
    const cap = notFound ? MAX_NOT_FOUND_TRIES : MAX_SLOW_TRIES;
    if (attempt >= cap) {
      return send(notFound ? 'notfound' : 'gaveup', renderSoftPage({ kind: notFound ? 'notfound' : 'gaveup', retryHref: req.url ? req.url.split('?')[0] : '' }));
    }
    return send('preparing', renderPreparingPage({ attempt }));
  };
}

module.exports = createHandler();
module.exports.createHandler = createHandler;
