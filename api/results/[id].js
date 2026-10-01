// ONETEQ client results page.
// Looks up a GHL contact by id (the same id used as this page's URL
// segment), reads the assessment result and AI summary stored on it, and
// renders the client-facing page (lib/clientPage.js). No prices are shown
// here; the tiered packages live on the staff page only.

const {
  GHL_CUSTOM_FIELD_IDS,
  getGhlContact,
  getCustomFieldValue,
} = require('../../lib/ghl.js');
const { renderResultsPage, renderMessagePage } = require('../../lib/clientPage.js');

module.exports = async function handler(req, res) {
  const { id } = req.query;

  // Client health information: keep it out of search engines.
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');

  if (!id) {
    res.status(400).send(renderMessagePage('Missing result id', 'Missing result id', 'No id was provided in the URL.'));
    return;
  }

  let contact;
  try {
    contact = await getGhlContact(id);
  } catch (error) {
    console.error('Failed to fetch GHL contact for results page:', error.message);
    res
      .status(502)
      .send(renderMessagePage('Could not load results', 'Could not load this result right now', 'Please try again shortly.'));
    return;
  }

  if (!contact) {
    res.status(404).send(renderMessagePage('Result not found', 'Result not found', 'No contact matches this link.'));
    return;
  }

  const rawResponse = getCustomFieldValue(contact, GHL_CUSTOM_FIELD_IDS.assessmentRawResponse);

  let result;
  try {
    result = JSON.parse(rawResponse);
  } catch (error) {
    console.error(`Could not parse Assessment_Raw_Response for contact ${id}:`, error.message);
    res
      .status(404)
      .send(
        renderMessagePage(
          'No results yet',
          'No assessment result found',
          'This assessment has not been completed yet, or the result has not saved.',
        ),
      );
    return;
  }

  const clientName =
    [contact.firstName, contact.lastName].filter(Boolean).join(' ') ||
    contact.name ||
    'Your results';

  // Written by lib/aiSummary.js and stored once at scoring time - only ever
  // read here, never generated on page load. Absent simply hides the section.
  const aiSummary = String(getCustomFieldValue(contact, GHL_CUSTOM_FIELD_IDS.aiClientSummary) || '').trim();

  res.status(200).send(renderResultsPage({ clientName, result, aiSummary }));
};
