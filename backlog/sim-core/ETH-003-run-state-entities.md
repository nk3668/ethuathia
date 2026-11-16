---
id: ETH-003
title: "Run state and entity model with serialize round-trip"
type: feature
status: ready
priority: P0
milestone: M0
epic: sim-core
size: M
depends_on: [ETH-002]
created: 2026-11-16
updated: 2026-11-16
---

## Summary
Define `RunState`, `Entity` with its optional parts, and `Floor`, plus `createRun`, `serialize` and `deserialize`.

## Why
A single plain-data state is what makes saving, worker transfer and headless runs possible. See `docs/ARCHITECTURE.md` §3.1 and §3.2.

## Acceptance criteria
- [ ] `createRun(config, seed)` returns a state with one hand-specified floor and one adventurer
- [ ] State contains only plain data (no class instances, `Map`, `Set` or functions); a test asserts this
- [ ] `deserialize(serialize(state))` deep-equals the original, including grids and RNG state
- [ ] Helpers exist to add, remove and query entities by floor and position

## Notes
Floors can be supplied directly in this item; generation arrives in ETH-006.

Open decision from ETH-002: `Grid` (in `src/core/grid.ts`) is a class around a typed array,
which conflicts with "no class instances". Either store `GridData` in `RunState` and wrap it on
use, or allow typed arrays as plain data (structured clone handles them; `serialize` would
convert via `toData`/`fromData`). Settle it here and record the choice in ARCHITECTURE §3.1.

## Log
- 2026-11-16: Created.
