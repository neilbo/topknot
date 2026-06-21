<p align="center">
  <img src="assets/logo.png" width="220" alt="TopKnot, the design-systems lead">
</p>

# TopKnot

*He looks at the button. He looks at Figma. He says one word: "drift."*

Makes your AI agent think like the design-systems lead who owns the token file.
The token is the source of truth. Everything else is a copy waiting to drift.

TopKnot is to design tokens what [Ponytail](https://github.com/DietrichGebert/ponytail)
is to code: a lazy, minimal reflex that reaches for the existing token before
inventing a value, composes before going raw, and hunts the gap between what
Figma says and what the code shipped.

## What it does

- **Enforces the token ladder** on every value you write (color, spacing, type, radius, shadow, motion).
- **`/topknot-diff`** — pulls tokens from Figma and from your repo, matches them by name, lists every drift one line at a time.
- **`/topknot-match`** — matches a Figma screen/component (and its nested components) against what the dev actually rendered, element by element, and redlines every misalignment. Catches the **mis-bind**: the right element using the *wrong* token.
- **`/topknot-report`** — the diff plus Playwright screenshots, assembled into one self-contained HTML report so you can *see* where the drift lands.
- **`/topknot-audit`** — scans the whole repo for raw values that should be tokens.

### Token drift vs. design drift

`/topknot-diff` compares the token *dictionary* (Figma vars vs code tokens).
`/topknot-match` compares *application* — whether each rendered element uses the
value the design intended. Only `match` catches a validly-defined token applied to
the wrong element, off-spec spacing/type, or a design node that was never built.
See [`docs/visual-adherence-plan.md`](docs/visual-adherence-plan.md) for the roadmap
(Figma write-back and a designer Chrome extension are planned follow-ups).

## The token ladder

Before writing any style value, stop at the first rung that holds:

```
1. Does this value need to exist?   → inherited/default covers it: don't redeclare
2. Existing token covers it?         → use the token, even if "close enough"
3. Native/inherited works?           → currentColor / inherit over a fresh declaration
4. Existing tokens compose it?        → calc(var(--space-4) * 2) over a new --space-8
5. Genuinely new decision?            → add ONE token, named by role not value
6. Only then: a raw value, marked    → /* topknot: raw, tokenize if it recurs */
```

Strict, not pedantic: a value used exactly once is a raw value with a comment,
not a manufactured token. Vendor CSS and explicitly-requested hardcodes are
left alone.

## Install (Claude Code)

```
/plugin marketplace add neilbo/topknot
/plugin install topknot@topknot
```

For Cursor / Windsurf / Cline / Copilot and other instruction-only hosts, copy
`AGENTS.md` into the project (or the host's rules file). The always-on ladder
holds without the plugin; the slash commands need a skill-capable host.

## The diff, by hand

The two scripts work standalone, no agent required:

```bash
# extract code-side tokens (auto-detects CSS vars / Tailwind / tokens JSON)
node scripts/extract-code-tokens.mjs ./src --json > code-tokens.json

# screenshot a component for the report
node scripts/shoot.mjs http://localhost:3000 --selector ".btn-primary" --out btn.png
```

Pull the Figma side via the Figma MCP (`get_variable_defs`) or an exported
`variables.json`, then let `/topknot-diff` match them.

## Design adherence, by hand

The `match` pipeline is four standalone scripts — extract each side to the same
spec shape, diff, redline:

```bash
# design side: Figma REST nodes JSON -> spec tree (offline)
node scripts/figma-spec.mjs nodes.json --vars variables.json > design.json

# render side: walk the live DOM -> spec tree (needs Playwright)
node scripts/render-spec.mjs http://localhost:3000 --selector ".card" \
  --tokens code-tokens.json > render.json

# diff design vs render, then redline the result into one HTML file
node scripts/visual-diff.mjs design.json render.json --json > diff.json
node scripts/redline.mjs diff.json --shot card.png --out redline.html
```

Tag elements with `data-topknot="<figma-node-id>"` for exact matching; without it,
nodes are matched heuristically and each finding carries a confidence. See
[`examples/redline-sample.html`](examples/redline-sample.html) for sample output
and `npm test` for the seeded-drift check.

## Commands

| Command | What it does |
|---------|--------------|
| `/topknot [lite\|full\|ultra]` | Set intensity, or report current level. |
| `/topknot-diff` | Compare Figma vs code tokens, list every drift. |
| `/topknot-match` | Match a Figma screen/component vs the rendered build, element by element; redline the misalignments. |
| `/topknot-report` | Diff + Playwright screenshots into one HTML drift report. |
| `/topknot-audit` | Scan the whole repo for raw values that should be tokens. |
| `/topknot-help` | Quick reference. |

## License

[MIT](LICENSE). The shortest license that works.
