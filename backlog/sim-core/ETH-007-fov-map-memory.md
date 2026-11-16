---
id: ETH-007
title: "FOV and map memory"
type: feature
status: ready
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
- [ ] FOV is symmetric: if A sees B then B sees A, checked on hand-built maps
- [ ] Walls and closed doors block sight; open doors do not
- [ ] Seen tiles are remembered with their last known terrain; explored percentage is available per floor
- [ ] FOV radius is a stat read through one function, so later modifiers (e.g. the Gloom Omen) can change it

## Notes
None yet.

## Log
- 2026-11-16: Created.
