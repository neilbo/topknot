# TopKnot — Visual Adherence Plan

> Proposed addition to TopKnot. Branch: `feat/visual-adherence`. Status: planning.
> Some phases land in this PR; later phases are flagged for the maintainer to pick up.

## The gap we're closing

Today TopKnot validates the **token layer**: it compares token *dictionaries*
(Figma variables vs code tokens) and flags raw values that duplicate a token.
It is blind to whether the **build actually matches the design**:

- **Mis-binding** — the right element using the *wrong* token/value
  (`color: var(--color-muted)` on a heading the design wanted in `--color-accent`).
  Both tokens are validly defined → `topknot-diff` reports "aligned" while the screen is wrong.
- **Off-spec raw values with no token counterpart** — design says 24px, code shipped 20px,
  no spacing token exists. Invisible to the dictionary diff.
- **Per-element geometry / type / effects** — padding, gap, radius, font weight, shadow that
  drifted from the design node but were never expressed as tokens.

We want TopKnot to **match a Figma screen/component (and its nested/attached components)
against what the dev actually rendered, element by element**, then **show the dev exactly
what's off** through annotated, redlined visuals.

### Honesty about "exactly"

Pixel-exact match is not the goal and isn't achievable (font hinting, anti-aliasing,
responsive breakpoints, dynamic content). We match **resolved style + intent per element,
within declared tolerances** — color exact, geometry within N px, type by family/size/weight.
We always report a **coverage/confidence** line so a partial match never reads as a clean pass.

## Architecture — one core, several surfaces

```
                 ┌──────────────────┐
  Figma node ──▶ │ figma-spec.mjs   │ ─┐  normalized
                 └──────────────────┘  │  "spec tree"
                                        ▼
                 ┌──────────────────┐  ┌──────────────────┐   findings[]
  running app ─▶ │ render-spec.mjs  │─▶│  visual-diff.mjs  │ ─────────────┐
  (Playwright)   └──────────────────┘  │  match + compare  │              │
                                        └──────────────────┘              │
                                                                          ▼
                       ┌───────────────────────┬───────────────────────┬───────────────────┐
                       ▼                        ▼                       ▼                   ▼
                redline.mjs            topknot-figma-annotate     chrome-extension      /topknot-match
              (annotated HTML)         (write back to Figma)    (designer on staging)   (agent CLI)
```

The **core** (extract → match → diff) is source- and surface-agnostic. Every output
surface consumes the same `findings[]` contract, so surfaces can be built independently.

### Shared data contract — the "spec node"

Both extractors emit the same shape so the diff engine never knows or cares about the source:

```jsonc
{
  "id": "1:23",                 // figma node id, or a stable DOM path on the render side
  "role": "button",            // semantic/role hint for matching
  "text": "Sign up",           // text content if any (matching signal)
  "box": { "x": 0, "y": 0, "w": 120, "h": 40 },
  "styles": {                   // resolved/computed values, normalized
    "color": "#ffffff", "bg": "#fa8072", "padding": "8px 16px",
    "gap": "8px", "radius": "6px", "font": "600 14px/20px Inter", "shadow": "..."
  },
  "tokenRefs": {                // which token (if any) each prop resolves to
    "bg": "--color-accent", "radius": "--radius-md", "color": null
  },
  "children": [ /* spec nodes */ ]
}
```

- **Design side** fills `tokenRefs` from Figma variable *bindings* on the node.
- **Render side** fills `styles` from `getComputedStyle`, then back-resolves `tokenRefs`
  by matching each computed value against the known token set
  (reuses the existing `extract-code-tokens.mjs`).

### New finding vocabulary (extends the diff tags)

Reuse `drift:` / `raw:` / `near:` and add element-level tags:

| Tag            | Meaning |
|----------------|---------|
| `mis-bind:`    | Right element, wrong token/value vs design. *The headline gap.* |
| `geom:`        | Spacing/size/radius off (padding, gap, w/h, radius). |
| `type:`        | Typography off (family / size / weight / line-height / tracking). |
| `effect:`      | Shadow / blur / opacity off. |
| `missing-node:`| Design node has no rendered counterpart (not built). |
| `extra-node:`  | Rendered element with no design counterpart. |

Every finding carries: `nodeId`, `selector`/path, `prop`, `expected` (design),
`actual` (render), `box` (for overlay positioning), `severity`, `confidence`, and a `fix`.

### The crux: correspondence (design node ↔ DOM element)

This determines accuracy. Two tiers, tried in order:

1. **Explicit map (deterministic).** Dev annotates elements with `data-topknot="<figma-node-id>"`,
   or supplies a `selector → nodeId` JSON. Exact, zero ambiguity. Opt-in.
2. **Heuristic tree alignment (zero-config).** Align trees by role/type, sibling order,
   text content, and box proportion. Fuzzy → every finding gets a `confidence`, and the run
   emits a coverage line (`matched 18/22 nodes, 3 low-confidence`).

Default: try (1), fall back to (2), **always** print coverage so a weak match is never silent.

---

## Phases

Legend: **[today]** = candidate to build now · **[follow-up]** = good for the maintainer to own.

### Phase 0 — Branch + plan + scope **[today]**
- `feat/visual-adherence` branch, this doc. Agree what lands in the first PR.

