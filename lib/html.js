// Shared HTML rendering helpers used by both the client results page
// (api/results/[id].js) and the staff pricing page (api/staff/[id].js).

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[ch]);
}

function renderPage(title, bodyHtml) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: #f8fafc;
    color: #0f172a;
    margin: 0;
    padding: 32px 16px;
  }
  .card {
    max-width: 720px;
    margin: 0 auto;
    background: #ffffff;
    border-radius: 12px;
    padding: 32px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
  }
</style>
</head>
<body>
  <div class="card">${bodyHtml}</div>
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

  const width = 760;
  const height = 380;
  const centerX = width / 2;
  const centerY = height / 2;
  const maxRadius = 110;
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
      return `<polygon points="${points}" fill="none" stroke="#e2e8f0" stroke-width="1" />`;
    })
    .join('');

  const spokes = axisOrder
    .map((_, i) => {
      const p = pointFor(i, maxRadius);
      return `<line x1="${centerX}" y1="${centerY}" x2="${p.x.toFixed(1)}" y2="${p.y.toFixed(1)}" stroke="#e2e8f0" stroke-width="1" />`;
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
      const p = pointFor(i, maxRadius + 26);
      const axisData = axes[axis.key] || {};
      const displayScore =
        typeof axisData.score === 'number' ? axisData.score : 'unresolved';
      const anchor = Math.abs(p.x - centerX) < 1 ? 'middle' : p.x > centerX ? 'start' : 'end';
      return `<text x="${p.x.toFixed(1)}" y="${p.y.toFixed(1)}" text-anchor="${anchor}" dominant-baseline="middle" font-size="12" fill="#334155">${escapeHtml(axis.label)} (${escapeHtml(displayScore)})</text>`;
    })
    .join('');

  return `<svg viewBox="0 0 ${width} ${height}" width="100%" height="auto" style="max-width: 560px; display: block; margin: 0 auto; overflow: visible;">
    ${ringPolygons}
    ${spokes}
    <polygon points="${dataPoints}" fill="rgba(37, 99, 235, 0.35)" stroke="#2563eb" stroke-width="2" />
    ${labels}
  </svg>`;
}

module.exports = { escapeHtml, renderPage, renderRadarChart };
