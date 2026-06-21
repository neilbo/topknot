#!/usr/bin/env node
// topknot: the visual-adherence diff. Match a Figma spec tree against a rendered
// spec tree (design node <-> DOM element), compare resolved styles per node, and
// emit findings[]. This is what catches the gap topknot-diff can't: the RIGHT
// element using the WRONG token/value (mis-bind), off-spec geometry/type/effects,
// and nodes that were never built.
//
// Pure, no deps. Both inputs are spec trees (see lib/spec.mjs).
//
// Usage:
//   node visual-diff.mjs <design.json> <render.json> [--json] [--tol 1] [--minconf 0.45]
//   --json    emit the full findings object (default: terse one-line-per-finding)
//   --tol     px tolerance for geometry/type before it's a finding (default 1)
//   --minconf heuristic match score below which a pair is dropped (default 0.45)

import fs from "node:fs";
import { flatten, boxSim, label } from "./lib/spec.mjs";

// ---------------------------------------------------------------- matching ----
// Hybrid: explicit data-topknot id first (exact), then a global best-first
// heuristic on the rest. Best-first (not in-order) so a poorly-matching design
// node can't greedily claim a render node that fits a later one better. A pair
// below `minconf` is left unmatched rather than forced — every heuristic pair
// carries a confidence so a weak match is never silent.
export function matchTrees(design, render, { minconf = 0.45 } = {}) {
  const dList = flatten(design);
  const rList = flatten(render);
  const usedR = new Set();
  const matchedD = new Set();
  const pairs = [];

  // pass 1 — explicit id (render node's figmaId === design node id)
  const rById = new Map();
  for (const r of rList) if (r.node.id != null) rById.set(String(r.node.id), r);
  for (const d of dList) {
    const r = rById.get(String(d.node.id));
    if (r && !usedR.has(r)) {
      usedR.add(r);
      matchedD.add(d);
      pairs.push({ d, r, confidence: 1, how: "id" });
    }
  }

  // pass 2 — score every remaining (design, render) pair, assign best-first
  const cands = [];
  for (const d of dList) {
    if (matchedD.has(d)) continue;
    for (const r of rList) {
      if (usedR.has(r)) continue;
      const score = matchScore(d, r);
      if (score >= minconf) cands.push({ d, r, score });
    }
  }
  cands.sort((a, b) => b.score - a.score);
  for (const c of cands) {
    if (matchedD.has(c.d) || usedR.has(c.r)) continue;
    matchedD.add(c.d);
    usedR.add(c.r);
    pairs.push({ d: c.d, r: c.r, confidence: round2(c.score), how: "heuristic" });
  }

  // design nodes that never found a confident match
  for (const d of dList) if (!matchedD.has(d)) pairs.push({ d, r: null, confidence: 0, how: "none" });

  const extra = rList.filter((r) => !usedR.has(r));
  return { pairs, extra, dCount: dList.length, rCount: rList.length };
}

function matchScore(d, r) {
  const dn = d.node, rn = r.node;
  let s = 0;
  // role / name signal
  if (dn.role && rn.role) {
    if (dn.role === rn.role) s += 0.35;
    else if (rn.role.includes(dn.role) || dn.role.includes(rn.role)) s += 0.2;
  }
  // text signal
  if (dn.text && rn.text) {
    const a = dn.text.trim().toLowerCase(), b = rn.text.trim().toLowerCase();
    if (a === b) s += 0.3;
    else if (a.includes(b) || b.includes(a)) s += 0.15;
  }
  // depth signal
  if (d.depth === r.depth) s += 0.1;
  // geometry signal
  s += 0.25 * boxSim(d.nbox, r.nbox);
  return s;
}

// ---------------------------------------------------------------- compare -----
export function comparePair(d, r, tol) {
  const out = [];
  const dn = d.node, rn = r.node;
  const ds = dn.styles || {}, rs = rn.styles || {};
  const dt = dn.tokenRefs || {}, rt = rn.tokenRefs || {};
  const sel = rn.selector || rn.path || r.path;
  const box = rn.box || dn.box || null;
  const meta = { nodeId: dn.id, selector: sel, box, confidence: r ? d._conf : 0, role: dn.role, text: dn.text };

  // color & background — the mis-bind hotspots
  for (const [prop, dval, rval] of [["color", ds.color, rs.color], ["bg", ds.bg, rs.bg]]) {
    if (dval == null) continue;
    if (norm(dval) !== norm(rval)) {
      const expectTok = dt[prop];
      const actualTok = rt[prop];
      // design bound a token but render used a different value/token => mis-bind
      const tag = expectTok ? "mis-bind" : "drift";
      out.push(finding(tag, meta, prop,
        expectTok ? `${dval} (${expectTok})` : dval,
        actualTok ? `${rval} (${actualTok})` : (rval ?? "—"),
        expectTok ? `apply ${expectTok}` : `match design (${dval})`,
        "high"));
    }
  }

  // geometry — padding / gap / radius / size
  geomCmp(out, meta, tol, "padding", ds.padding, rs.padding);
  numCmp(out, meta, tol, "gap", ds.gap, rs.gap);
  numCmp(out, meta, tol, "radius", ds.radius, rs.radius, dt.radius);

  // typography
  if (ds.font) typeCmp(out, meta, tol, ds.font, rs.font || {});

  // effects
  if (ds.shadow != null && norm(ds.shadow) !== norm(rs.shadow)) {
    out.push(finding("effect", meta, "shadow", ds.shadow, rs.shadow ?? "—", "match design shadow", "low"));
  }
  if (ds.opacity != null && rs.opacity != null && Math.abs(ds.opacity - rs.opacity) > 0.01) {
    out.push(finding("effect", meta, "opacity", ds.opacity, rs.opacity, `set opacity ${ds.opacity}`, "low"));
  }
  return out;
}

