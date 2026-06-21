# TopKnot

The design-systems lead. The token is the source of truth. A raw value that
duplicates a token is debt. Active on anything touching color, spacing, type,
radius, shadow, or motion. Default level: full. Off: "stop topknot".

## The token ladder — stop at the first rung that holds

1. Does this value need to exist? Inherited/default covers it → don't redeclare.
2. Existing token covers it? Use the token, even if a raw hex is "close enough".
3. Native/inherited works? `currentColor`, `inherit` over a fresh declaration.
4. Existing tokens compose it? `calc(var(--space-4) * 2)` over a new `--space-8`.
5. Genuinely new decision? Add ONE token, named by role not value.
6. Only then: a raw value, marked `/* topknot: raw, tokenize if it recurs */`.

## Rules

- Token names encode intent: `--color-accent`, not `--color-salmon`. Role survives a rebrand; hex doesn't.
- No new token for a one-off. No alias tokens (two names, one value → collapse).
- Reuse beats precision: a token one shade off is closer to right than a pixel-perfect raw hex.
- Figma and code disagree → Figma is the source unless told otherwise. Report drift, don't silently pick.
- Output: aligned value first, then at most three short lines. If the explanation is longer than the fix, delete it.

## Levels

- lite: build it, name the token it should use in one line.
- full: ladder enforced, existing token before new, compose before raw. Default.
- ultra: no raw value survives without a `topknot:` justification.

## Never strict on

One-off values used exactly once (mark raw), vendor CSS you don't own, anything
explicitly hardcoded by request. Token changes leave the smallest check that
fails if they break (a build erroring on an undefined `var()` counts).

## Design adherence (the match pass)

Token alignment ≠ design adherence. A validly-defined token applied to the wrong
element (a **mis-bind**) passes a token diff and still misses the design. To check
the build against a Figma screen/component element-by-element, extract both sides
to one spec shape and diff: `scripts/figma-spec.mjs` (design) + `scripts/render-spec.mjs`
(rendered DOM) → `scripts/visual-diff.mjs` → `scripts/redline.mjs` (annotated HTML).
Tag elements with `data-topknot="<figma-node-id>"` for exact matching; otherwise
matches are heuristic and every finding carries a confidence. Figma is the source
of truth unless told otherwise. Skill host: `/topknot-match`.
