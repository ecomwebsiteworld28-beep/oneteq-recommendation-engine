// ONETEQ Staff Pricing / Override Page
// Password-gated. Shows the same summary as the client results page, plus
// the full 27-product v3Catalogue as an editable checklist so staff can
// build and save a "final package" that may differ from the AI's
// recommendation.

const crypto = require('crypto');
const { v3Catalogue, priceCatalogue, getPhysioPricing } = require('../../index.js');
const {
  GHL_CUSTOM_FIELD_IDS,
  GHL_CUSTOM_FIELD_KEYS,
  getGhlContact,
  getCustomFieldValue,
  updateGhlContactCustomFields,
} = require('../../lib/ghl.js');
const { escapeHtml, renderPage, renderRadarChart } = require('../../lib/html.js');

const CATEGORY_SECTIONS = [
  { title: 'Core Memberships', categories: ['membership'] },
  { title: '1:1 Coaching', categories: ['coaching'] },
  { title: 'Nutrition', categories: ['nutrition', 'nutrition_addon'] },
  { title: 'Physio', categories: ['clinical', 'clinical_addon'] },
  { title: 'Recovery / Testing', categories: ['recovery', 'testing', 'future_optional'] },
];

// Membership tiers and ongoing coaching are what qualify a client for
// getPhysioPricing()'s discounted physio price — matches the rule already
// defined in index.js.
const MEMBERSHIP_OR_COACHING_KEYS = new Set([
  'bronze_membership',
  'silver_membership',
  'gold_membership',
  'platinum_membership',
  'unlimited_membership',
  'coaching_1x_week',
  'coaching_2x_week',
]);

// priceCatalogue (drives the live AI recommendation) uses different keys
// than v3Catalogue (this page's full 27-item catalogue) for a couple of
// overlapping products. Bridge only where they diverge — everything else
// (the 5 membership tiers, coaching_1x_week, coaching_2x_week, payg_1to1)
// already lines up by key.
const RECOMMENDATION_TO_V3_KEY = {
  initial_1to1_assessment: 'initial_assessment',
  pt_programme_review: 'programme_review',
  // "academy" has no v3Catalogue equivalent, so it can't be pre-checked.
};

function sessionToken() {
  return crypto.createHash('sha256').update(String(process.env.STAFF_PAGE_PASSWORD || '')).digest('hex');
}

function parseCookies(req) {
  const header = req.headers.cookie || '';
  const cookies = {};
  header.split(';').forEach((pair) => {
    const idx = pair.indexOf('=');
    if (idx === -1) return;
    const key = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    if (key) cookies[key] = decodeURIComponent(value);
  });
  return cookies;
}

function isAuthed(req) {
  const cookies = req.cookies || parseCookies(req);
  return Boolean(process.env.STAFF_PAGE_PASSWORD) && cookies.staff_session === sessionToken();
}

// Which v3Catalogue keys does the AI's recommended package correspond to?
// The recommendation only stores {name, price, billing} (from
// priceCatalogue), not a product id, so match back to a priceCatalogue key
// by exact name first, then bridge that key into v3Catalogue's namespace.
function recommendedV3Keys(recommendedLineItems) {
  const nameToPriceCatalogueKey = {};
  Object.entries(priceCatalogue).forEach(([key, product]) => {
    nameToPriceCatalogueKey[product.name] = key;
  });

  const keys = new Set();
  recommendedLineItems.forEach((item) => {
    const priceCatalogueKey = nameToPriceCatalogueKey[item.name];
    if (!priceCatalogueKey) return;
    const v3Key = RECOMMENDATION_TO_V3_KEY[priceCatalogueKey] || priceCatalogueKey;
    if (v3Catalogue[v3Key]) keys.add(v3Key);
  });
  return keys;
}

function renderPasswordForm(id, error) {
  const body = `
    <h1>Staff Access</h1>
    <p style="color: #64748b;">Enter the staff password to view this client's pricing/override page.</p>
    ${
      error
        ? `<div style="margin: 12px 0; padding: 12px 16px; background: #fee2e2; border: 1px solid #ef4444; border-radius: 8px; color: #991b1b; font-size: 0.9rem;">${escapeHtml(error)}</div>`
        : ''
    }
    <form method="POST" action="/staff/${escapeHtml(id)}" style="margin-top: 16px; display: flex; gap: 8px;">
      <input type="hidden" name="action" value="login" />
      <input type="password" name="password" placeholder="Password" required
        style="flex: 1; padding: 10px 12px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 1rem;" />
      <button type="submit"
        style="padding: 10px 20px; background: #2563eb; color: #fff; border: none; border-radius: 8px; font-size: 1rem; cursor: pointer;">Unlock</button>
    </form>
  `;
  return renderPage('Staff Login', body);
}

