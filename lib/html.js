// Staff-side HTML shell and radar chart, in the ONETEQ brand (see
// lib/brandTokens.js, shared with the client page). The client page
// (lib/clientPage.js) does not use this file.

const { escapeHtml } = require('./escape.js');
const { BRAND_BASE_CSS } = require('./brandTokens.js');

// Prices are only ever integers or .5/.7-style catalogue values (e.g.
// physio_followup's discountedPrice of 56.7) - always show two decimals
// so "£56.7" never reads as a possibly-truncated amount next to "£56.70".
function formatMoney(n) {
  return '£' + Number(n).toFixed(2);
}

const SHELL_CSS = `
  .site-head { border-bottom: 1px solid var(--line); background: var(--surface); }
  .site-head__inner { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding-top: 14px; padding-bottom: 14px; }
  .site-head__logo { width: 124px; }
  .site-head .eyebrow { margin: 0; }
  .wrap--staff { max-width: 960px; padding-top: 28px; padding-bottom: 56px; }
  .page-title { font-size: 1.9rem; margin-bottom: 4px; overflow-wrap: anywhere; }
  .note-error { margin: 12px 0; padding: 12px 16px; background: rgba(239, 68, 68, 0.14); border: 1px solid #ef4444; border-radius: 12px; color: #fca5a5; font-size: 0.9rem; }
  select, input[type=number], input[type=password], textarea {
    background: var(--navy); color: var(--white); border: 1px solid var(--line); border-radius: 8px;
    padding: 8px 10px; font-size: 0.9rem; font-family: inherit; min-height: 40px;
    }
  select:focus-visible, input:focus-visible, textarea:focus-visible { outline: 2px solid var(--teal); outline-offset: 1px; }
  input[type=checkbox] { accent-color: var(--teal); width: 16px; height: 16px; }
  ::placeholder { color: var(--faint); }
  .button--ghost { background: transparent; color: var(--teal); border: 1px solid var(--teal); min-width: 0; min-height: 44px; padding: 10px 24px; font-size: 0.95rem; }
  .login-form { margin-top: 16px; display: flex; gap: 8px; flex-wrap: wrap; }
  .login-form input[type=password] { flex: 1 1 220px; font-size: 1rem; min-height: 48px; }
  .login-form .button { min-width: 0; padding: 12px 28px; }
  @media (max-width: 640px) { .page-title { font-size: 1.5rem; } }
  .foot { text-align: center; color: var(--faint); font-size: 0.8rem; padding: 24px 20px 32px; }
`;

function renderPage(title, bodyHtml) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="theme-color" content="#001020" />
<meta name="robots" content="noindex, nofollow" />
<title>${escapeHtml(title)}</title>
<style>${BRAND_BASE_CSS}${SHELL_CSS}</style>
</head>
<body>
  <header class="site-head">
    <div class="wrap site-head__inner" style="max-width: 960px;">
      <img class="site-head__logo" src="/assets/logo-white.png" width="720" height="160" alt="ONETEQ Health" />
      <p class="eyebrow">Staff</p>
    </div>
  </header>
  <main class="wrap wrap--staff">${bodyHtml}</main>
  <footer class="foot">ONETEQ Health</footer>
</body>
</html>`;
}

// Draws the 7-axis radar chart as plain inline SVG — no charting library,
// no external requests. Each axis is placed evenly around a heptagon;
// an unresolved axis (score: null, e.g. a blank/unanswered question) is
// plotted at 0 and its label says "unresolved" rather than implying a
// real "no need" score of zero.
//
// The viewBox is wider than it is tall, with extra horizontal margin,
// specifically so the near-horizontal axis labels (e.g. "Accountability
// (unresolved)") have room to render without being clipped by the SVG's
// edges — a plain square viewBox clips those on every axis count where a
// vertex lands close to the 3/9 o'clock positions, which happens with 7
// axes.
function renderRadarChart(axes) {
  const axisOrder = [
    { key: 'training', label: 'Training' },
    { key: 'coaching', label: 'Coaching' },
    { key: 'accountability', label: 'Accountability' },
    { key: 'clinicalSupport', label: 'Clinical' },
    { key: 'nutritionSupport', label: 'Nutrition' },
    { key: 'performanceFocus', label: 'Performance' },
    { key: 'recoverySupport', label: 'Recovery' },
  ];

  // Same proportions as the client page's radar so the labels stay legible
  // on a phone (two lines per label: name, then score).
  const width = 410;
  const height = 305;
  const centerX = width / 2;
  const centerY = 156;
  const maxRadius = 90;
  const maxScore = 10;
  const angleStep = (2 * Math.PI) / axisOrder.length;

  const pointFor = (index, radius) => {
    const angle = angleStep * index - Math.PI / 2;
    return {
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle),
    };
  };

  const ringPolygons = [0.2, 0.4, 0.6, 0.8, 1]
    .map((fraction) => {
      const points = axisOrder
        .map((_, i) => {
          const p = pointFor(i, maxRadius * fraction);
          return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
        })
        .join(' ');
      return `<polygon points="${points}" fill="none" stroke="rgba(255,255,255,0.16)" stroke-width="1" />`;
    })
    .join('');

  const spokes = axisOrder
    .map((_, i) => {
      const p = pointFor(i, maxRadius);
      return `<line x1="${centerX}" y1="${centerY}" x2="${p.x.toFixed(1)}" y2="${p.y.toFixed(1)}" stroke="rgba(255,255,255,0.16)" stroke-width="1" />`;
    })
    .join('');

  const dataPoints = axisOrder
    .map((axis, i) => {
      const axisData = axes[axis.key] || {};
      const score = typeof axisData.score === 'number' ? axisData.score : 0;
      const radius = (Math.max(0, Math.min(score, maxScore)) / maxScore) * maxRadius;
      const p = pointFor(i, radius);
      return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
    })
    .join(' ');

  const labels = axisOrder
    .map((axis, i) => {
      const p = pointFor(i, maxRadius + 14);
      const axisData = axes[axis.key] || {};
      const scored = typeof axisData.score === 'number';
      const displayScore = scored ? axisData.score : 'unresolved';
      const anchor = Math.abs(p.x - centerX) < 2 ? 'middle' : p.x > centerX ? 'start' : 'end';
      const x = p.x.toFixed(1);
      const y = (p.y + (Math.abs(p.x - centerX) < 2 ? -6 : p.y > centerY + 40 ? 6 : 0)).toFixed(1);
      return `<text x="${x}" y="${y}" text-anchor="${anchor}" font-size="15" font-weight="600" fill="#ffffff">
      <tspan x="${x}" dy="-0.2em">${escapeHtml(axis.label)}</tspan>
      <tspan x="${x}" dy="1.3em" font-size="${scored ? 17 : 13}" font-weight="${scored ? 800 : 600}" fill="${scored ? '#009eb0' : 'rgba(255,255,255,0.52)'}">${escapeHtml(displayScore)}</tspan>
    </text>`;
    })
    .join('');

  return `<svg viewBox="0 0 ${width} ${height}" width="100%" height="auto" style="max-width: 460px; display: block; margin: 0 auto; overflow: visible;">
    ${ringPolygons}
    ${spokes}
    <polygon points="${dataPoints}" fill="rgba(0, 158, 176, 0.32)" stroke="#009eb0" stroke-width="2.5" stroke-linejoin="round" />
    ${labels}
  </svg>`;
}

// escapeHtml is re-exported so existing staff-side imports keep working.
module.exports = { escapeHtml, formatMoney, renderPage, renderRadarChart };
