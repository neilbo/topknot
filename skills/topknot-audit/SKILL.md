---
name: topknot-audit
description: >
  Audit a whole repo for raw style values that should be tokens. Scans CSS,
  SCSS, Tailwind classes, and inline styles for hardcoded colors, spacing,
  radii, shadows, and font sizes, then matches each against the existing token
  set and reports what to replace. Use when the user says "topknot audit",
  "find hardcoded values", "audit my tokens", "what should be a token", or
  invokes /topknot-audit.
---

Audit the repo for raw values that duplicate or should be tokens. One line per
finding. The repo's best outcome is fewer raw values.

## What to flag

- `raw:` hardcoded value equal to an existing token. `#1e2327 at header.css:L8 = --color-bg. Swap in the token.`
- `near:` raw value one shade/step off a token. `#1e2428 at card.css:L3 ~ --color-bg (#1e2327). Drift or intentional? Tokenize.`
- `repeat:` same raw value in 3+ places, no token. `8px margin in 6 files. Add --space-2 and replace.`
- `magic:` unexplained raw number in a style path. `border-radius: 7px once. Mark topknot: raw or use --radius-md.`

Compare normalized values (lowercase hex, expanded shorthand). A raw value used
exactly once and nowhere else is fine — mark it `topknot: raw`, don't
manufacture a token for it.

## Format

`<file>:L<line>: <tag> <value>. <fix>.`

## Scoring

End with: `net: <N> raw values, <M> new tokens suggested.`
If clean: `Tokenized already. Ship.`

## Boundaries

Scope: raw-value-vs-token only. Not a correctness or a11y pass. Lists findings;
does not apply them. "stop topknot-audit" / "normal mode": revert.
