#!/usr/bin/env node
// topknot: turn findings[] into a throwaway, self-contained redline report — the
// dev's component with the misalignments marked the way a designer redlines a
// mock. One portable HTML file: screenshot (base64-inlined) with numbered
// callouts at each erring node, plus a table of design-vs-code with swatches.
//
// If no screenshot is given it draws a schematic wireframe from the node boxes,
// so the report still isolates WHERE the drift lands. Pure, no deps.
//
// Usage:
//   node redline.mjs <diff.json> [--shot full.png] [--shot-width 1280] [--out report.html] [--title "..."]
//   <diff.json> is visual-diff.mjs --json output (or a bare findings array).

import fs from "node:fs";

const SEV = { high: "#e5484d", medium: "#f5a623", low: "#9aa0a6" };
const TAGDESC = {
  "mis-bind": "wrong token/value on the right element",
  drift: "value differs from design",
  geom: "spacing / size / radius off",
  type: "typography off",
  effect: "shadow / opacity off",
  "missing-node": "in design, not rendered",
  "extra-node": "rendered, not in design",
};

function hexIn(s) {
  const m = String(s || "").match(/#[0-9a-fA-F]{6,8}/);
  return m ? m[0] : null;
}
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
function swatch(v) {
  const h = hexIn(v);
  return h ? `<span class="sw" style="background:${esc(h)}"></span>` : "";
}

function arg(name, def) {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : def;
}

const diffPath = process.argv[2];
if (!diffPath || diffPath.startsWith("--")) {
  console.error('usage: node redline.mjs <diff.json> [--shot full.png] [--shot-width N] [--out report.html] [--title "..."]');
  process.exit(1);
}

const raw = JSON.parse(fs.readFileSync(diffPath, "utf8"));
const findings = Array.isArray(raw) ? raw : raw.findings || [];
const summary = raw.summary || null;
const title = arg("--title", "TopKnot redline");
const out = arg("--out", "topknot-redline.html");
const shotPath = arg("--shot", null);
const shotWidth = parseFloat(arg("--shot-width", "1280"));

// only findings with a box can be pinned visually
const pinned = findings.filter((f) => f.box && f.box.w);
findings.forEach((f, i) => (f._n = i + 1));

// read intrinsic w/h from a PNG's IHDR (big-endian uint32 at byte 16 / 20) so
// overlay percentages map to the real image, not a guessed width.
function pngSize(buf) {
  if (buf.length > 24 && buf.toString("ascii", 12, 16) === "IHDR") {
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  }
  return null;
}
// markers are % of the stage's own width/height; the stage carries the matching
// aspect-ratio, so top% (which resolves against height) lands correctly.
function markersHtml(items, sw, sh) {
  return items
    .map((f) => {
      const L = (f.box.x / sw) * 100, T = (f.box.y / sh) * 100;
      const W = (f.box.w / sw) * 100, H = (f.box.h / sh) * 100;
      return `<div class="mk" style="left:${L}%;top:${T}%;width:${W}%;height:${H}%;border-color:${SEV[f.severity]}">
        <span class="pin" style="background:${SEV[f.severity]}">${f._n}</span></div>`;
    })
    .join("");
}

// --- visual stage: real screenshot if given, else a schematic from boxes ---
let stage = "";
if (shotPath && fs.existsSync(shotPath)) {
  const buf = fs.readFileSync(shotPath);
  const sz = pngSize(buf) || { w: shotWidth, h: shotWidth };
  const b64 = buf.toString("base64");
  stage = `<div class="shot" style="aspect-ratio:${sz.w}/${sz.h}"><img src="data:image/png;base64,${b64}">${markersHtml(pinned, sz.w, sz.h)}</div>`;
} else if (pinned.length) {
  // schematic: lay node boxes out tight against their collective bounds
  const minX = Math.min(...pinned.map((f) => f.box.x)), minY = Math.min(...pinned.map((f) => f.box.y));
  const W = Math.max(...pinned.map((f) => f.box.x + f.box.w)) - minX || 1;
  const H = Math.max(...pinned.map((f) => f.box.y + f.box.h)) - minY || 1;
  const shifted = pinned.map((f) => ({ ...f, box: { x: f.box.x - minX, y: f.box.y - minY, w: f.box.w, h: f.box.h } }));
  stage = `<div class="shot wfstage" style="aspect-ratio:${W}/${H}"><span class="wfnote">schematic — no screenshot (pass --shot for the live render)</span>${markersHtml(shifted, W, H)}</div>`;
}

const rows = findings
  .map(
    (f) => `<tr class="sev-${f.severity}">
    <td class="n">${f._n}</td>
    <td><span class="tag" style="background:${SEV[f.severity]}">${esc(f.tag)}</span></td>
    <td class="mono">${esc(f.role || "node")}.${esc(f.prop)}${f.selector ? `<div class="sel">${esc(f.selector)}</div>` : ""}</td>
    <td>${swatch(f.expected)}<span class="mono">${esc(f.expected)}</span></td>
    <td>${swatch(f.actual)}<span class="mono">${esc(f.actual)}</span></td>
    <td>${esc(f.fix)}</td>
  </tr>`
  )
  .join("");

const tagLegend = Object.entries(TAGDESC)
  .map(([k, v]) => `<span class="lg"><b>${k}</b> ${v}</span>`)
  .join("");

const net = summary
  ? `${Object.entries(summary.byTag || {}).map(([k, v]) => `${v} ${k}`).join(", ") || "0 findings"} · matched ${summary.matched}/${summary.designNodes}, ${summary.lowConfidence} low-confidence`
  : `${findings.length} findings`;

const html = `<!doctype html><meta charset="utf-8"><title>${esc(title)}</title>
<style>
:root{font:14px/1.45 -apple-system,Segoe UI,Roboto,sans-serif;color:#1e2327}
body{margin:0;background:#0f1115;color:#e8eaed}
.wrap{max-width:1100px;margin:0 auto;padding:24px}
h1{font-size:18px;margin:0 0 2px} .meta{color:#9aa0a6;font-size:12px;margin-bottom:16px}
.net{display:inline-block;background:#1a1d23;border:1px solid #2a2e37;border-radius:6px;padding:6px 10px;margin-bottom:16px;font-size:13px}
.grid{display:grid;grid-template-columns:minmax(280px,420px) 1fr;gap:20px;align-items:start}
.shot{position:relative;border:1px solid #2a2e37;border-radius:8px;overflow:hidden;background:#15171c}
.shot img{width:100%;display:block}
.wfnote{position:absolute;top:8px;left:8px;font-size:11px;color:#6b7280;z-index:2}
.mk{position:absolute;border:2px solid;border-radius:3px;box-sizing:border-box}
.mk.wf{background:rgba(255,255,255,.02)}
.pin{position:absolute;top:-11px;left:-11px;width:20px;height:20px;border-radius:50%;color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center}
table{border-collapse:collapse;width:100%;font-size:13px}
th,td{text-align:left;padding:7px 9px;border-bottom:1px solid #21252d;vertical-align:top}
th{color:#9aa0a6;font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.04em}
td.n{color:#6b7280;width:24px} .mono{font-family:ui-monospace,Menlo,monospace;font-size:12px}
.sel{color:#6b7280;font-size:11px;margin-top:2px}
.tag{color:#fff;border-radius:4px;padding:1px 6px;font-size:11px;font-weight:600}
.sw{display:inline-block;width:11px;height:11px;border-radius:2px;border:1px solid #0006;margin-right:5px;vertical-align:-1px}
.legend{margin-top:18px;color:#9aa0a6;font-size:11px;display:flex;flex-wrap:wrap;gap:12px}
.lg b{color:#cbd1d8}
tr.sev-high td{background:rgba(229,72,77,.06)}
@media(max-width:760px){.grid{grid-template-columns:1fr}}
</style>
<div class="wrap">
  <h1>${esc(title)}</h1>
  <div class="meta">design vs code · ${esc(arg("--time", new Date().toISOString()))}</div>
  <div class="net">net: ${esc(net)}</div>
  <div class="grid">
    <div>${stage}</div>
    <div>
      <table>
        <thead><tr><th>#</th><th>tag</th><th>node.prop</th><th>design</th><th>code</th><th>fix</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="6">Adheres to design. Ship.</td></tr>'}</tbody>
      </table>
    </div>
  </div>
  <div class="legend">${tagLegend}</div>
</div>`;

fs.writeFileSync(out, html);
console.log(out);
