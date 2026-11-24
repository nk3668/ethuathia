---
id: ETH-141
title: Scale contract rewards by completion depth and balance M2 payouts
type: chore
status: idea
priority: P3
milestone: M6
epic: quests
size: S
depends_on: [ETH-024, ETH-085, ETH-132, ETH-133]
created: 2026-11-23
updated: 2026-11-24
---

## Summary
Scale contract Renown/currency rewards by actual dungeon depth (or difficulty) on completion and rebalance M2 contract and bounty payouts once variable depth (`ETH-133`), M2 contract types, classes, Smithy, and rescaled Guild Hall costs (`ETH-132`) are in place.

## Why
Under variable hidden depth (`ETH-133`, 6–10 floors in *The Old Delve*) and multi-contract runs (`ETH-028`), a flat 100-Renown payout on `contract.recover_relic` does not reflect the extra risk of deeper rolled delves or later dungeon variants (`CLAUDE.md` §3 & §6). Deferring payout scaling until the end of M2 avoids premature tuning before M2's economy (`ETH-132`), classes, and Smithy exist.

## Acceptance criteria
- [ ] Contract payouts scale cleanly with completion depth / dungeon difficulty without ever leaking hidden rolled depth at turn 0 (`contractsTaken` remains spoiler-free; scaled reward is computed/applied on completion and matched in `RunSummary` / `renownBreakdown`).
- [ ] Rebalance M2 contract and bounty payouts alongside `ETH-132` Guild Hall Renown costs and M2 progression unlocks.
- [ ] Extend `ETH-131` secrecy guards to verify scaled contract rewards never expose hidden depth before bottom-floor entry, and pass `npm run check`.

## Notes
- Keep `contractsTaken` spoiler-free (`ETH-133`): do not include rolled bottom depth or depth-scaled payout totals on turn 0 before the bottom floor is revealed.
- Coordinate final numbers with `ETH-132` (`renown/hr (1x)` benchmarks from `ETH-080` and M2 content).

## Log
- 2026-11-23: Created per M1.5 planning decision to defer depth-scaled contract reward balancing until the end of M2.
- 2026-11-24: Moved from M2 to M6 in the backlog reorganization by theme.
