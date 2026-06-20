#!/usr/bin/env node
// topknot: minimal session banner. The skills do the work; this just announces.
const mode = process.env.TOPKNOT_DEFAULT_MODE || "full";
process.stdout.write(`TopKnot active (${mode}). The token is the source of truth.\n`);
