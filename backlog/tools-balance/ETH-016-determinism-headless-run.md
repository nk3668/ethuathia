---
id: ETH-016
title: "Determinism test and headless run script"
type: chore
status: done
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
- [x] The same seed and commands yield the same state hash across two runs, for at least 20 seeds
- [x] Serializing mid-run, deserializing and continuing matches an uninterrupted run
- [x] `npm run sim -- --seeds N` runs N floors headlessly and reports turns taken and explored percentage per seed
- [x] Any seed that hits the turn cap or triggers stuck detection is listed in the report

## Notes
Grows into the full balance harness in M1 once there is combat and currency to measure.

## Log
- 2026-11-16: Created.
- 2026-11-16: Started.
- 2026-11-16: Done. `stateHash` (core `hashText` over `serialize`), `test/sim/determinism.test.ts` (20 seeds run twice with a command script; save/load at three points on four seeds), and `npm run sim` (`tools/sim.ts` + `tools/headless.ts`, run with `tsx`, added as a dev dependency because Vitest can't take script arguments and Node's type stripping can't resolve extensionless imports). Snapshots gained `floor.explored` and `SimSession` gained `stateHash()` so the script needs no access to `RunState`. No nondeterminism found; seeds 1–200 (party of 1) and 1–100 (party of 4) all finish with nothing flagged. Filed ETH-022.
