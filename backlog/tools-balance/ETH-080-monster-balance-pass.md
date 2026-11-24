---
id: ETH-080
title: Systemic monster, loot and progression balance pass (M1.5 capstone)
type: chore
status: done
priority: P1
milestone: M1.5
epic: tools-balance
size: M
depends_on: [ETH-024, ETH-025, ETH-034, ETH-040, ETH-043, ETH-044, ETH-085, ETH-133, ETH-134, ETH-135, ETH-136, ETH-145, ETH-142]
created: 2026-11-18
updated: 2026-11-24
---

## Summary
Capstone balance pass after M1.5's Danger curves, expanded bestiary, room encounters, patrols, and return-trip surge: tune monster stats, spawn budgets, recovery rate, XP/leveling curve, loot/potions/enchantments, and meta-progression pacing against the targets in `docs/DIFFICULTY_PHILOSOPHY.md`.

## Why
After ETH-061, 50 seeds had 0 deaths because potions and passive recovery kept the party alive (`ETH-080`). M1.5 introduces Danger curves, denser multi-role packs, and return-trip surges; tuning all systemic levers together anchors *The Old Delve* to the target win-rate bands in `docs/DIFFICULTY_PHILOSOPHY.md` §2 without punishing progression.

## Acceptance criteria
All sweeps use **200 seeds** (at 100 seeds the 95% interval on a ~20% rate is about ±8 points, as wide as the bands themselves).
- [x] **Fresh profile (`--preset fresh`, solo L1 Vanguard, 0 upgrades):** ~**15–25%** victory rate (target ~20%), **>85–90%** reaching Floor 3+, and **~15–25%** return-trip lethality on relic-bearing runs.
- [x] **Progressed party (`--preset progressed --party 4`, Vanguards):** ~**45–60%** victory rate (target ~50%). The composition spread (mono-melee vs composed parties) is deferred to `ETH-146` in M3, since only the Vanguard class exists now.
- [x] **Party-size ordering still holds** after tuning (the `ETH-145` check): win rate rises from party 1 to 4 on both presets, and party 4 wins at least twice as often as solo.
- [x] **Attrition levers tuned in order (`docs/DIFFICULTY_PHILOSOPHY.md` §7):** `RECOVERY_INTERVAL` (target ~8–12 turns out of combat), then monster stats against §8 (including the Danger 1–2 `damage: 0` monsters), then potion/item drop rates; levels stay in the 5–8 band set by `ETH-145`; death causes are diverse (no single monster or status behind most wipes).
- [x] **Meta-economy coordination:** Review `renown/hr (1x)` from `ETH-085` and coordinate Guild Hall cost pacing with `ETH-132`.
- [x] Before/after `npm run sim -- --compare origin/main` tables for party sizes 1–4 included in the PR; prefer data tuning in `src/content/` and shared balance constants, with `npm run check` passing.
- [x] Record the final 200-seed numbers in `docs/DIFFICULTY_PHILOSOPHY.md` §9.2 as the M1.5 baseline.

## Notes
- ETH-142 tunables to retune here: `LOOT_CURSE_CHANCE`, `CURSED_MILD_CHANCE`, the cursed `gearDelta`, and `CURSE_LOCK_PREMIUM` (`src/sim/items/hiddenValue.ts`, Nate: keep it, tune it here). At 4 it makes +1 unidentified gear (all gloves, boots and amulets) wait for an identify; check how often those slots stay empty and retune if it hurts the bands.
- Run last in M1.5, after `ETH-145` has fixed the party-size inversion and the XP curve.
- Harness prep landed in `2cdb89b` (`--preset`, `--upgrades`, `--rules` flags and §2 metrics); the tuning itself has not started.
- Design reference: `docs/DIFFICULTY_PHILOSOPHY.md` (§1, §2, §7, §8, §9).
- Handed over from `ETH-145` (owner decision 2026-11-23): this item must make party 4 win at least 2x as often as solo on both presets (`npm run sim -- --party-sweep` prints a warning until it does), and should re-tune `PARTY_SIZE_BUDGET_STEP` (shipped small) up toward ~10% as far as the 1<2<3<4 ordering allows.

