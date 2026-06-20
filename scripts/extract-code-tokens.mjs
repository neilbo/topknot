#!/usr/bin/env node
// topknot: extract code-side design tokens into a flat { name: value } map.
// Auto-detects CSS custom properties, a Tailwind theme, or a W3C/Style
// Dictionary tokens JSON. Lazy on purpose: regex for CSS, require for JS/JSON,
// no AST, no postcss. Upgrade to a real parser only if these miss real tokens.
//
// Usage: node extract-code-tokens.mjs <file-or-dir> [--json]
// Prints a normalized token map to stdout (pretty by default, --json for raw).

import fs from "node:fs";
import path from "node:path";

const target = process.argv[2];
const asJson = process.argv.includes("--json");
if (!target) {
  console.error("usage: node extract-code-tokens.mjs <file-or-dir> [--json]");
  process.exit(1);
}

// --- normalize: lowercase hex, expand #abc -> #aabbcc, trim ---
function normalize(v) {
  if (typeof v !== "string") return String(v);
  let s = v.trim().toLowerCase();
  const short = s.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/);
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`;
  return s;
}

// --- CSS custom properties: --name: value; ---
function fromCss(text) {
  const out = {};
  const re = /(--[\w-]+)\s*:\s*([^;]+);/g;
  let m;
  while ((m = re.exec(text))) out[m[1]] = normalize(m[2]);
  return out;
}

// --- Tailwind theme: flatten theme.extend.colors/spacing/etc ---
function flatten(obj, prefix, out) {
  for (const [k, v] of Object.entries(obj || {})) {
    const key = prefix ? `${prefix}-${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) flatten(v, key, out);
    else out[key] = normalize(v);
  }
  return out;
}
async function fromTailwind(file) {
  const mod = await import(path.resolve(file));
  const cfg = mod.default ?? mod;
  const theme = { ...(cfg.theme || {}), ...((cfg.theme && cfg.theme.extend) || {}) };
  delete theme.extend;
  return flatten(theme, "", {});
}

// --- W3C / Style Dictionary JSON: { name: { $value | value } } nested ---
function fromTokenJson(obj, prefix, out) {
  for (const [k, v] of Object.entries(obj || {})) {
    if (v && typeof v === "object") {
      if ("$value" in v || "value" in v) {
        out[prefix ? `${prefix}-${k}` : k] = normalize(v.$value ?? v.value);
      } else {
        fromTokenJson(v, prefix ? `${prefix}-${k}` : k, out);
      }
    }
  }
  return out;
}

async function extractFile(file) {
  const ext = path.extname(file).toLowerCase();
  const text = fs.readFileSync(file, "utf8");
  if (ext === ".css" || ext === ".scss") return fromCss(text);
  if (file.includes("tailwind") && (ext === ".js" || ext === ".mjs" || ext === ".cjs" || ext === ".ts"))
    return await fromTailwind(file);
  if (ext === ".json") {
    const obj = JSON.parse(text);
    // tokens JSON if any leaf has $value/value, else try as-is
    return fromTokenJson(obj, "", {});
  }
  if (ext === ".js" || ext === ".mjs") return await fromTailwind(file).catch(() => ({}));
  return {};
}

function walk(dir, hits = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name.startsWith(".")) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, hits);
    else if (/\.(css|scss|json)$/.test(e.name) || /tailwind.*\.(js|mjs|cjs|ts)$/.test(e.name)) hits.push(full);
  }
  return hits;
}

const stat = fs.statSync(target);
const files = stat.isDirectory() ? walk(target) : [target];
const tokens = {};
for (const f of files) {
  try {
    Object.assign(tokens, await extractFile(f));
  } catch (err) {
    console.error(`skip ${f}: ${err.message}`);
  }
}

if (asJson) {
  process.stdout.write(JSON.stringify(tokens, null, 2));
} else {
  const keys = Object.keys(tokens).sort();
  console.error(`${keys.length} tokens from ${files.length} file(s)`);
  for (const k of keys) console.log(`${k}\t${tokens[k]}`);
}
