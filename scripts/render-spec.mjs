#!/usr/bin/env node
// topknot: extract a normalized spec tree from a live (or local) page — the
// rendered side of the visual-adherence diff. Walks the DOM under a root,
// reads getComputedStyle + bounding boxes, and back-resolves each value to a
// code token (so the diff can tell a wrong-token from a wrong-value).
//
// Lazy wrapper over Playwright, same as shoot.mjs: if Playwright is missing it
// prints the one install line and exits. Pairs with figma-spec.mjs.
//
// Usage:
//   node render-spec.mjs <url> [--selector "<root css>"] [--tokens code-tokens.json] [--width N]
// data-topknot="<figma-node-id>" on an element gives the diff an exact match.

import fs from "node:fs";
import { normalizeColor, normalizeShadow, font as mkFont } from "./lib/spec.mjs";

// This function is stringified and run INSIDE the page. Keep it self-contained.
function extractInPage(rootSel) {
  function visible(el) {
    const s = getComputedStyle(el);
    if (s.display === "none" || s.visibility === "hidden" || s.opacity === "0") return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }
  function role(el) {
    return (
      el.getAttribute("role") ||
      el.dataset.role ||
      el.tagName.toLowerCase()
    );
  }
  function directText(el) {
    let t = "";
    for (const n of el.childNodes) if (n.nodeType === 3) t += n.textContent;
    return t.trim().slice(0, 80) || null;
  }
  function styleOf(el) {
    const s = getComputedStyle(el);
    const num = (v) => parseFloat(v) || 0;
    return {
      color: s.color,
      bg: s.backgroundColor,
      padding: { t: num(s.paddingTop), r: num(s.paddingRight), b: num(s.paddingBottom), l: num(s.paddingLeft) },
      gap: s.rowGap && s.rowGap !== "normal" ? num(s.rowGap) : null,
      radius: num(s.borderTopLeftRadius) || null,
      font: { family: s.fontFamily, size: s.fontSize, weight: s.fontWeight, line: s.lineHeight, spacing: s.letterSpacing },
      shadow: s.boxShadow,
      opacity: parseFloat(s.opacity),
    };
  }
  function selectorFor(el) {
    if (el.dataset.topknot) return `[data-topknot="${el.dataset.topknot}"]`;
    if (el.id) return `#${el.id}`;
    const cls = (el.className && typeof el.className === "string") ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".") : "";
    return el.tagName.toLowerCase() + cls;
  }
  let count = 0;
  function build(el, depth) {
    if (count > 600 || depth > 14) return null; // lazy cap, raise if a real tree needs it
    if (!visible(el)) return null;
    count++;
    const r = el.getBoundingClientRect();
    const kids = [];
    for (const c of el.children) {
      const child = build(c, depth + 1);
      if (child) kids.push(child);
    }
    return {
      id: el.dataset.topknot || null, // matches a Figma node id when the dev tags it
      role: role(el),
      text: directText(el),
      box: { x: r.x, y: r.y, w: r.width, h: r.height },
      styles: styleOf(el),
      selector: selectorFor(el),
      children: kids,
    };
  }
  const root = rootSel ? document.querySelector(rootSel) : document.body;
  return root ? build(root, 0) : null;
}

// --- normalize the raw page styles in Node, back-resolve tokens ---
function normalizeTree(node, valueToToken) {
  const s = node.styles;
  const color = normalizeColor(s.color);
  const bg = normalizeColor(s.bg);
  const radius = s.radius;
  const gap = s.gap;
  node.styles = {
    color,
    bg,
    padding: s.padding,
    gap,
    radius,
    font: mkFont(s.font),
    shadow: normalizeShadow(s.shadow),
    opacity: s.opacity,
  };
  node.tokenRefs = {
    color: valueToToken.get(color) || null,
    bg: valueToToken.get(bg) || null,
    radius: valueToToken.get(radius != null ? `${radius}px` : null) || null,
    gap: valueToToken.get(gap != null ? `${gap}px` : null) || null,
  };
  (node.children || []).forEach((c) => normalizeTree(c, valueToToken));
  return node;
}

function loadTokenIndex(path) {
  const map = new Map();
  if (!path) return map;
  const j = JSON.parse(fs.readFileSync(path, "utf8"));
  // accept the flat { name: value } that extract-code-tokens --json emits
  for (const [name, value] of Object.entries(j)) {
    const v = normalizeColor(value) || String(value).toLowerCase();
    if (!map.has(v)) map.set(v, name); // first name wins; aliases collapse
  }
  return map;
}

// --------------------------------------------------------------------- cli ----
function arg(name, def) {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : def;
}
const url = process.argv[2];
if (!url || url.startsWith("--")) {
  console.error('usage: node render-spec.mjs <url> [--selector "<css>"] [--tokens code-tokens.json] [--width N]');
  process.exit(1);
}

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  console.error("Playwright missing. One line: npm i -D playwright && npx playwright install chromium");
  process.exit(1);
}

const selector = arg("--selector", null);
const width = parseInt(arg("--width", "1280"), 10);
const tokenIndex = loadTokenIndex(arg("--tokens", null));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width, height: 900 } });
await page.goto(url, { waitUntil: "networkidle" }).catch(() => page.goto(url));
const raw = await page.evaluate(extractInPage, selector);
await browser.close();

if (!raw) {
  console.error(selector ? `root selector not found: ${selector}` : "no <body> to extract");
  process.exit(1);
}
const spec = normalizeTree(raw, tokenIndex);
process.stdout.write(JSON.stringify(spec, null, 2)); // the spec tree IS the output