## Log
- 2026-11-18: Created from Nate's interview answers (2026-11-18).
- 2026-11-22: Noted return-trip respawn density and `depthShift` tuning from ETH-025.
- 2026-11-23: Moved to M1.5 capstone after ETH-133–ETH-136 and aligned targets with `docs/DIFFICULTY_PHILOSOPHY.md` (coordinating Renown pacing with ETH-132).
- 2026-11-23: Added ETH-142 (identification secrecy and curse safety) to depends_on so loot is balanced on fair curse odds.
- 2026-11-23: Dropped ETH-142 from depends_on (moved to M1.6). Retune `LOOT_CURSE_CHANCE` and the cursed enchantment range again once ETH-142 lands.
- 2026-11-23: Review: on committed `d693b47` a progressed party of 4 wins no more often than fresh solo (8/24 each), and in-progress tuning flipped it into a full inversion (solo 66% at mean L17; party of 4 at 0%). Split it out as ETH-145 (now a dependency), moved the composition spread to ETH-146 (M3), raised sweeps to 200 seeds, and ordered the levers.
- 2026-11-24: Added a note from the M1.5/M1.6 fan-out (Nate approved).
- 2026-11-24: Started on branch `eth-080-capstone` (base `d7fca44`). Baseline, 200 seeds, win %: fresh 28.5 / 35.5 / 38.5 / 46.5, progressed 33.0 / 40.0 / 43.5 / 50.0 (party 1 to 4). Fresh solo: floor 3+ 91.0%, return-trip lethality 10.9%. 2x ratio failed (1.63x / 1.52x).
- 2026-11-24: Diagnosed floor-1 early wipes (about 7-9% of fresh solo runs, turns 26 to 100): not out-of-depth or template spawns (templates are 0% below Danger 3). They are ordinary Danger 1 pairs (2 mosslings, 2 spore puffs, or a pit badger) against a 20 HP lone adventurer. Damage-0 monsters still hit for 1 to 3 (`BASE_BLOW`), so a pair deals about 2.8 HP a turn, and the flee rule then fails (70% break-away roll) with an adjacent same-speed pursuer. No numeric fix chosen: `test/sim/fleeing.test.ts` pins `isThreat` on `damage > 0`, and raising floor-1 safety is a rules question. See Out-of-scope ideas in the final report.
- 2026-11-24: Step 1, `RECOVERY_INTERVAL` 8 -> 10 (`8c9e51e`): the strongest solo-only lever. 200 seeds: fresh 23.0 / 29.0 / 35.5 / 41.5, progressed 27.0 / 37.5 / 38.0 / 49.0.
- 2026-11-24: Step 2, surge `countMul` 1.1 -> 1.2 and `KILL_GROUP_BONUS` 0.25 -> 0.4 (`33ce2c7`). 1.4 was too much (fresh solo lethality 33%, progressed party 4 37%). At 200 seeds: fresh 21.5 / 29.0 / 31.5 / 41.0, progressed 24.5 / 36.5 / 37.5 / 50.0. Return-trip lethality 17.3%.
- 2026-11-24: Step 3, `KILL_GROUP_BONUS` 0.4 -> 0.55 (fresh 21.5 / 30.0 / 33.0 / 41.0, progressed 24.5 / 38.0 / 37.5 / 52.5), then `RECOVERY_INTERVAL` 11 (fresh 20.0 / 30.0 / 34.0 / 46.5, progressed 26.5 / 36.5 / 38.5 / 47.0) and 12 (fresh 16.0 / 29.5 / 37.0 / 41.0, progressed 24.5 / 32.5 / 39.0 / 50.5, fresh solo lethality 28.9%).
- 2026-11-24: Step 4, surge: `countMul` back to 1.1 changed nothing for solo (same 16.0%, 13/45 lethality) but lifted parties (progressed party 4 54.0%, lethality 5.9%), so `countMul` is a party-only lever at this size. `templateBonus` 0.15 -> 0.10 (`a669cc3`) brought fresh solo lethality to 20.0% and fresh solo to 18.0%. Final sweep in Results below.
- 2026-11-24: Tests: `leveling.test.ts` kill-share expectations follow `KILL_GROUP_BONUS`; the two `runSummary.test.tsx` App tests need a Victory summary from a fresh solo run, so their seed moved from 5 (no longer a winning seed) to 1 (a winning fresh solo seed).
- 2026-11-24: `PARTY_SIZE_BUDGET_STEP` re-tested at 0.03, 200 seeds: fresh 18.0 / 31.0 / 34.5 / 33.0, progressed 26.5 / 37.0 / 38.0 / 39.5. Ordering and 2x both break, so it stays 0 (owner decision: the 2x ratio wins over the surcharge).
- 2026-11-24: `CURSE_LOCK_PREMIUM` 4 -> 2 measured: every unidentified +1 gear piece has `hiddenGearMargin` of at least 1.04 at depth 1 and 1.70 to 1.83 at depth 9, so with premium 4 unidentified +1 gloves, boots, amulets and the like are never put on without an identify. Premium 2 lifts every cell by about 9 points (fresh 27.0 / 37.5 / 43.0 / 51.5, progressed 35.0 / 42.5 / 46.5 / 61.5) and moves solo and party 4 together, so it is a global gear lever, not a solo lever. Kept at 4 (bands met); available as the compensating lever if a later pass raises danger. `LOOT_CURSE_CHANCE`, `CURSED_MILD_CHANCE` and the cursed `gearDelta` untouched.