### Phase 1 — Design-spec extraction · `scripts/figma-spec.mjs` **[today/near]**
- Input: a Figma file/node URL or key. Output: normalized spec tree (above).
- Source: Figma MCP (`get_variable_defs`, plus node geometry/styles) or Figma REST
  `GET /v1/files/:key/nodes?ids=…` with a token. Walk the node tree, capture per-node
  resolved styles + variable bindings, recurse into **component instances / nested instances**
  ("attached components").
- Lazy-first, matching repo style: REST/JSON, no heavyweight Figma SDK.
- Hard part: resolving variable *bindings* per property (not just the variable table).

### Phase 2 — Rendered-spec extraction · `scripts/render-spec.mjs` **[today/near]**
- Input: a URL (+ optional root selector). Output: spec tree from the live DOM.
- Built on Playwright (already an optional dep, reuses `shoot.mjs` setup): walk DOM,
  `getComputedStyle` per element, capture bounding boxes, back-resolve tokens via
  `extract-code-tokens.mjs`.
- Emits boxes that later drive overlay positioning in the redline report.

### Phase 3 — Match + diff engine · `scripts/visual-diff.mjs` + skill `topknot-match` **[today/near]**
- Implements the correspondence tiers and the per-node/per-prop comparison with tolerances.
- Emits `findings[]` in the contract above + a `coverage` summary.
- New skill `skills/topknot-match/SKILL.md` (keeps `topknot-diff` focused on the token
  dictionary). Terse output in TopKnot's voice; one line per finding; ends with a `net:` line.
- `bin`: `topknot-match`.

### Phase 4 — Annotated redline HTML · `scripts/redline.mjs`, extend `topknot-report` **[today/near]**
- Input: `findings[]` + a screenshot of the component (via `shoot.mjs`).
- Output: one **self-contained, throwaway** HTML file — the dev's screenshot with
  absolutely-positioned redline callouts at each mismatched node's box: property,
  expected-vs-actual, color-swatch chips, severity color. Base64-inline the image
  (matches the existing `topknot-report` "single portable file" ethos).
- This is the highest-value, fully self-contained, pure-Node deliverable. Likely the
  centerpiece of the first PR.

### Phase 5 — Write back to Figma · skill `topknot-figma-annotate` **[follow-up]**
- Goal: render an annotated representation *in Figma* — the dev's actual output placed
  beside/over the design with mistakes + fixes overlaid.
- Write path needs verification (research task):
  - **REST comments (reliable MVP):** `POST /v1/files/:key/comments` pinned to node
    coordinates — definitely available with a token; good first cut.
  - **Figma plugin (most capable):** small Plugin-API plugin that draws an annotated
    frame (places the render image, adds redline layers/pins). Separate artifact.
  - **Write-capable MCP (Figma's own Dev Mode MCP is read-oriented; "Figma Console MCP"
    TBD):** use node-creation/comment tools if exposed. **Verify before committing.**
- Recommend shipping the REST-comment MVP, leaving the full plugin to the maintainer.

### Phase 6 — Chrome extension for designers · `chrome-extension/` **[follow-up]**
- Goal: a designer runs the check on **staging/prod** against what the dev already pushed,
  gets the annotated diff, and sends it to the dev (attach to a **Linear** ticket).
- MV3 extension: content script runs the `render-spec` extraction on the active tab;
  fetches/loads the matching Figma spec; runs the diff; draws the redline overlay in-page
  and/or produces the HTML report; creates/updates a Linear issue (Linear API/MCP) with
  the redline image + `net:` summary attached.
- Largest, most separable piece (own bundler, prod auth/CSP/CORS, data-egress/privacy
  consent, cross-origin Figma fetch via a small backend). Reuses the entire core unchanged.
- Strong **[follow-up]** / maintainer-owned candidate.

### Phase 7 — Docs, examples, smallest-check, PR **[today + follow-up]**
- Update `README.md` (new commands), `AGENTS.md` (host-agnostic note), `examples/`
  (a sample redline report).
- Per TopKnot's "smallest check that fails" rule: a tiny fixture (known-good design spec +
  a deliberately-drifted render) asserting the diff finds exactly the seeded mismatches.
- Open PR to the maintainer; mark phases included vs. left as follow-ups.

---

## Risks / open questions
- **Correspondence accuracy** without `data-*` attrs — the central risk. Mitigation:
  confidence + coverage reporting, opt-in explicit mapping.
- **Figma write-back surface** — confirm whether the available MCP allows node/comment
  creation; REST comments are the safe fallback.
- **Chrome-on-prod** — auth'd pages, CSP, and sending UI data to a backend need explicit
  designer consent; keep it opt-in and transparent.
- **Scope** — this is effectively four sub-projects. Sequence so each phase is independently
  valuable and mergeable; keep every change additive and in TopKnot's lazy, terse style so
  it's easy for the maintainer to accept.

## Suggested first PR
Phases 1–4 + 7 (extract → match → diff → **redline HTML** + a fixture check). Self-contained,
pure-Node, no new hard deps, matches the plugin's existing ethos. Figma write-back (5) and
the Chrome extension (6) follow as separate PRs the maintainer can own.
