---
id: ETH-080
title: Systemic monster, loot and progression balance pass (M1.5 capstone)
type: chore
status: ready
priority: P1
milestone: M1.5
epic: tools-balance
size: M
depends_on: [ETH-024, ETH-025, ETH-034, ETH-040, ETH-043, ETH-044, ETH-085, ETH-133, ETH-134, ETH-135, ETH-136, ETH-145]
created: 2026-11-18
updated: 2026-11-23
---

## Summary
Capstone balance pass after M1.5's Danger curves, expanded bestiary, room encounters, patrols, and return-trip surge: tune monster stats, spawn budgets, recovery rate, XP/leveling curve, loot/potions/enchantments, and meta-progression pacing against the targets in `docs/DIFFICULTY_PHILOSOPHY.md`.

## Why
After ETH-061, 50 seeds had 0 deaths because potions and passive recovery kept the party alive (`ETH-080`). M1.5 introduces Danger curves, denser multi-role packs, and return-trip surges; tuning all systemic levers together anchors *The Old Delve* to the target win-rate bands in `docs/DIFFICULTY_PHILOSOPHY.md` §2 without punishing progression.

## Acceptance criteria
All sweeps use **200 seeds** (at 100 seeds the 95% interval on a ~20% rate is about ±8 points, as wide as the bands themselves).
- [ ] **Fresh profile (`--preset fresh`, solo L1 Vanguard, 0 upgrades):** ~**15–25%** victory rate (target ~20%), **>85–90%** reaching Floor 3+, and **~15–25%** return-trip lethality on relic-bearing runs.
- [ ] **Progressed party (`--preset progressed --party 4`, Vanguards):** ~**45–60%** victory rate (target ~50%). The composition spread (mono-melee vs composed parties) is deferred to `ETH-146` in M3, since only the Vanguard class exists now.
- [ ] **Party-size ordering still holds** after tuning (the `ETH-145` check): win rate rises from party 1 to 4 on both presets, and party 4 wins at least twice as often as solo.
- [ ] **Attrition levers tuned in order (`docs/DIFFICULTY_PHILOSOPHY.md` §7):** `RECOVERY_INTERVAL` (target ~8–12 turns out of combat), then monster stats against §8 (including the Danger 1–2 `damage: 0` monsters), then potion/item drop rates; levels stay in the 5–8 band set by `ETH-145`; death causes are diverse (no single monster or status behind most wipes).
- [ ] **Meta-economy coordination:** Review `renown/hr (1x)` from `ETH-085` and coordinate Guild Hall cost pacing with `ETH-132`.
- [ ] Before/after `npm run sim -- --compare origin/main` tables for party sizes 1–4 included in the PR; prefer data tuning in `src/content/` and shared balance constants, with `npm run check` passing.
- [ ] Record the final 200-seed numbers in `docs/DIFFICULTY_PHILOSOPHY.md` §9.2 as the M1.5 baseline.

## Notes
- Run last in M1.5, after `ETH-145` has fixed the party-size inversion and the XP curve.
- Harness prep landed in `2cdb89b` (`--preset`, `--upgrades`, `--rules` flags and §2 metrics); the tuning itself has not started.
- Design reference: `docs/DIFFICULTY_PHILOSOPHY.md` (§1, §2, §7, §8, §9).

## Log
- 2026-11-18: Created from Nate's interview answers (2026-11-18).
- 2026-11-22: Noted return-trip respawn density and `depthShift` tuning from ETH-025.
- 2026-11-23: Moved to M1.5 capstone after ETH-133–ETH-136 and aligned targets with `docs/DIFFICULTY_PHILOSOPHY.md` (coordinating Renown pacing with ETH-132).
- 2026-11-23: Added ETH-142 (identification secrecy and curse safety) to depends_on so loot is balanced on fair curse odds.
- 2026-11-23: Dropped ETH-142 from depends_on (moved to M1.6). Retune `LOOT_CURSE_CHANCE` and the cursed enchantment range again once ETH-142 lands.
- 2026-11-23: Review: on committed `d693b47` a progressed party of 4 wins no more often than fresh solo (8/24 each), and in-progress tuning flipped it into a full inversion (solo 66% at mean L17; party of 4 at 0%). Split it out as ETH-145 (now a dependency), moved the composition spread to ETH-146 (M3), raised sweeps to 200 seeds, and ordered the levers.
