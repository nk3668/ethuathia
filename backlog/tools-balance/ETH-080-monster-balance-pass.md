---
id: ETH-080
title: Monster and loot balance pass at the end of M1
type: chore
status: idea
priority: P2
milestone: M1
epic: tools-balance
size: M
depends_on: [ETH-024, ETH-025, ETH-034, ETH-040, ETH-043, ETH-044]
created: 2026-11-18
updated: 2026-11-18
---

## Summary
Tune monster stats, spawn rates and potion drops so runs are dangerous but fair once M1's gear, leveling and return trip exist.

## Why
After ETH-061, 50 seeds had 0 deaths because potions kept the party alive. Nate chose to balance after all of M1 (Nate's interview answers (2026-11-18)).

## Acceptance criteria
- [ ] Target numbers agreed in the item before tuning (e.g. a wipe rate band and median depth for a fresh profile)
- [ ] `npm run sim -- --seeds 100` report before and after, in the PR
- [ ] Changes are data-only in `src/content/` where possible

## Notes
Run this last in M1.
- Review and tune return-trip floor repopulation from `ETH-025`: default respawn count curve and `depthShift` (currently `+1`, so climbing back out spawns higher-level monsters than the party met going down).

## Log
- 2026-11-18: Created from Nate's interview answers (2026-11-18).
- 2026-11-22: Noted return-trip respawn density and `depthShift` tuning from ETH-025.