function renderCatalogueChecklist(preCheckedKeys) {
  const sectionsHtml = CATEGORY_SECTIONS.map((section) => {
    const items = Object.entries(v3Catalogue).filter(([, item]) => section.categories.includes(item.category));
    if (items.length === 0) return '';

    const rowsHtml = items
      .map(([key, item]) => {
        const checked = preCheckedKeys.has(key) ? 'checked' : '';
        const discountAttr = item.discountedPrice !== undefined ? ` data-discounted-price="${item.discountedPrice}"` : '';
        const discountNote = item.discountedPrice !== undefined
          ? `<span style="color: #64748b; font-size: 0.8rem;"> (discounted to $${escapeHtml(item.discountedPrice)} with membership/coaching)</span>`
          : '';
        const billingLabel = item.billing === 'RECURRING_MONTHLY' ? '/month' : 'one-off';
        return `
        <label style="display: flex; align-items: center; gap: 10px; padding: 8px 4px; border-bottom: 1px solid #f1f5f9; cursor: pointer;">
          <input type="checkbox" data-key="${escapeHtml(key)}" data-name="${escapeHtml(item.name)}" data-price="${escapeHtml(item.price)}" data-billing="${escapeHtml(item.billing)}"${discountAttr} ${checked} style="width: 16px; height: 16px;" />
          <span style="flex: 1;">${escapeHtml(item.name)}${discountNote}</span>
          <span style="color: #334155; font-size: 0.9rem;">$${escapeHtml(item.price)} ${billingLabel}</span>
        </label>`;
      })
      .join('');

    return `
      <div style="margin-top: 20px;">
        <h3 style="font-size: 0.9rem; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; margin-bottom: 4px;">${escapeHtml(section.title)}</h3>
        ${rowsHtml}
      </div>`;
  }).join('');

  return sectionsHtml;
}

function renderUnlockedPage(contact, result, id) {
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
  const preCheckedKeys = recommendedV3Keys(recommendedPackage.lineItems || []);

  const body = `
    <h1 style="margin-bottom: 4px;">${escapeHtml(clientName)}</h1>
    <p style="color: #64748b; margin-top: 0;">ONETEQ Staff Pricing / Override</p>

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
      <h2 style="font-size: 1rem; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; margin-bottom: 8px;">Full Package Checklist</h2>
      <p style="color: #64748b; font-size: 0.85rem; margin-top: 0;">Items the AI recommended are pre-checked. Check/uncheck to build the final package.</p>
      ${renderCatalogueChecklist(preCheckedKeys)}
    </div>

    <div style="margin-top: 24px; padding: 16px; background: #f8fafc; border-top: 1px solid #e2e8f0; border-radius: 0 0 12px 12px;">
      <div style="font-size: 0.95rem;">
        <div><strong id="live-monthly-total" style="font-size: 1.2rem;">$0</strong> / month recurring</div>
        <div><strong id="live-oneoff-total" style="font-size: 1.2rem;">$0</strong> one-off</div>
      </div>
      <button id="save-final-package" type="button"
        style="margin-top: 12px; padding: 10px 20px; background: #2563eb; color: #fff; border: none; border-radius: 8px; font-size: 1rem; cursor: pointer;">Save Final Package</button>
      <span id="save-status" style="margin-left: 12px; font-size: 0.9rem; color: #64748b;"></span>
    </div>

    <script>
    (function () {
      var checkboxes = Array.prototype.slice.call(document.querySelectorAll('input[type=checkbox][data-key]'));
      var monthlyEl = document.getElementById('live-monthly-total');
      var oneOffEl = document.getElementById('live-oneoff-total');
      var saveBtn = document.getElementById('save-final-package');
      var saveStatus = document.getElementById('save-status');

      var QUALIFYING_KEYS = ${JSON.stringify(Array.from(MEMBERSHIP_OR_COACHING_KEYS))}.reduce(function (acc, k) {
        acc[k] = true;
        return acc;
      }, {});

      function formatMoney(n) {
        return '$' + (Math.round(n * 100) / 100).toString();
      }

      function recompute() {
        var monthly = 0, oneOff = 0;
        var qualifies = checkboxes.some(function (cb) {
          return cb.checked && QUALIFYING_KEYS[cb.dataset.key];
        });
        checkboxes.forEach(function (cb) {
          if (!cb.checked) return;
          var price = parseFloat(cb.dataset.price);
          if (qualifies && cb.dataset.discountedPrice) {
            price = parseFloat(cb.dataset.discountedPrice);
          }
          if (cb.dataset.billing === 'RECURRING_MONTHLY') monthly += price;
          else oneOff += price;
        });
        monthlyEl.textContent = formatMoney(monthly);
        oneOffEl.textContent = formatMoney(oneOff);
      }

      checkboxes.forEach(function (cb) {
        cb.addEventListener('change', recompute);
      });
      recompute();

      saveBtn.addEventListener('click', function () {
        var selectedKeys = checkboxes.filter(function (cb) { return cb.checked; }).map(function (cb) { return cb.dataset.key; });
        saveBtn.disabled = true;
        saveStatus.textContent = 'Saving...';
        fetch(window.location.pathname, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'save', selectedKeys: selectedKeys }),
        })
          .then(function (r) {
            return r.json().then(function (data) { return { ok: r.ok, data: data }; });
          })
          .then(function (result) {
            saveBtn.disabled = false;
            if (result.ok) {
              saveStatus.textContent = 'Saved to GHL.';
            } else {
              saveStatus.textContent = 'Save failed: ' + (result.data && result.data.message ? result.data.message : 'unknown error');
            }
          })
          .catch(function (err) {
            saveBtn.disabled = false;
            saveStatus.textContent = 'Save failed: ' + err.message;
          });
      });
    })();
    </script>
  `;

  return renderPage(`Staff Pricing — ${clientName}`, body);
}

