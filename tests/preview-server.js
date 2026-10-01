// Local preview only (not deployed): serves the fixtures through the real
// renderer so the page can be viewed and screenshotted without GHL.
//   node tests/preview-server.js   ->   http://localhost:4173/foundation

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { renderResultsPage } = require('../lib/clientPage.js');
const fixtures = require('./fixtures.js');

const routes = {
  foundation: fixtures.FOUNDATION,
  lift: fixtures.LIFT,
  hyrox: fixtures.HYROX_UNRESOLVED,
  empty: fixtures.NO_CLASS,
};
const types = { '.jpg': 'image/jpeg', '.png': 'image/png' };

http
  .createServer((req, res) => {
    const url = req.url.split('?')[0];
    const key = url.replace(/^\//, '');
    if (url === '/frame') {
      const q = new URL(req.url, 'http://x').searchParams;
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`<body style="margin:0;background:#333"><iframe src="/${q.get('page')}" style="width:${q.get('w')}px;height:${q.get('h')}px;border:0;display:block"></iframe></body>`);
    } else if (routes[key]) {
      const f = routes[key];
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(renderResultsPage({ clientName: f.name, result: f.result, aiSummary: f.aiSummary }));
    } else if (url.startsWith('/assets/')) {
      const file = path.join(__dirname, '..', 'public', url);
      if (fs.existsSync(file)) {
        res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
        fs.createReadStream(file).pipe(res);
      } else {
        res.writeHead(404).end();
      }
    } else {
      res.writeHead(404).end('Try /foundation, /lift, /hyrox or /empty');
    }
  })
  .listen(4173, () => console.log('Preview on http://localhost:4173'));
