---
id: ETH-080
title: Systemic monster, loot and progression balance pass (M1.5 capstone)
type: chore
status: ready
priority: P1
milestone: M1.5
epic: tools-balance
size: M
depends_on: [ETH-024, ETH-025, ETH-034, ETH-040, ETH-043, ETH-044, ETH-085, ETH-133, ETH-134, ETH-135, ETH-136]
created: 2026-11-18
updated: 2026-11-23
---

## Summary
Capstone balance pass after M1.5's Danger curves, expanded bestiary, room encounters, patrols, and return-trip surge: tune monster stats, spawn budgets, recovery rate, XP/leveling curve, loot/potions/enchantments, and meta-progression pacing against the targets in `docs/DIFFICULTY_PHILOSOPHY.md`.

## Why
After ETH-061, 50 seeds had 0 deaths because potions and passive recovery kept the party alive (`ETH-080`). M1.5 introduces Danger curves, denser multi-role packs, and return-trip surges; tuning all systemic levers together anchors *The Old Delve* to the target win-rate bands in `docs/DIFFICULTY_PHILOSOPHY.md` §2 without punishing progression.

## Acceptance criteria
- [ ] **Fresh profile (solo L1 Vanguard, 0 upgrades) in `npm run sim -- --seeds 100`:** ~**15–25%** victory rate (target ~20%), **>85–90%** reaching Floor 3+, and **~15–25%** return-trip lethality on relic-bearing runs.
- [ ] **Progressed / composed party sweeps (`--party 2..4`, upgraded gear):** ~**45–60%** victory rate (target ~50%), demonstrating clear spread between naive mono-melee stacks (~35–40%) and balanced compositions with matching rules (~55–65%).
- [ ] **Attrition & pacing levers tuned (`docs/DIFFICULTY_PHILOSOPHY.md` §7):** `RECOVERY_INTERVAL` (target ~8–12 turns out of combat), XP curve (`Level 5–8` at delve end), potion/item drop rates, and death-cause diversity verified (no single cliff accounting for most wipes).
- [ ] **Meta-economy coordination:** Review `renown/hr (1x)` from `ETH-085` and coordinate Guild Hall cost pacing with `ETH-132`.
- [ ] Before/after `npm run sim -- --seeds 100 --compare origin/main` tables across party sizes included in the PR; prefer data tuning in `src/content/` and shared balance constants, with `npm run check` passing.

## Notes
- Run last in M1.5 once `ETH-133`, `ETH-134`, `ETH-135`, and `ETH-136` have landed.
- Design reference: `docs/DIFFICULTY_PHILOSOPHY.md` (§2, §7, §8, §9).

## Log
- 2026-11-18: Created from Nate's interview answers (2026-11-18).
- 2026-11-22: Noted return-trip respawn density and `depthShift` tuning from ETH-025.
- 2026-11-23: Moved to M1.5 capstone after ETH-133–ETH-136 and aligned targets with `docs/DIFFICULTY_PHILOSOPHY.md` (coordinating Renown pacing with ETH-132).
