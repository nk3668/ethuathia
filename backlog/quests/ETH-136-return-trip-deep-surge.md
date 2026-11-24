---
id: ETH-136
title: Return-trip deep surge: lower-floor threats and hunter patrols on ascent
type: feature
status: done
priority: P1
milestone: M1.5
epic: quests
size: S
depends_on: [ETH-025, ETH-133, ETH-135]
created: 2026-11-23
updated: 2026-11-23
---

## Summary
Upgrade the post-contract return trip (`ETH-025`) so securing the relic surges monsters drawn from near `bottomDanger`—along with elevated template rates and hunter patrols—onto upper floors during the climb back to the surface.

## Why
Once the party turns back with the relic, walking over upper floors shouldn't spawn trivial early-floor pests (`floor.depth + 1`) (`docs/DIFFICULTY_PHILOSOPHY.md` §6). Surging lower-level creatures onto the upper floors turns the exit into a tense second act while keeping early Retreat un-surged.

## Acceptance criteria
- [x] Anchor post-contract return-trip respawns in `src/sim/floors/respawn.ts` to the run's rolled `bottomDanger` (e.g., `[bottomDanger - 2, bottomDanger]`) instead of `floor.depth + 1`, scaling cleanly across variable dungeon lengths (`6` vs `10` floors).
- [x] Bias a share of surging respawn packs toward rooms/corridors along the stairs-down → stairs-up route while strictly preserving `stairsDistance`, bump `templateChance` on surging waves, and allow hunter patrols on ascent.
- [x] Keep voluntary Retreat (before contract completion) un-surged, and keep `FLAG_CONSTANT_RESPAWN` (`ETH-129`) anchored to local floor Danger (+ modest shift) rather than `bottomDanger`.
- [x] Verify deterministic save/load mid-ascent, readable surge log messaging (`"The dungeon stirs."`), `test/sim/returnTrip.test.ts`, and `npm run check`.

## Notes
- See `docs/DIFFICULTY_PHILOSOPHY.md` §6 and §2 (return-trip lethality target ~15–25%).
- Implemented `surgeFloor` in `src/sim/combat/encounters.ts`, `maybeRespawnFloor(..., dir)` gating in `src/sim/floors/respawn.ts`, `surged?: true` on `dungeonStirred`/`floorRespawned`, and clean-room surge wording in `src/ui/shell/logText/floors.ts` while preserving explicit `respawn.depthShift` test overrides and `STATE_VERSION = 33`.
- Verified: `npm run validate:content` (0 problems), `npm run check` (`98/98` test files, `1156/1156` tests), `npm run soak -- --seeds 200 --cap 2000` (`200/200 passed`, `308774 steps`, `0 stalled`, `0 stuck`, `0 failures`).

## Log
- 2026-11-23: Created as part of M1.5 (Living Dungeon & Balance).
- 2026-11-23: Implemented bottomDanger-anchored return-trip surge, route-biased packs, hunter patrols, log wording, and docs/tests; passed check and 200-seed soak.
