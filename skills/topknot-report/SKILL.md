---
name: topknot-report
description: >
  Generate a token-drift report with Playwright screenshots. Runs topknot-diff,
  then shoots the live UI at the URLs/selectors where drift shows up, and
  assembles a single self-contained HTML report pairing each drift with its
  screenshot. Use when the user says "topknot report", "screenshot the drift",
  "visual token report", "show me where tokens are off", or invokes
  /topknot-report.
argument-hint: "[url] [code-path]"
license: MIT
---

Produce a drift report with evidence. Diff first, then screenshot only what
drifted. A report nobody asked to be long stays short.

## Steps

1. Run the `topknot-diff` comparison (Figma vs code). Get the drift list.
2. For each drift that's visible in the running app, shoot it:
   `node scripts/shoot.mjs <url> --selector "<css>" --out <name>.png`.
   No selector → full-page shot. Skip drifts with no on-screen surface
   (orphans, missing) — list them as text-only rows.
3. Assemble one self-contained HTML file: each row is `tag · token ·
   figma-value · code-value · screenshot`. Inline the PNGs as base64 so the
   report is a single portable file.

## Report shape

- Title + run timestamp + source-of-truth direction.
- One table, one row per finding. Color swatches for color tokens (render both
  the Figma value and the code value as little chips side by side).
- The `net:` summary line from the diff at the top.
- No prose between rows. The screenshots are the argument.

## Laziness

Don't screenshot what isn't visual. Don't shoot every viewport unless asked —
one is the default, name the lazier single-shot in lite. Reuse the diff output
verbatim; don't recompute or re-summarize it.

## Boundaries

Needs Playwright installed (`scripts/shoot.mjs` checks and tells you the one
install line if missing). Report is read-only evidence; applies no fixes.
"stop topknot-report" / "normal mode": revert.
