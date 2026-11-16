---
id: ETH-007
title: "FOV and map memory"
type: feature
status: done
priority: P0
milestone: M0
epic: sim-core
size: S
depends_on: [ETH-003]
created: 2026-11-16
updated: 2026-11-16
---

## Summary
Symmetric shadowcasting field of view, and per-adventurer memory of seen tiles shared across the party.

## Why
Perception feeds exploration and the fog of war on the map. See `docs/ARCHITECTURE.md` §3.7 and `CLAUDE.md` §5.1.

## Acceptance criteria
- [x] FOV is symmetric: if A sees B then B sees A, checked on hand-built maps
- [x] Walls and closed doors block sight; open doors do not
- [x] Seen tiles are remembered with their last known terrain; explored percentage is available per floor
- [x] FOV radius is a stat read through one function, so later modifiers (e.g. the Gloom Omen) can change it

## Notes
- `src/sim/fov.ts` is the pure algorithm (Albert Ford's symmetric shadowcasting, integer
  slopes); `src/sim/perception.ts` applies it to run state. Details in `docs/ARCHITECTURE.md` §3.7.
- Memory is one per floor shared by the whole party (`RunState.memory`), not one grid per
  adventurer merged together: party members share everything they see, so per-adventurer grids
  would be identical copies. It also remembers features (doors, stairs) as last seen, because the
  map draws remembered doors and stairs dimmed. `STATE_VERSION` is now 2.
- The symmetry test compares every pair of see-through tiles on three hand-built maps at three
  radii and on a generated floor. Replacing the symmetric check with plain shadowcasting makes
  it fail, so it does catch asymmetry.
- ESLint now ignores unused parameters that start with `_`, as TypeScript already does, so
  `sightRadius(_state, _actor)` can keep the signature modifiers will need.

## Log
- 2026-11-16: Created.
- 2026-11-16: Started and finished. FOV, party memory with features, `explored`, `partyVisible`;
  party members perceive before deciding and after acting.
