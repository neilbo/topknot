---
name: topknot-help
description: >
  Quick reference for TopKnot commands and intensity levels. Use when the user
  says "topknot help", "what can topknot do", or invokes /topknot-help.
---

TopKnot — the design-systems lead. The token is the source of truth.

| Command | What it does |
|---------|--------------|
| `/topknot [lite\|full\|ultra]` | Set intensity, or report current level. |
| `/topknot-diff` | Compare Figma vs code tokens, list every drift. |
| `/topknot-report` | Diff + Playwright screenshots into one HTML drift report. |
| `/topknot-audit` | Scan the whole repo for raw values that should be tokens. |
| `/topknot-help` | This. |

Levels: **lite** names the token you should use; **full** (default) enforces
the token ladder; **ultra** lets no raw value survive without a `topknot:`
justification.

Turn off: "stop topknot" / "normal mode".
