---
id: ETH-056
title: Safety net: state invariants, soak test, app-boot smoke test and sim compare
type: chore
status: done
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
- [x] `checkInvariants(state): string[]` in `src/sim/` checks entity/floor index consistency, party ids valid, positions in bounds, no NaN, plain data, dead actors not scheduled. Domains can register extra invariant checks (one registry, documented in ARCHITECTURE Contracts)
- [x] A soak test in `npm test` runs 30 seeds to the turn cap, checks invariants every step, does a mid-run serialize/deserialize round-trip that must continue identically, and fails on any throw or `stuck` storm (more than N stuck events per run)
- [x] `npm run soak -- --seeds N` runs the same soak at larger scale from the command line
- [x] An app-boot smoke test renders `App` with an `InlineHost`, runs 300 turns and asserts no errors were logged and the map and party render
- [x] `npm run sim -- --seeds N --compare <git-ref>` (or `--baseline <file>`) prints a before/after table of the report metrics; `--json` writes the report so a baseline can be saved
- [x] README or ARCHITECTURE documents the gates a PR must pass

## Log
- 2026-11-17: Created as part of the backlog fan-out plan.
- 2026-11-17: Started.
- 2026-11-17: Done. `src/sim/invariants.ts` (`checkInvariants`, `registerInvariant`, `listInvariants`); `tools/soak.ts` with `test/sim/soak.test.ts` (30 seeds, 150 party turns) and `npm run soak`; `test/ui/appBoot.test.tsx`; `npm run sim -- --json / --compare / --baseline` (`tools/compare.ts`). Documented in ARCHITECTURE §11 "Invariants and gates" (its own section, so it merges cleanly with ETH-055's Contracts section) and the Gates section of `backlog/README.md`. The stuck-storm limit `MAX_STUCK_PER_RUN` is 5: seeds 1-200 at 2000 turns fire none. The suite-wide `testTimeout` is raised to 20 s so seed sweeps don't time out when the suite runs in parallel.
- 2026-11-17: (default) The soak steps the saved-and-loaded copy alongside the original for a 50-step window, not the rest of the run, to keep `npm test` fast; whole-run continuation stays in the determinism test. Alternative: compare to the end of the run (about 1.5x the soak's cost).
- 2026-11-17: (default) `--compare` runs the ref's own harness in a temporary git worktree under `.sim-compare/` in the checkout, using the checkout's `node_modules`. Alternative: `npm ci` in a temp dir outside the repo (slow, about a minute per compare).
