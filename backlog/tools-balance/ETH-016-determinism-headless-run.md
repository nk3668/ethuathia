---
id: ETH-016
title: "Determinism test and headless run script"
type: chore
status: ready
priority: P1
milestone: M0
epic: tools-balance
size: S
depends_on: [ETH-009, ETH-010]
created: 2026-11-16
updated: 2026-11-16
---

## Summary
A state-hash determinism test, a mid-run save round-trip test, and a `tools/` script that runs seeded runs headlessly and prints a short report.

## Why
Guards the sim's core contract and is the seed of the balance harness. See `docs/ARCHITECTURE.md` §10 and `CLAUDE.md` §9.

## Acceptance criteria
- [ ] The same seed and commands yield the same state hash across two runs, for at least 20 seeds
- [ ] Serializing mid-run, deserializing and continuing matches an uninterrupted run
- [ ] `npm run sim -- --seeds N` runs N floors headlessly and reports turns taken and explored percentage per seed
- [ ] Any seed that hits the turn cap or triggers stuck detection is listed in the report

## Notes
Grows into the full balance harness in M1 once there is combat and currency to measure.

## Log
- 2026-11-16: Created.
