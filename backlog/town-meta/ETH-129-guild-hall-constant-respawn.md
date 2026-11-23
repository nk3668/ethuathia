---
id: ETH-129
title: Guild Hall upgrade: constant floor respawns on revisit
type: feature
status: idea
priority: P2
milestone: M2
epic: town-meta
size: S
depends_on: [ETH-025, ETH-063]
created: 2026-11-22
updated: 2026-11-22
---

## Summary
Add a Guild Hall upgrade (or toggleable Foundations/Tactics node) that enables continuous floor repopulation when revisiting previously explored floors, letting players farm extra monsters, XP and Trophies at higher risk.

## Why
Requested alongside ETH-025 so players who want constant floor respawns beyond the one-time return-trip repopulation can unlock and opt into it at the Guild Hall.

## Acceptance criteria
- [ ] Guild Hall upgrade node in `src/content/town/guildHall.ts` grants a run modifier with flag `floors.constant_respawn` (`FLAG_CONSTANT_RESPAWN`)
- [ ] With the upgrade active, revisiting any vacated floor after its cooldown repopulates it with monsters
- [ ] Codex and Town tooltips explain the risk/reward and cooldown clearly
- [ ] Tests cover `buildRunConfig` applying the flag and repeated repopulation in a run

## Notes
- ETH-025 already wired `FLAG_CONSTANT_RESPAWN` (`'floors.constant_respawn'`) and `CONSTANT_RESPAWN_COOLDOWN` in `src/sim/floors/respawn.ts`, so this upgrade needs no sim state changes.

## Log
- 2026-11-22: Created during ETH-025 planning from Nate's feedback.