function geomCmp(out, meta, tol, prop, d, r) {
  if (!d) return;
  r = r || {};
  const sides = ["t", "r", "b", "l"];
  const off = sides.filter((k) => Math.abs((d[k] || 0) - (r[k] || 0)) > tol);
  if (off.length) {
    out.push(finding("geom", meta, prop,
      sides.map((k) => d[k] ?? 0).join("/"),
      sides.map((k) => r[k] ?? 0).join("/"),
      `match design ${prop}`, "medium"));
  }
}
function numCmp(out, meta, tol, prop, d, r, tok) {
  if (d == null) return;
  if (r == null || Math.abs(d - r) > tol) {
    out.push(finding(tok ? "mis-bind" : "geom", meta, prop,
      tok ? `${d}px (${tok})` : `${d}px`, r == null ? "—" : `${r}px`,
      tok ? `apply ${tok}` : `match design (${d}px)`, "medium"));
  }
}
function typeCmp(out, meta, tol, d, r) {
  const diffs = [];
  if (d.family && d.family !== r.family) diffs.push(`family ${d.family}→${r.family || "—"}`);
  if (d.size != null && Math.abs(d.size - (r.size ?? -99)) > tol) diffs.push(`size ${d.size}→${r.size ?? "—"}`);
  if (d.weight != null && String(d.weight) !== String(r.weight)) diffs.push(`weight ${d.weight}→${r.weight ?? "—"}`);
  if (d.line != null && r.line != null && Math.abs(d.line - r.line) > tol) diffs.push(`line ${d.line}→${r.line}`);
  if (diffs.length) {
    out.push(finding("type", meta, "font", fmtFont(d), fmtFont(r), diffs.join(", "), "medium"));
  }
}

const norm = (v) => (v == null ? null : String(v).toLowerCase());
const fmtFont = (f) => (f && f.size ? `${f.weight ?? "?"} ${f.size}px ${f.family ?? "?"}` : "—");
const round2 = (n) => Math.round(n * 100) / 100;

function finding(tag, meta, prop, expected, actual, fix, severity) {
  return { tag, prop, expected, actual, fix, severity, ...meta };
}

// ------------------------------------------------------------------- run ------
export function diff(design, render, { tol = 1, minconf = 0.45 } = {}) {
  const { pairs, extra, dCount } = matchTrees(design, render, { minconf });
  const findings = [];
  let matched = 0, lowConf = 0;

  for (const p of pairs) {
    if (!p.r) {
      // unbuilt, OR built but no confident match — say both, don't invent findings.
      // box:null — there's no rendered location to pin, so it's table-only.
      findings.push({ tag: "missing-node", nodeId: p.d.node.id, selector: null, box: null,
        prop: "—", expected: label(p.d.node), actual: "no confident render match",
        fix: "build it, or tag with data-topknot if it exists", severity: "high", confidence: 0,
        role: p.d.node.role, text: p.d.node.text });
      continue;
    }
    matched++;
    if (p.confidence < 0.8) lowConf++;
    p.d._conf = p.confidence;
    findings.push(...comparePair(p.d, p.r, tol));
  }
  for (const r of extra) {
    findings.push({ tag: "extra-node", nodeId: null, selector: r.node.selector || r.path, box: r.node.box,
      prop: "—", expected: "not in design", actual: label(r.node), fix: "remove or confirm intentional",
      severity: "low", confidence: 1, role: r.node.role, text: r.node.text });
  }

  const byTag = {};
  for (const f of findings) byTag[f.tag] = (byTag[f.tag] || 0) + 1;
  return {
    findings,
    summary: { designNodes: dCount, matched, lowConfidence: lowConf, findings: findings.length, byTag },
  };
}

// ------------------------------------------------------------------- cli ------
function arg(name, def) {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : def;
}
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const [designPath, renderPath] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  if (!designPath || !renderPath) {
    console.error("usage: node visual-diff.mjs <design.json> <render.json> [--json] [--tol N] [--minconf N]");
    process.exit(1);
  }
  const design = JSON.parse(fs.readFileSync(designPath, "utf8"));
  const render = JSON.parse(fs.readFileSync(renderPath, "utf8"));
  const res = diff(design, render, {
    tol: parseFloat(arg("--tol", "1")),
    minconf: parseFloat(arg("--minconf", "0.45")),
  });

  if (process.argv.includes("--json")) {
    process.stdout.write(JSON.stringify(res, null, 2));
  } else {
    for (const f of res.findings) {
      const loc = f.selector ? ` @ ${f.selector}` : "";
      const conf = f.confidence < 0.8 ? ` ~${f.confidence}` : "";
      console.log(`${f.tag}: ${f.role || "node"}.${f.prop}${loc} — design ${f.expected}, code ${f.actual}. ${f.fix}.${conf}`);
    }
    const s = res.summary;
    const tags = Object.entries(s.byTag).map(([k, v]) => `${v} ${k}`).join(", ") || "none";
    console.error(`net: ${tags}. matched ${s.matched}/${s.designNodes}, ${s.lowConfidence} low-confidence.`);
    if (!res.findings.length) console.error("Adheres to design. Ship.");
  }
}
