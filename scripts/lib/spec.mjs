// topknot: shared helpers for the visual-adherence pipeline.
// The "spec node" is the one contract both sides emit (Figma + rendered DOM) so
// the diff engine never knows the source. Lazy on purpose: plain functions, no
// deps. See docs/visual-adherence-plan.md for the shape.
//
//   { id, role, text, box:{x,y,w,h},
//     styles: { color, bg, padding:{t,r,b,l}, gap, radius,
//               font:{family,size,weight,line,spacing}, shadow, opacity },
//     tokenRefs: { <prop>: <token-name|null> },
//     children: [ specNode ] }
//
// styles are comparison-ready: colors are #rrggbb[aa] strings, lengths are px
// numbers. That keeps visual-diff.mjs free of unit/format bickering.

// --- colors: lowercase, expand #abc, rgb()/rgba() -> #rrggbb[aa] ---
function hex2(n) {
  return Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
}
export function normalizeColor(v) {
  if (v == null) return null;
  let s = String(v).trim().toLowerCase();
  if (!s || s === "transparent" || s === "none" || s === "rgba(0, 0, 0, 0)") return null;
  const short = s.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/);
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`;
  if (/^#[0-9a-f]{6}$/.test(s)) return s;
  if (/^#[0-9a-f]{8}$/.test(s)) return s.endsWith("ff") ? s.slice(0, 7) : s;
  const m = s.match(/^rgba?\(([^)]+)\)$/);
  if (m) {
    const p = m[1].split(",").map((x) => x.trim());
    const [r, g, b] = p.slice(0, 3).map((n) => (n.endsWith("%") ? (parseFloat(n) * 255) / 100 : parseFloat(n)));
    const a = p[3] != null ? parseFloat(p[3]) : 1;
    const base = `#${hex2(r)}${hex2(g)}${hex2(b)}`;
    return a >= 1 ? base : `${base}${hex2(a * 255)}`;
  }
  return s; // named colors etc. pass through for a string compare
}

// --- lengths: parse the leading number, return px as a Number (or null) ---
export function px(v) {
  if (v == null || v === "") return null;
  if (typeof v === "number") return v;
  const n = parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

// --- shadow: collapse whitespace, normalize the color inside ---
export function normalizeShadow(v) {
  if (!v || v === "none") return null;
  return String(v).trim().toLowerCase().replace(/\s+/g, " ")
    .replace(/rgba?\([^)]+\)/g, (c) => normalizeColor(c) || c);
}

// --- font: a structured, comparable shape ---
export function font({ family, size, weight, line, spacing } = {}) {
  const fam = family ? String(family).split(",")[0].trim().replace(/['"]/g, "").toLowerCase() : null;
  return {
    family: fam,
    size: px(size),
    weight: weight != null ? Number(weight) || weight : null,
    line: px(line),
    spacing: px(spacing),
  };
}

// --- tree walk: depth-first, callback gets (node, parent, path) ---
export function walk(node, fn, parent = null, path = "0") {
  fn(node, parent, path);
  (node.children || []).forEach((c, i) => walk(c, fn, node, `${path}.${i}`));
}

// --- flatten to a list with depth, path, and a box normalized to the root,
//     so two trees in different coordinate spaces can still be matched. ---
export function flatten(tree) {
  const root = tree.box || { x: 0, y: 0, w: 1, h: 1 };
  const rw = root.w || 1;
  const rh = root.h || 1;
  const list = [];
  walk(tree, (n, parent, path) => {
    const b = n.box || { x: 0, y: 0, w: 0, h: 0 };
    list.push({
      node: n,
      parent,
      path,
      depth: path.split(".").length - 1,
      nbox: { x: (b.x - root.x) / rw, y: (b.y - root.y) / rh, w: b.w / rw, h: b.h / rh },
    });
  });
  return list;
}

// --- box similarity in normalized space: 1.0 identical, 0 far apart ---
export function boxSim(a, b) {
  const d = Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.w - b.w) + Math.abs(a.h - b.h);
  return Math.max(0, 1 - d / 2);
}

// --- a short, stable label for a node, for logs and report rows ---
export function label(n) {
  const t = n.text ? ` "${String(n.text).slice(0, 24)}"` : "";
  return `${n.role || "node"}${t}`;
}
