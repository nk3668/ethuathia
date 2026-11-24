---
id: ETH-128
title: Time-away catch-up simulation and summary
type: feature
status: idea
priority: P2
milestone: M8
epic: saves-platform
size: M
depends_on: [ETH-095, ETH-120]
created: 2026-11-19
updated: 2026-11-24
---

## Summary
On load, simulate the time the game was closed (capped at 8h, raised by Tavern upgrades) headlessly at max speed, falling back to an estimate from recent run averages if too slow, and show a While-you-were-away summary built from the run chronicle.

## Why
`CLAUDE.md` §5.5. Named as a user of ETH-120 in the shared-systems spec review (2026-11-19).

## Acceptance criteria
- [ ] Headless catch-up with the 8h cap; stops after the current run when auto-restart is off
- [ ] Statistical fallback, labelled as an estimate in the summary
- [ ] While-you-were-away modal from chronicle entries (ETH-120)
- [ ] Test with a fake clock

## Log
- 2026-11-19: Created from the shared-systems spec review (2026-11-19).
- 2026-11-24: Moved from M6 to M8 in the backlog reorganization by theme.
