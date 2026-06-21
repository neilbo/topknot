#!/usr/bin/env node
// topknot: extract a normalized spec tree from Figma — the design side of the
// visual-adherence diff. Reads the shape Figma's REST returns from
// GET /v1/files/:key/nodes (also what you can save from the Dev Mode MCP), and
// recurses through frames, instances, and nested/attached components.
//
// Lazy-first, like extract-code-tokens.mjs: JSON in, spec out. No Figma SDK.
//
// Usage (offline — recommended for now):
//   node figma-spec.mjs <nodes.json> [--vars variables.json] [--root <id>] [--json]
// Usage (live — needs a token + Node 18+ fetch):
//   node figma-spec.mjs --file <key> --ids 1:23 --token $FIGMA_TOKEN [--json]
//
// --vars  maps Figma variable id -> token name so tokenRefs read by ROLE, not id.
//         Shape: { "VariableID:1:2": "--color-accent", ... } or get_variable_defs output.

import fs from "node:fs";
import { font as mkFont } from "./lib/spec.mjs";

// --- Figma SOLID color {r,g,b,a} (0..1) -> #rrggbb[aa] ---
function figmaColor(fill) {
  if (!fill || !fill.color) return null;
  const { r, g, b } = fill.color;
  const a = fill.opacity != null ? fill.opacity : (fill.color.a != null ? fill.color.a : 1);
  const h = (n) => Math.round(n * 255).toString(16).padStart(2, "0");
  const base = `#${h(r)}${h(g)}${h(b)}`;
  return a >= 1 ? base : `${base}${h(a)}`;
}
function firstSolid(arr) {
  return (arr || []).find((f) => f.type === "SOLID" && f.visible !== false);
}

// --- resolve a property's bound variable id -> token name (if --vars given) ---
function boundToken(node, prop, vars) {
  const bv = node.boundVariables && node.boundVariables[prop];
  const alias = Array.isArray(bv) ? bv[0] : bv; // fills is an array, most are scalar
  const id = alias && alias.id;
  if (!id) return null;
  return (vars && (vars[id] || vars[id]?.name)) || id; // fall back to raw id
}

function shadowOf(effects) {
  const e = (effects || []).find((x) => (x.type === "DROP_SHADOW" || x.type === "INNER_SHADOW") && x.visible !== false);
  if (!e) return null;
  const c = figmaColor({ color: e.color });
  const o = e.offset || { x: 0, y: 0 };
  return `${e.type === "INNER_SHADOW" ? "inset " : ""}${o.x}px ${o.y}px ${e.radius || 0}px ${c || ""}`.trim();
}

// --- role: lean on the layer name, fall back to type ---
function roleOf(node) {
  const name = (node.name || "").toLowerCase().trim();
  if (name) return name.replace(/\s+/g, "-").slice(0, 40);
  return (node.type || "node").toLowerCase();
}

function radiusOf(node) {
  if (node.cornerRadius != null) return node.cornerRadius;
  const r = node.rectangleCornerRadii;
  return Array.isArray(r) ? Math.max(...r) : null;
}

function toSpec(node, vars) {
  const box = node.absoluteBoundingBox
    ? { x: node.absoluteBoundingBox.x, y: node.absoluteBoundingBox.y, w: node.absoluteBoundingBox.width, h: node.absoluteBoundingBox.height }
    : { x: 0, y: 0, w: 0, h: 0 };

  const fill = firstSolid(node.fills);
  const isText = node.type === "TEXT";
  const st = node.style || {};

  const styles = {
    // for text, the fill is the text color; for containers it's the background
    color: isText ? figmaColor(fill) : null,
    bg: isText ? null : figmaColor(fill),
    padding: node.paddingLeft != null || node.paddingTop != null
      ? { t: node.paddingTop || 0, r: node.paddingRight || 0, b: node.paddingBottom || 0, l: node.paddingLeft || 0 }
      : null,
    gap: node.itemSpacing != null && node.layoutMode && node.layoutMode !== "NONE" ? node.itemSpacing : null,
    radius: radiusOf(node),
    font: isText ? mkFont({ family: st.fontFamily, size: st.fontSize, weight: st.fontWeight, line: st.lineHeightPx, spacing: st.letterSpacing }) : null,
    shadow: shadowOf(node.effects),
    opacity: node.opacity != null ? node.opacity : null,
  };

  const tokenRefs = {
    color: isText ? boundToken(node, "fills", vars) : null,
    bg: isText ? null : boundToken(node, "fills", vars),
    radius: boundToken(node, "topLeftRadius", vars) || boundToken(node, "cornerRadius", vars),
    gap: boundToken(node, "itemSpacing", vars),
  };

  const spec = {
    id: node.id,
    role: roleOf(node),
    text: node.type === "TEXT" ? (node.characters || "").slice(0, 80) : null,
    box,
    styles,
    tokenRefs,
    children: (node.children || [])
      .filter((c) => c.visible !== false)
      .map((c) => toSpec(c, vars)),
  };
  if (node.type === "INSTANCE" && node.componentId) spec.componentId = node.componentId; // attached component
  return spec;
}

// pull the requested document node out of a REST /nodes response (or accept a bare node)
function pickDocument(json, rootId) {
  if (json.nodes) {
    const key = rootId && json.nodes[rootId] ? rootId : Object.keys(json.nodes)[0];
    return json.nodes[key].document;
  }
  return json.document || json;
}

// flatten get_variable_defs / variables list into { id|name : name }
function loadVars(path) {
  if (!path) return null;
  const j = JSON.parse(fs.readFileSync(path, "utf8"));
  if (j.meta && j.meta.variables) {
    const out = {};
    for (const [id, v] of Object.entries(j.meta.variables)) out[id] = v.name?.replace(/\//g, "-") || id;
    return out;
  }
  return j; // already a flat { id: name } map
}

async function fetchNodes(key, ids, token) {
  const url = `https://api.figma.com/v1/files/${key}/nodes?ids=${encodeURIComponent(ids)}`;
  const res = await fetch(url, { headers: { "X-Figma-Token": token } });
  if (!res.ok) throw new Error(`Figma REST ${res.status}: ${await res.text()}`);
  return res.json();
}

// --------------------------------------------------------------------- cli ----
function arg(name, def) {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : def;
}
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const vars = loadVars(arg("--vars", null));
  const file = arg("--file", null);
  let json;
  if (file) {
    const token = arg("--token", process.env.FIGMA_TOKEN);
    if (!token) { console.error("live mode needs --token or FIGMA_TOKEN"); process.exit(1); }
    json = await fetchNodes(file, arg("--ids", ""), token);
  } else {
    const path = process.argv[2];
    if (!path || path.startsWith("--")) {
      console.error("usage: node figma-spec.mjs <nodes.json> [--vars vars.json] [--root id] [--json]");
      console.error("   or: node figma-spec.mjs --file <key> --ids 1:23 --token $FIGMA_TOKEN");
      process.exit(1);
    }
    json = JSON.parse(fs.readFileSync(path, "utf8"));
  }
  const doc = pickDocument(json, arg("--root", null));
  const spec = toSpec(doc, vars);
  process.stdout.write(JSON.stringify(spec, null, 2)); // the spec tree IS the output
}

export { toSpec, figmaColor, pickDocument };
