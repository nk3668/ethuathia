---
id: ETH-135
title: Threat-budget room encounters, cohesive group engagement, and corridor patrols
type: feature
status: done
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
- [x] Replace low flat spawn counts with Danger-scaled threat-budget room placement (~`6–10` monsters on Danger 1–2 scaling up to `25–35+` on Danger 9+, keeping the arrival stairs room free of initial spawns and respecting `stairsDistance`).
- [x] Implement data-driven role/tag squad blueprints (Solo scout, Swarm pack, Kin & tender, Shield & bolt, Hunting pack, Deep warband) gated by minimum floor Danger with zero hardcoded monster IDs.
- [x] Add cohesive group AI: room-tethered idle for unalerted pack members, shared pack alert on sight or damage so supports/casters/frontline engage together, and short pursuit memory (~6–10 turns) around doorways and corners.
- [x] Add deterministic corridor patrols (solo scouts on shallow floors, 2–3 monster hunting squads deeper) following multi-room waypoint loops without causing stairs-blocker softlocks (`ETH-113`).
- [x] Register state invariants (`registerInvariant`), bump `STATE_VERSION` in `src/sim/state.ts` and `docs/ARCHITECTURE.md`, and pass `npm run check` plus `npm run soak -- --seeds 200 --cap 2000`.

## Notes
- See `docs/DIFFICULTY_PHILOSOPHY.md` §3.4, §3.6, and §4.
- Test multi-member group alerting, room tethering, patrol movement, and save/load mid-pursuit determinism on hand-built maps (`CLAUDE.md` §9).
- Integrated cleanly with `ETH-134` (`STATE_VERSION = 33`): `BUDGET_ANCHORS` calibrated for Band 1–11 monster threats and `templateRamp`, preserving `ood: true` and `templateChanceFor` in room squads and patrols; updated `test/tools/headless.test.ts` and `test/tools/compare.test.ts` fixture runs to 4-member parties since M1.5 solo L1 no longer guarantees 100% wins.
- Gate 2 verification: `npm run validate:content` (0 problems), `npm run check` (`98/98` files, `1150/1150` tests), `npm run soak -- --seeds 200 --cap 2000` (`200/200 passed`, `307801 steps`, `0 stalled`, `0 stuck`, `0 failures`), `npm run sim -- --seeds 50 --compare origin/main` (`50 -> 33` victories, `17` wipes, kills/run `33.8 -> 86.9`, party level mean `13.06 -> 16.32`, renown/hr `6646.4 -> 4615.3`).

## Log
- 2026-11-23: Created as part of M1.5 (Living Dungeon & Balance).
- 2026-11-23: Implemented `src/content/squads.ts`, `src/sim/combat/encounters.ts`, `src/sim/combat/groupAi.ts`, `combat.groups`/`combat.patrols` invariants, `STATE_VERSION = 33`, and verified check + 200-seed soak + 50-seed compare.
