---
id: ETH-064
title: Prepare screen and building a run config from the profile
type: feature
status: ready
priority: P1
milestone: M2
epic: ui-shell
size: M
depends_on: [ETH-059, ETH-062]
created: 2026-11-17
updated: 2026-11-17
---

## Summary
The Prepare screen where the player sets up the next run and presses Descend, backed by a pure `buildRunConfig(profile, choices)`.

## Why
See `CLAUDE.md` §2 (Starting a run). Contracts, bounties, Omens, patrons and party picks all plug into it.

## Acceptance criteria
- [ ] `buildRunConfig(profile, choices)` in `src/meta/` returns a validated `RunConfig`; empty party slots are filled with random recruits from unlocked classes and races (seeded)
- [ ] Prepare screen sections are a registry of panels (party, contracts, bounties, omens, patron, dungeon) so later items add a panel without editing the screen; this item ships party and dungeon panels
- [ ] Descend starts the run; the app opens on Prepare instead of the demo run; the run summary returns to Prepare
- [ ] Previous choices are remembered in the Profile for auto-restart
- [ ] Unit tests for `buildRunConfig`; a component test for Descend

## Log
- 2026-11-17: Created as part of the backlog fan-out plan.
