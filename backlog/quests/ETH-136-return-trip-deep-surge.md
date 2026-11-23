---
id: ETH-136
title: Return-trip deep surge: lower-floor threats and hunter patrols on ascent
type: feature
status: ready
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
- [ ] Anchor post-contract return-trip respawns in `src/sim/floors/respawn.ts` to the run's rolled `bottomDanger` (e.g., `[bottomDanger - 2, bottomDanger]`) instead of `floor.depth + 1`, scaling cleanly across variable dungeon lengths (`6` vs `10` floors).
- [ ] Bias a share of surging respawn packs toward rooms/corridors along the stairs-down → stairs-up route while strictly preserving `stairsDistance`, bump `templateChance` on surging waves, and allow hunter patrols on ascent.
- [ ] Keep voluntary Retreat (before contract completion) un-surged, and keep `FLAG_CONSTANT_RESPAWN` (`ETH-129`) anchored to local floor Danger (+ modest shift) rather than `bottomDanger`.
- [ ] Verify deterministic save/load mid-ascent, readable surge log messaging (`"The dungeon stirs."`), `test/sim/returnTrip.test.ts`, and `npm run check`.

## Notes
- See `docs/DIFFICULTY_PHILOSOPHY.md` §6 and §2 (return-trip lethality target ~15–25%).

## Log
- 2026-11-23: Created as part of M1.5 (Living Dungeon & Balance).
