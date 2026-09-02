// ONETEQ Results Page
// Looks up a GHL contact by id (the same id used as this page's URL
// segment), reads the assessment result stored on it, and renders a
// simple staff/client-facing summary page.

const {
  GHL_CUSTOM_FIELD_IDS,
  getGhlContact,
  getCustomFieldValue,
} = require('../../lib/ghl.js');
const { escapeHtml, renderPage, renderRadarChart } = require('../../lib/html.js');

module.exports = async function handler(req, res) {
  const { id } = req.query;

  if (!id) {
    res.status(400).send(renderPage('Missing result id', '<h1>Missing result id</h1><p>No id was provided in the URL.</p>'));
    return;
  }

  let contact;
  try {
    contact = await getGhlContact(id);
  } catch (error) {
    console.error('Failed to fetch GHL contact for results page:', error.message);
    res
      .status(502)
      .send(
        renderPage(
          'Could not load results',
          '<h1>Could not load this result right now</h1><p>Please try again shortly.</p>',
        ),
      );
    return;
  }

  if (!contact) {
    res.status(404).send(renderPage('Result not found', '<h1>Result not found</h1><p>No contact matches this link.</p>'));
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
        renderPage(
          'No results yet',
          '<h1>No assessment result found</h1><p>This contact hasn’t completed an assessment yet, or the result hasn’t saved.</p>',
        ),
      );
    return;
  }

  const clientName =
    [contact.firstName, contact.lastName].filter(Boolean).join(' ') ||
    contact.name ||
    'This client';

  const classMatch = result.classMatch || {};
  const classMatchLabel = classMatch.bestStartingMatch || 'Not yet determined';
  const classMatchNote = classMatch.note || null;

  const ptNeed = result.ptNeed || {};
  const ptNeedLabel = ptNeed.unresolved ? 'Unresolved — needs discussion' : ptNeed.band || 'Unresolved — needs discussion';

  const recommendedPackage = result.recommendedPackage || {};
  const lineItems = recommendedPackage.lineItems || [];
  const monthlyTotal = recommendedPackage.recurringMonthlyTotal ?? 0;
  const oneOffTotal = recommendedPackage.oneOffTotal ?? 0;

  const lineItemsHtml = lineItems.length
    ? lineItems
        .map(
          (item) => `
        <tr>
          <td>${escapeHtml(item.name)}</td>
          <td>${escapeHtml(item.billing)}</td>
          <td>$${escapeHtml(item.price)}</td>
        </tr>`,
        )
        .join('')
    : '<tr><td colspan="3">No package items recommended.</td></tr>';

  const body = `
    <h1 style="margin-bottom: 4px;">${escapeHtml(clientName)}</h1>
    <p style="color: #64748b; margin-top: 0;">ONETEQ Assessment Results</p>

    <div style="margin-top: 28px;">
      <h2 style="font-size: 1rem; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; margin-bottom: 8px;">Class Match</h2>
      <div style="font-size: 1.25rem; font-weight: 600;">${escapeHtml(classMatchLabel)}</div>
      ${
        classMatchNote
          ? `<div style="margin-top: 12px; padding: 12px 16px; background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; color: #92400e; font-size: 0.9rem;">${escapeHtml(classMatchNote)}</div>`
          : ''
      }
    </div>

    <div style="margin-top: 28px;">
      <h2 style="font-size: 1rem; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; margin-bottom: 8px;">7-Axis Overview</h2>
      ${renderRadarChart(result.axes || {})}
    </div>

    <div style="margin-top: 28px;">
      <h2 style="font-size: 1rem; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; margin-bottom: 8px;">PT / Coaching Need</h2>
      <div style="font-size: 1.25rem; font-weight: 600;">${escapeHtml(ptNeedLabel)}</div>
    </div>

    <div style="margin-top: 28px;">
      <h2 style="font-size: 1rem; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; margin-bottom: 8px;">Recommended Package</h2>
      <table style="width: 100%; border-collapse: collapse; margin-top: 8px;">
        <thead>
          <tr>
            <th style="text-align: left; padding: 8px 4px; border-bottom: 1px solid #e2e8f0; font-size: 0.9rem;">Item</th>
            <th style="text-align: left; padding: 8px 4px; border-bottom: 1px solid #e2e8f0; font-size: 0.9rem;">Billing</th>
            <th style="text-align: left; padding: 8px 4px; border-bottom: 1px solid #e2e8f0; font-size: 0.9rem;">Price</th>
          </tr>
        </thead>
        <tbody>${lineItemsHtml}</tbody>
      </table>
      <div style="margin-top: 12px; font-size: 0.95rem;">
        <div><strong style="font-size: 1.1rem;">$${escapeHtml(monthlyTotal)}</strong> / month recurring</div>
        <div><strong style="font-size: 1.1rem;">$${escapeHtml(oneOffTotal)}</strong> one-off</div>
      </div>
    </div>
  `;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(renderPage(`Assessment Results — ${clientName}`, body));
};
