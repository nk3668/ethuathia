---
id: ETH-180
title: Stat tooltips name a ranked upgrade once, with its rank count
type: feature
status: ready
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
- [ ] Stat tooltips (party card and Prepare preview) group identical sources and show "×N" with the summed value
- [ ] The same grouping applies to run-scope modifiers keyed `<id>#<rank>`
- [ ] Tests: a rank-3 node shows once with ×3 and the summed value

## Log
- 2026-11-24: Created from the ETH-172 review; Nate said yes.
