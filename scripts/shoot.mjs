#!/usr/bin/env node
// topknot: shoot a URL (optionally one selector) to a PNG. Lazy wrapper over
// Playwright — no config, no fixtures. If Playwright isn't installed it tells
// you the one line to fix it, then exits. Upgrade to multi-viewport only when
// a real diff needs it.
//
// Usage: node shoot.mjs <url> [--selector "<css>"] [--out file.png] [--width N]

const url = process.argv[2];
if (!url) {
  console.error('usage: node shoot.mjs <url> [--selector "<css>"] [--out file.png]');
  process.exit(1);
}
function arg(name, def) {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : def;
}
const selector = arg("--selector", null);
const out = arg("--out", "topknot-shot.png");
const width = parseInt(arg("--width", "1280"), 10);

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  console.error("Playwright missing. One line: npm i -D playwright && npx playwright install chromium");
  process.exit(1);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width, height: 800 } });
await page.goto(url, { waitUntil: "networkidle" }).catch(() => page.goto(url));
if (selector) {
  const el = await page.$(selector);
  if (!el) {
    console.error(`selector not found: ${selector} — shooting full page instead`);
    await page.screenshot({ path: out, fullPage: true });
  } else {
    await el.screenshot({ path: out });
  }
} else {
  await page.screenshot({ path: out, fullPage: true });
}
await browser.close();
console.log(out);
