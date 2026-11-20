---
id: ETH-132
title: Rescale Guild Hall Renown costs for depth-weighted rewards
type: chore
status: idea
priority: P2
milestone: M2
epic: town-meta
size: S
depends_on: [ETH-085]
created: 2026-11-20
updated: 2026-11-23
---

## Summary
Rescale Guild Hall upgrade costs in `src/content/town/guildHall.ts` to match the higher Renown income introduced by depth-weighted rewards (ETH-085).

## Why
ETH-085 increased banked Renown per 10-floor victory from ~250 to ~1,120 (+348%), while the full Guild Hall tree in `src/content/town/guildHall.ts` still totals ~2,020 Renown (50–600 per node). That drops full tree completion from ~8 victories to ~2. Logged as a follow-up from the PR #82 review so cost tuning can be done deliberately alongside other M2 town-meta work.

## Acceptance criteria
- [ ] Target pacing agreed (e.g. approximate number of runs/victories to unlock each Guild Hall tier and complete the tree)
- [ ] Guild Hall node costs in `src/content/town/guildHall.ts` updated to match the agreed pacing
- [ ] Any tests asserting hardcoded Guild Hall upgrade costs updated accordingly

## Notes
- Current node costs in `src/content/town/guildHall.ts`: 50, 80, 120 / 120 (tier 2 exclusive), 250, 600, 400 / 400 (tier 4 exclusive) — 2,020 total across all nodes (1,500 for one branch per exclusive tier).
- Consider coordinating with ETH-086 (Foundations and Tactics split) if that lands first.

## Log
- 2026-11-20: Created from PR #82 (ETH-085) review balance note.
- 2026-11-23: Renumbered from ETH-129 to ETH-132 on rebase onto main (ETH-129 was claimed by Guild Hall constant respawn in PR #83).
