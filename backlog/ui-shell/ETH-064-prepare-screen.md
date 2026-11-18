---
id: ETH-064
title: Prepare screen and building a run config from the profile
type: feature
status: done
priority: P1
milestone: M2
epic: ui-shell
size: M
depends_on: [ETH-059, ETH-062]
created: 2026-11-17
updated: 2026-11-18
---

## Summary
The Prepare screen where the player sets up the next run and presses Descend, backed by a pure `buildRunConfig(profile, choices)`.

## Why
See `CLAUDE.md` §2 (Starting a run). Contracts, bounties, Omens, patrons and party picks all plug into it.

## Acceptance criteria
- [x] `buildRunConfig(profile, choices)` in `src/meta/` returns a validated `RunConfig`; empty party slots are filled with random recruits from unlocked classes and races (seeded)
- [x] Prepare screen sections are a registry of panels (party, contracts, bounties, omens, patron, dungeon) so later items add a panel without editing the screen; this item ships party and dungeon panels
- [x] Descend starts the run; the app opens on Prepare instead of the demo run; the run summary returns to Prepare
- [x] Previous choices are remembered in the Profile for auto-restart
- [x] Unit tests for `buildRunConfig`; a component test for Descend

## Log
- 2026-11-17: Created as part of the backlog fan-out plan.
- 2026-11-18: Started.
- 2026-11-18: Done. `buildRunConfig(profile, choices, seed)` in `src/meta/prepare/` with composable choice sections (`RUN_CHOICES`: party, dungeon) and a `prepare` profile slice; owned upgrades' party bundles reach the run (attached by node id). Prepare screen with a panel registry (`ui/prepare/panels/*.ts`: Party, From the town, Dungeon); the app opens on it, the run summary's Continue returns to it, and auto-restart and the sim-error banner's new Start a new run button rebuild from the remembered choices. New `dungeon` content kind (`dungeon.old_delve`). `floorEntered` carries `floorType`, which the Codex marks seen.
- 2026-11-18: (default) Base party size is 1 and the party always fills `capacity(partySize)`; each slot picks a class and race or Random, and names are random (no roster yet). Alternatives: base 2 like the old demo run; letting the player take fewer than the cap.
- 2026-11-18: (default) Content that some upgrade unlocks is locked until that upgrade is owned; everything else is open from the start. Alternative: an explicit `starting` flag on defs.
- 2026-11-18: (default) Dungeon variants are a content kind and the panel lists them even when there is one. Alternative: hide the panel until a second variant is unlocked (CLAUDE.md §2 step 6).
- 2026-11-18: (default) The run summary keeps Start next run (secondary) beside Continue (primary, to Prepare). Alternative: Continue only.
