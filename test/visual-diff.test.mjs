// topknot: the smallest check that fails if the diff breaks. A known design spec
// vs a deliberately-drifted render spec must surface exactly the seeded
// mismatches — no more, no fewer. Run: node --test
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { diff } from "../scripts/visual-diff.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const load = (f) => JSON.parse(fs.readFileSync(path.join(here, "fixtures", f), "utf8"));
const design = load("design.json");
const render = load("render.json");

const { findings, summary } = diff(design, render, { tol: 1 });
const has = (tag, prop, role) =>
  findings.find((f) => f.tag === tag && (prop ? f.prop === prop : true) && (role ? f.role === role : true));

test("catches the mis-bind: button used the wrong color, design bound a token", () => {
  const f = has("mis-bind", "bg", "button");
  assert.ok(f, "expected a mis-bind on button.bg");
  assert.match(f.expected, /--color-accent/);
  assert.match(f.actual, /#ff6b6b/);
});

test("catches geometry drift: button padding is off", () => {
  assert.ok(has("geom", "padding", "button"), "expected a geom finding on button.padding");
});

test("catches typography drift: label font weight is off", () => {
  assert.ok(has("type", "font", "label"), "expected a type finding on label.font");
});

test("catches the unbuilt node: badge exists in design, not in render", () => {
  const f = has("missing-node");
  assert.ok(f, "expected a missing-node");
  assert.equal(f.role, "badge");
});

test("no false positives: the card and title match the design exactly", () => {
  assert.ok(!findings.some((f) => f.role === "card"), "card should produce no findings");
  assert.ok(!findings.some((f) => f.role === "title"), "title should produce no findings");
});

test("summary counts add up and nothing is low-confidence (all id-matched)", () => {
  assert.equal(summary.designNodes, 5);
  assert.equal(summary.matched, 4);
  assert.equal(summary.lowConfidence, 0);
  assert.equal(summary.findings, 4);
});
