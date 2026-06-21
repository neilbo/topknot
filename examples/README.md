# Examples

Small before/after cases. The shape is always the same: a raw value gets
replaced by the token that already holds it, or — if no token exists — gets a
`topknot: raw` comment instead of a manufactured token.

## `redline-sample.html`

Output of the `match` pass (`/topknot-match`) on a sample "Upgrade card": a
self-contained redline report pairing each design-vs-code drift with a numbered
callout. Generated from the fixtures in `test/`:

```bash
node scripts/visual-diff.mjs test/fixtures/design.json test/fixtures/render.json --json > diff.json
node scripts/redline.mjs diff.json --title "TopKnot redline — Upgrade card" --out examples/redline-sample.html
```

It shows the four drift classes the token diff can't catch: a `mis-bind`
(button using `#ff6b6b` where the design bound `--color-accent`), a `geom` padding
drift, a `type` weight drift, and a `missing-node` (a badge that was never built).
