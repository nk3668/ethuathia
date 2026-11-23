---
id: ETH-135
title: Threat-budget room encounters, cohesive group engagement, and corridor patrols
type: feature
status: ready
priority: P1
milestone: M1.5
epic: dungeon-gen
size: M
depends_on: [ETH-040, ETH-113, ETH-133]
created: 2026-11-23
updated: 2026-11-23
---

## Summary
Replace sparse flat per-floor monster counts with Danger-scaled threat-budget room encounters built from role/tag squad patterns, cohesive group AI (room tethering, pack alerting, short pursuit memory), and deterministic corridor patrols.

## Why
Sparse 1–5 monster floors leave rooms empty, isolate `swarm` and `support` monsters, and let parties recover endlessly in safe corridors (`docs/DIFFICULTY_PHILOSOPHY.md` §3.4, §3.6, §4). Coordinated squads and patrolling hunters make positioning, fleeing, and party composition matter without party-size scaling.

## Acceptance criteria
- [ ] Replace low flat spawn counts with Danger-scaled threat-budget room placement (~`6–10` monsters on Danger 1–2 scaling up to `25–35+` on Danger 9+, keeping the arrival stairs room free of initial spawns and respecting `stairsDistance`).
- [ ] Implement data-driven role/tag squad blueprints (Solo scout, Swarm pack, Kin & tender, Shield & bolt, Hunting pack, Deep warband) gated by minimum floor Danger with zero hardcoded monster IDs.
- [ ] Add cohesive group AI: room-tethered idle for unalerted pack members, shared pack alert on sight or damage so supports/casters/frontline engage together, and short pursuit memory (~6–10 turns) around doorways and corners.
- [ ] Add deterministic corridor patrols (solo scouts on shallow floors, 2–3 monster hunting squads deeper) following multi-room waypoint loops without causing stairs-blocker softlocks (`ETH-113`).
- [ ] Register state invariants (`registerInvariant`), bump `STATE_VERSION` in `src/sim/state.ts` and `docs/ARCHITECTURE.md`, and pass `npm run check` plus `npm run soak -- --seeds 200 --cap 2000`.

## Notes
- See `docs/DIFFICULTY_PHILOSOPHY.md` §3.4, §3.6, and §4.
- Test multi-member group alerting, room tethering, patrol movement, and save/load mid-pursuit determinism on hand-built maps (`CLAUDE.md` §9).

## Log
- 2026-11-23: Created as part of M1.5 (Living Dungeon & Balance).