async function handleSave(req, res, id) {
  if (!isAuthed(req)) {
    res.status(401).json({ status: 'error', message: 'Not authenticated' });
    return;
  }

  const body = req.body || {};
  const selectedKeys = Array.isArray(body.selectedKeys) ? body.selectedKeys : [];
  const validKeys = selectedKeys.filter((key) => typeof key === 'string' && v3Catalogue[key]);
  const qualifiesForDiscount = validKeys.some((key) => MEMBERSHIP_OR_COACHING_KEYS.has(key));

  const lineItems = validKeys.map((key) => {
    const item = v3Catalogue[key];
    const priced = getPhysioPricing(key, qualifiesForDiscount);
    const price = priced && item.discountedPrice !== undefined ? priced.price : item.price;
    return { name: item.name, price, billing: item.billing };
  });

  const monthlyTotal = lineItems
    .filter((item) => item.billing === 'RECURRING_MONTHLY')
    .reduce((sum, item) => sum + item.price, 0);
  const oneOffTotal = lineItems
    .filter((item) => item.billing === 'ONE_OFF')
    .reduce((sum, item) => sum + item.price, 0);
  const summary = lineItems.map((item) => item.name).join(', ') || 'None selected';

  try {
    await updateGhlContactCustomFields(id, [
      { key: GHL_CUSTOM_FIELD_KEYS.finalPackageSummary, fieldValue: summary },
      { key: GHL_CUSTOM_FIELD_KEYS.finalPriceMonthly, fieldValue: monthlyTotal },
      { key: GHL_CUSTOM_FIELD_KEYS.finalPriceOneOff, fieldValue: oneOffTotal },
      { key: GHL_CUSTOM_FIELD_KEYS.finalPackageItemKeys, fieldValue: validKeys.join(',') },
    ]);
    res.status(200).json({ status: 'success', monthlyTotal, oneOffTotal, summary });
  } catch (error) {
    console.error('Failed to save final package to GHL:', error.message);
    res.status(502).json({ status: 'error', message: 'Could not save to GHL. Please try again.' });
  }
}

module.exports = async function handler(req, res) {
  const { id } = req.query;

  if (!id) {
    res.status(400).send(renderPage('Missing id', '<h1>Missing id</h1><p>No id was provided in the URL.</p>'));
    return;
  }

  if (req.method === 'POST') {
    const body = req.body || {};

    if (body.action === 'login') {
      if (body.password === process.env.STAFF_PAGE_PASSWORD && process.env.STAFF_PAGE_PASSWORD) {
        res.setHeader('Set-Cookie', `staff_session=${sessionToken()}; Path=/; HttpOnly; Max-Age=28800; SameSite=Lax`);
        res.writeHead(302, { Location: `/staff/${id}` });
        res.end();
        return;
      }
      res.status(401).send(renderPasswordForm(id, 'Incorrect password. Try again.'));
      return;
    }

    if (body.action === 'save') {
      await handleSave(req, res, id);
      return;
    }

    res.status(400).send('Unknown action.');
    return;
  }

  if (!isAuthed(req)) {
    res.status(200).send(renderPasswordForm(id, null));
    return;
  }

  let contact;
  try {
    contact = await getGhlContact(id);
  } catch (error) {
    console.error('Failed to fetch GHL contact for staff page:', error.message);
    res
      .status(502)
      .send(renderPage('Could not load', '<h1>Could not load this client right now</h1><p>Please try again shortly.</p>'));
    return;
  }

  if (!contact) {
    res.status(404).send(renderPage('Not found', '<h1>Client not found</h1><p>No contact matches this link.</p>'));
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
      .send(renderPage('No results yet', '<h1>No assessment result found</h1><p>This contact hasn’t completed an assessment yet, or the result hasn’t saved.</p>'));
    return;
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(renderUnlockedPage(contact, result, id));
};
