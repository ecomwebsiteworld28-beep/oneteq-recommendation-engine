// Read-only status of a client's AI summary, polled by the results page while it waits for the
// workflow's summary webhook to write it. It cannot generate or change anything: it only reports
// what is stored. The text is no more public than the results page itself (same id).

const { SAFE_ID } = require('../../lib/summaryPending.js');
const { getGhlContact, getCustomFieldValue, GHL_CUSTOM_FIELD_IDS } = require('../../lib/ghl.js');
const { renameLegacyClassName } = require('../../lib/classNames.js');

function createHandler(deps = {}) {
  const getContact = deps.getContact || getGhlContact;
  return async function handler(req, res) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    // A couple of seconds at the CDN keeps a burst of pollers from each costing a GHL read.
    res.setHeader('Cache-Control', 'public, s-maxage=2, stale-while-revalidate=4');

    const id = String((req.query && req.query.id) || '');
    if (!SAFE_ID.test(id)) return res.status(200).json({ state: 'none' });

    try {
      const contact = await getContact(id, { timeoutMs: 8000 });
      const text = renameLegacyClassName(String(getCustomFieldValue(contact, GHL_CUSTOM_FIELD_IDS.aiClientSummary) || '').trim());
      return res.status(200).json(text ? { state: 'ready', text } : { state: 'pending' });
    } catch (error) {
      // GHL slow or erroring: the page just keeps waiting (and gives up on its own).
      return res.status(200).json({ state: 'pending' });
    }
  };
}

module.exports = createHandler();
module.exports.createHandler = createHandler;
