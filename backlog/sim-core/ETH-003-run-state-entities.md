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

## Log
- 2026-11-16: Created.
