---
id: ETH-056
title: Safety net: state invariants, soak test, app-boot smoke test and sim compare
type: chore
status: ready
priority: P0
milestone: M1
epic: tools-balance
size: M
depends_on: []
created: 2026-11-17
updated: 2026-11-17
---

## Summary
Automated checks that catch a broken game, not just a broken unit: invariants checked every step, a multi-seed soak run, an app-boot smoke test and a before/after sim comparison.

## Why
Dozens of items will land in quick succession. Each needs a cheap, uniform way to prove it didn't break runs that it doesn't directly test.

## Acceptance criteria
- [ ] `checkInvariants(state): string[]` in `src/sim/` checks entity/floor index consistency, party ids valid, positions in bounds, no NaN, plain data, dead actors not scheduled. Domains can register extra invariant checks (one registry, documented in ARCHITECTURE Contracts)
- [ ] A soak test in `npm test` runs 30 seeds to the turn cap, checks invariants every step, does a mid-run serialize/deserialize round-trip that must continue identically, and fails on any throw or `stuck` storm (more than N stuck events per run)
- [ ] `npm run soak -- --seeds N` runs the same soak at larger scale from the command line
- [ ] An app-boot smoke test renders `App` with an `InlineHost`, runs 300 turns and asserts no errors were logged and the map and party render
- [ ] `npm run sim -- --seeds N --compare <git-ref>` (or `--baseline <file>`) prints a before/after table of the report metrics; `--json` writes the report so a baseline can be saved
- [ ] README or ARCHITECTURE documents the gates a PR must pass

## Log
- 2026-11-17: Created as part of the backlog fan-out plan.
