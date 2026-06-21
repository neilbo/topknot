---
name: topknot-match
description: >
  Match a Figma screen or component (and its nested/attached components) against
  what the dev actually rendered, element by element, and report where the build
  drifts from the design. Catches what topknot-diff can't: the RIGHT element using
  the WRONG token (mis-bind), off-spec spacing/size/type/effects, and design nodes
  that were never built. Produces an annotated redline HTML report. Use when the
  user says "topknot match", "does this match the design", "compare the component
  to Figma", "check design adherence", "redline this", "the build doesn't match
  the mock", or invokes /topknot-match.
argument-hint: "[figma-node] [url-or-selector]"
license: MIT
---

Match the rendered build against the Figma design, node by node. One line per
drift. The best outcome is zero lines — `Adheres to design. Ship.`

This is the visual-adherence pass. `topknot-diff` compares the token *dictionary*;
`topknot-match` compares *application* — whether each element uses the value the
design intended. It is the only pass that catches a **mis-bind**: a validly-defined
token applied to the wrong element.

## Pipeline

Three specs, one diff, one report. Each script is standalone (see `scripts/`):

1. **Design spec** — `node scripts/figma-spec.mjs <nodes.json> --vars <variables.json>`.
   Offline: save Figma's REST `GET /v1/files/:key/nodes` response (or the Dev Mode
   MCP node export) to a file. Live: `--file <key> --ids <id> --token $FIGMA_TOKEN`.
   `--vars` maps variable ids → token names so `tokenRefs` read by role, not id.
2. **Render spec** — `node scripts/render-spec.mjs <url> --selector "<root>" --tokens code-tokens.json`.
   Walks the live DOM (Playwright), reads computed styles, back-resolves each value
   to a code token via `extract-code-tokens.mjs` output. Needs Playwright; it prints
   the one install line if missing.
3. **Diff** — `node scripts/visual-diff.mjs <design.json> <render.json> [--json] [--tol N]`.
   Matches nodes, compares per-property, emits findings + a `net:` line.
4. **Redline** (optional, recommended) — `node scripts/redline.mjs <diff.json> --shot full.png --out report.html`.
   One self-contained HTML file: the screenshot with numbered callouts + a
   design-vs-code table. No `--shot` → a schematic wireframe from the node boxes.

## Matching — the crux

Correspondence (Figma node ↔ DOM element) drives accuracy. Hybrid, in order:

- **Explicit** — add `data-topknot="<figma-node-id>"` to elements. Exact, confidence 1.
- **Heuristic** — auto-align by role, text, depth, and box. Every pair carries a
  confidence; sub-threshold nodes are reported as `missing-node`, never force-matched.

Always read the coverage line. `matched 7/9, 2 low-confidence` means two nodes are
guesses — tag them with `data-topknot` before trusting their findings. A weak match
is surfaced, never silent.

## Findings vocabulary

`<tag>: <role>.<prop> @ <selector> — design <expected>, code <actual>. <fix>.`

- `mis-bind:` right element, wrong token/value. *The headline gap.* `button.bg — design #fa8072 (--color-accent), code #ff6b6b. apply --color-accent.`
- `geom:` spacing / size / radius off (beyond `--tol`, default 1px).
- `type:` typography off (family / size / weight / line-height).
- `effect:` shadow / opacity off.
- `missing-node:` in design, not confidently rendered. Build it, or tag it.
- `extra-node:` rendered, not in design.

## Source of truth

Figma wins by default — report code as the thing to change. Flip only if the user
says code is authoritative. Never silently pick; surface the gap.

## Scoring

End with the diff's own line:
`net: <counts by tag>. matched <M>/<D>, <L> low-confidence.`
Everything matched → `Adheres to design. Ship.` and stop.

## "exactly" is intent, not pixels

Don't chase anti-aliasing, font hinting, or sub-pixel layout. Match resolved
style + intent within tolerance. Responsive/dynamic content: match the viewport
and state the design specifies. Report coverage so a partial match never reads as
a clean pass.

## Boundaries

Scope: per-element design adherence. Token-dictionary alignment is `topknot-diff`;
raw-value hunting is `topknot-audit`. Lists drift; applies no fixes unless asked.
"stop topknot-match" / "normal mode": revert.
