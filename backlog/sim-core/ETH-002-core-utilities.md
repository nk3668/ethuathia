---
id: ETH-002
title: "Core utilities: seeded RNG streams, Grid and Registry"
type: feature
status: done
priority: P0
milestone: M0
epic: sim-core
size: M
depends_on: [ETH-001]
created: 2026-11-16
updated: 2026-11-16
---

## Summary
The dependency-free helpers in `src/core/` that every other layer uses.

## Why
Determinism needs a seeded, serializable RNG; maps need a grid type; content needs a registry. See `docs/ARCHITECTURE.md` §2.1 and §3.4.

## Acceptance criteria
- [x] RNG (sfc32) gives the same sequence for the same seed, and its state can be saved and restored mid-sequence
- [x] Named streams derived from one seed are independent: drawing from one does not change another
- [x] RNG helpers exist for integer range, chance, pick and shuffle
- [x] `Grid` wraps a typed array with bounds-checked get/set, neighbor iteration and plain-data serialization
- [x] `Registry` throws on duplicate and unknown ids and lists all entries in registration order

## Notes
Also add the number formatter here (1.2k, 3.4M) since `core` is its home; small enough to include.

## Log
- 2026-11-16: Created.
- 2026-11-16: Started.
- 2026-11-16: Done. `src/core/` now has `rng.ts`, `grid.ts`, `registry.ts` and `format.ts`, with tests in `test/core/`. `Grid` serializes run-length encoded and rejects values that don't fit the cell type. `formatNumber` truncates (999,999 → `999.9k`) and drops a trailing `.0`. Left an open note on ETH-003 about the class-based `Grid` vs the plain-data rule.
