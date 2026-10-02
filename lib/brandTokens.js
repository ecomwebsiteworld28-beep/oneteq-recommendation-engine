// ONETEQ brand tokens and the base styles both pages are built on, so the
// client page (lib/clientPage.js) and the staff page (lib/html.js shell)
// look like one system. Pure CSS strings; neither page imports the other.

const BRAND_BASE_CSS = `
  :root {
    --navy: #001020;
    --surface: #07182b;
    --surface-2: #0c2238;
    --teal: #009eb0;
    --white: #ffffff;
    --muted: rgba(255, 255, 255, 0.74);
    --faint: rgba(255, 255, 255, 0.52);
    --line: rgba(0, 158, 176, 0.3);
    --radius: 16px;
    color-scheme: dark;
  }
  * { box-sizing: border-box; }
  html { -webkit-text-size-adjust: 100%; }
  body {
    margin: 0;
    background: var(--navy);
    color: var(--white);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    font-size: 1rem;
    line-height: 1.6;
    padding-bottom: env(safe-area-inset-bottom);
  }
  img { max-width: 100%; height: auto; display: block; }
  h1, h2, h3 { margin: 0; line-height: 1.15; font-weight: 800; text-transform: uppercase; letter-spacing: 0.03em; }
  h2 { font-size: 1.6rem; margin-bottom: 16px; }
  h3 { font-size: 1.05rem; }
  p { margin: 0 0 12px; }
  .wrap { width: 100%; max-width: 720px; margin: 0 auto; padding: 0 20px; }
  .eyebrow { color: var(--teal); font-size: 0.78rem; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; margin-bottom: 8px; }
  .muted, .note { color: var(--muted); }
  .note { font-size: 0.88rem; margin: 12px 0 0; }
  .card { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); padding: 20px; }
  .card + .card { margin-top: 12px; }
  .card--accent { background: var(--surface-2); border-color: var(--teal); }
  .pill { display: inline-block; background: var(--teal); color: var(--navy); font-weight: 800; font-size: 0.78rem; letter-spacing: 0.1em; text-transform: uppercase; padding: 4px 12px; border-radius: 999px; margin-bottom: 14px; }
  .badge { font-size: 0.72rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--teal); border: 1px solid var(--teal); border-radius: 999px; padding: 3px 10px; white-space: nowrap; }
  .button { display: flex; align-items: center; justify-content: center; text-align: center; min-height: 54px; padding: 14px 24px; border-radius: 999px; background: var(--teal); color: var(--navy); font-weight: 800; font-size: 1.02rem; text-decoration: none; border: 0; cursor: pointer; font-family: inherit; line-height: 1.3; text-wrap: balance; }
  .button:hover { filter: brightness(1.1); }
  .button:disabled { opacity: 0.5; cursor: not-allowed; }
  .button:focus-visible, a:focus-visible { outline: 3px solid var(--white); outline-offset: 3px; }
  @media (min-width: 640px) {
    h2 { font-size: 2rem; }
    .card { padding: 28px; }
    .button { display: inline-flex; min-width: 340px; }
  }
`;

module.exports = { BRAND_BASE_CSS };
