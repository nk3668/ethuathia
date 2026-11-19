---
id: ETH-084
title: Rematch button on the run summary replays the same seed
type: feature
status: ready
priority: P2
milestone: M2
epic: ui-shell
size: S
depends_on: [ETH-062, ETH-064]
created: 2026-11-18
updated: 2026-11-18
---

## Summary
The run summary gains a Rematch button that starts the next run with the same seed and Prepare settings. Auto-restart keeps rolling a new seed.

## Why
Lets the player test rule changes on a known dungeon. Decided in Nate's interview answers (2026-11-18).

## Acceptance criteria
- [ ] Rematch next to Continue and Start next run
- [ ] The new run's dungeon layout matches the previous run's (test)
- [ ] Upgrades bought between runs still apply; the tooltip says the layout repeats but outcomes may differ

## Log
- 2026-11-18: Created from Nate's interview answers (2026-11-18).
