---
id: ETH-003
title: "Run state and entity model with serialize round-trip"
type: feature
status: done
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
- [x] `createRun(config, seed)` returns a state with one hand-specified floor and one adventurer
- [x] State contains only plain data (no class instances, `Map`, `Set` or functions); a test asserts this
- [x] `deserialize(serialize(state))` deep-equals the original, including grids and RNG state
- [x] Helpers exist to add, remove and query entities by floor and position

## Notes
Floors can be supplied directly in this item; generation arrives in ETH-006.

Open decision from ETH-002: `Grid` (in `src/core/grid.ts`) is a class around a typed array,
which conflicts with "no class instances". Either store `GridData` in `RunState` and wrap it on
use, or allow typed arrays as plain data (structured clone handles them; `serialize` would
convert via `toData`/`fromData`). Settle it here and record the choice in ARCHITECTURE §3.1.

**Decision:** typed arrays are plain data. Run state stores each grid as a `GridBuffer`
(`{ width, height, kind, cells }` holding the typed array), and code calls `Grid.wrap(buffer)`,
which shares the cells rather than copying them. `serialize` writes every grid as
`{ "$grid": GridData }` (run-length encoded) and `deserialize` turns it back. Storing `GridData`
and decoding it on every use was rejected as too slow for per-turn FOV and pathing.

## Log
- 2026-11-16: Created.
- 2026-11-16: Started.
- 2026-11-16: Done. Settled the grid decision above. Added `findNonPlain`, `assertPlainData`
  and `clonePlain` to `src/core/plain.ts`, plus `GridBuffer`, `Grid.wrap` and `toBuffer`.
  `src/sim/` now has `state.ts` (types and constants), `entities.ts` (add, remove, move and query
  by floor and position), `floorText.ts` (text maps, used for tests and the built-in `M0_FLOOR`),
  `run.ts` (`createRun`) and `serialize.ts`. `serialize` refuses state that isn't plain data,
  including shared references, and names the path. Recorded in ARCHITECTURE §3.1 and §3.2.
