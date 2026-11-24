---
id: ETH-180
title: Stat tooltips name a ranked upgrade once, with its rank count
type: feature
status: done
priority: P3
milestone: M2
epic: town-meta
size: S
depends_on: [ETH-172]
created: 2026-11-24
updated: 2026-11-24
---

## Summary
A stat tooltip lists a ranked upgrade once with its count ("Hardy Recruits ×3: +9 max HP"), not once per rank.

## Why
ETH-172 applies a ranked node's bundle once per rank, so tooltips that credit bundles by source repeat the node's name for every rank. Found in the ETH-172 review; Nate asked for it (2026-11-24).

## Acceptance criteria
- [x] Stat tooltips (party card and Prepare preview) group identical sources and show "×N" with the summed value
- [x] The same grouping applies to run-scope modifiers keyed `<id>#<rank>`
- [x] Tests: a rank-3 node shows once with ×3 and the summed value

## Log
- 2026-11-24: Created from the ETH-172 review; Nate said yes.
- 2026-11-24: Done. `groupStatParts`/`groupLabel` (src/sim/stats/groupParts.ts) fold identical sources (base id, label, op; `#n` suffix ignored), used by the party card attribute chip. Prepare preview lists no per-source parts today, so nothing to change there. sim --compare origin/main: identical hashes.
