---
name: topknot-diff
description: >
  Compare design tokens between Figma and code and report the drift. Pulls
  tokens from Figma (variables) and from the repo (CSS custom properties,
  Tailwind theme, or a tokens JSON), matches them by name, and lists every
  mismatch one line at a time. Use when the user says "topknot diff",
  "compare figma and code tokens", "check token drift", "are my tokens
  aligned", "did the design change", or invokes /topknot-diff.
argument-hint: "[figma-file-or-node] [code-path]"
license: MIT
---

Compare Figma tokens against code tokens. One line per finding. The best
outcome is zero lines.

## Inputs

- **Figma side:** a Figma file/node URL or key. Pull variables with the Figma
  MCP `get_variable_defs` (loads via tool_search "figma variables"). If no
  Figma access, ask for an exported `variables.json` instead.
- **Code side:** point `scripts/extract-code-tokens.mjs` at the repo. It
  auto-detects the format — CSS custom properties, Tailwind `theme`, or a W3C /
  Style Dictionary tokens JSON — and emits a flat `{ name: value }` map. Run:
  `node scripts/extract-code-tokens.mjs <path>`.

Normalize both sides before comparing: lowercase hex, expand shorthand
(`#fff` → `#ffffff`), strip units where comparable, resolve aliases to their
final value. Compare normalized values, not strings.

## Format

`<tag> <token>: <detail>. <fix>.`

Tags:

- `drift:` same token name, different value. `--color-accent: figma #fa8072, code #ff6b6b. Code is stale — match Figma.`
- `raw:` a hardcoded value in code equal to a token's value. `#fa8072 at button.css:L20 = --color-accent. Use the token.`
- `orphan:` code token with no Figma counterpart. `--color-legacy-blue: in code, not in Figma. Stale, or document it.`
- `missing:` Figma token never implemented in code. `space/2xl: in Figma, no code token. Add it or drop from Figma.`
- `alias:` two tokens, identical value, different names. `--color-brand == --color-primary (#1e2327). Collapse to one.`

## Source of truth

Figma wins by default — report code as the thing to change. If the user says
code is authoritative, flip the arrow. Never silently pick a winner; the
direction is the user's call, your job is to surface the gap.

## Scoring

End with the only line that matters:
`net: <D> drifts, <R> raw values, <O> orphans, <M> missing.`

If everything matches: `Tokens aligned. Ship.` and stop.

## Boundaries

Scope: token alignment only. Visual bugs, accessibility contrast, and layout
are out of scope — route them elsewhere. Lists the drift; does not apply fixes
unless asked. "stop topknot-diff" / "normal mode": revert.