## Results
Sim state `a669cc3`, 200 seeds per cell, win % (mean highest level). Before is base `d7fca44`.

| Preset | Party | Before | After |
|---|---|---|---|
| Fresh | 1 | 28.5 (5.82) | 18.0 (5.48) |
| Fresh | 2 | 35.5 (6.58) | 32.5 (6.55) |
| Fresh | 3 | 38.5 (6.49) | 38.0 (6.88) |
| Fresh | 4 | 46.5 (6.58) | 46.0 (6.92) |
| Progressed | 1 | 33.0 (6.38) | 26.5 (6.08) |
| Progressed | 2 | 40.0 (6.78) | 37.0 (6.71) |
| Progressed | 3 | 43.5 (6.67) | 45.0 (6.99) |
| Progressed | 4 | 50.0 (6.75) | 54.5 (7.21) |

Party 4 over solo: fresh 1.63x -> 2.56x, progressed 1.52x -> 2.06x. Fresh solo: floor 3+ 91.0% -> 90.0%, return-trip lethality 10.9% -> 20.0% (9/45), deaths per run 0.71 -> 0.82. Death causes stay diverse (largest: bone_gnawer 21 of 164, fetid_stalker 20, slate_hound 17, crypt_sentinel 16, status.poisoned 14). Renown banked per run (fresh solo) 346.8 -> 294.0, 3293/hr at 1x. Changed constants: `RECOVERY_INTERVAL` 8 -> 12, `KILL_GROUP_BONUS` 0.25 -> 0.55, surge `templateBonus` 0.15 -> 0.10 (`countMul` 1.1 unchanged).

Meta economy review (no costs retuned): a fresh solo run banks about 294 Renown on average (3293/hr at 1x). The Guild Hall tree totals about 2,020 Renown, so the whole tree is about 7 average runs, and the first node (second berth, 50) costs under one run, against the Principle 7 wish for several tense runs first. ETH-132 should rescale against about 290 Renown per fresh run (and about 1,100 per 10-floor victory), with the second berth at roughly 2 to 3 runs.
- 2026-11-24: Reviewed and merged into m1.5-living-dungeon by the orchestrator (5288e43, merge c2e645e); npm run check green (106 files, 1255 tests). Orchestrator re-ran T3 on c2e645e: seeds 1-200 reproduce exactly (fresh 18.0/32.5/38.0/46.0, progressed 26.5/37.0/45.0/54.5). Robustness check on seeds 201-400 progressed: 27.5/33.0/40.0/50.5 -- ordering holds, but party 4 is 1.84x solo, under 2x. The 2x ratio on progressed is at the edge of noise; flagged to Nate.
