---
id: ETH-194
title: Habits and habit slots - several per adventurer, with exclusive pairs
type: feature
status: pending-review
priority: P1
milestone: M3
epic: behavior-rules
size: M
depends_on: [ETH-162, ETH-192]
created: 2026-11-25
updated: 2026-11-25
---

## Summary
Ship the **habit** axis (`CLAUDE.md` §5.2). Habits are small behaviors an adventurer can stack, limited by habit slots: 1 to start, up to about 3 through upgrades. The Guild Hall's Rule Clerk becomes a habit-slot node.

## Why
Habits give each adventurer a personality on top of their role. The slot count is the main progression lever for tactics, and Nate wants it tuned by experiment.

## Acceptance criteria
- [x] Habit defs, each with rule rows built by ETH-162:
  - *Avoids combat* (steers around known threats)
  - *Treasure hunter* (detours for visible or remembered items; there are no secrets or chests until M8)
  - *Finisher* (goes for wounded foes)
  - *Bodyguard* (stays near the party's healer)
  - *Sparing with potions* and *Quick to quaff*, an exclusive pair (different healing thresholds)
  - *Curious* (tests unknown items when safe)
- [ ] *Softens targets* (debuff before attacking) is listed here but ships with ETH-195, which adds the first debuff sources.
- [x] Habit slots are `capacity(profile, 'habitSlots', 1)`. The Guild Hall's **Rule Clerk** is renamed and re-texted as a habit-slot node, and the `ruleSlots` key becomes `habitSlots` (no save migration was needed: capacities are derived from owned nodes, see the Log).
- [x] The sim refuses more habits than slots, or both habits of an exclusive pair, and says why.
- [x] Trace, tooltip, Codex and log text. Hand-map sim tests per habit on a fixed seed. `npm run check` passes.

## Notes
- *Ambusher* waits for sleeping monsters and stealth (ETH-097, M5), and *Secret seeker* for secrets in M8 (Nate, 2026-11-25).

## Refined plan (2026-11-25, awaiting approval)

Based on ETH-162 (PR #138). Read against ETH-193 (roles/ranges/focuses, adds `act.avoid_fight`, `act.guard_front`, `cond.enemy_visible`, `cond.party_scattered`) and ETH-071 (stances, adds `stanceParams.ts`: `pickupDetour`, `fleeBelow`, `fleeRelease`). Habit content goes in a new `src/content/tacticsHabits.ts` and the new rule actions/conditions in a new `src/sim/ai/habitRules.ts`, so neither sibling's files conflict. The only shared edits are the registration lists (`domains.ts`, `content/index.ts`) and removing the placeholder `HABIT_QUICK_TO_QUAFF` from `tactics.ts` (it moves; id `tactic.quick_to_quaff` is kept).

### Habit list (M3, 6 habits; Softens targets ships with ETH-195)
Habit rows are checked after the stance's rows and before the role's, in pick order (ETH-162 order). Each habit is neutral on its own when its precondition is absent (the row's action returns `skipped`, so the baseline plays and the trace says why).

| Habit | Rows | Notes |
|---|---|---|
| **Quick to quaff** | `cond.wounded {percent: 60}` -> `act.quaff_healing` | Becomes param-only (see Sparing); the placeholder `use_ability` row is dropped. Exclusive with Sparing. |
| **Sparing with potions** | No rows (param-only) | A habit can only add rows ahead of the baseline, it cannot remove baseline rows. So Sparing needs a **param read by the baseline quaff**: `healBelowOf(actor)` in the items rules (like ETH-071's `stanceParamOf`) reads the actor's habits for a `healBelow` param (Sparing 20, Quick 60, none: baseline 35). Then Quick's row is also redundant; both habits become **param-only** (`params: { healBelow: 60 }` / `{ healBelow: 20 }`), the baseline `cond.wounded` row reads it. Habits get a `params` allowance for key `healBelow` only. Open question 1. |
| **Treasure hunter** | `cond.always` -> `act.pick_up {maxDetour: 30}` | Reuses `act.pick_up` (visible and remembered items; baseline 8). Habit rows sit above the whole baseline, so the row must carry its own safety: new condition `cond.calm` (no enemy in sight, not fleeing, not heading out). Row: `cond.calm` -> `act.pick_up`. Stance `pickupDetour` (ETH-071) is the baseline's number; Treasure hunter takes the larger of the two. |
| **Avoids combat** | `cond.enemy_visible` -> `act.avoid_fight` (ETH-193's action) | Same action as Scout, reused, so this depends on ETH-193 merging first, or I register a thin `act.steer_clear` of my own (no-adjacent-enemy, step along the flee map away from known threats, null when cornered or only harmless enemies). Open question 2. Never overrides `act.flee`/attack of an adjacent enemy. |
| **Finisher** | `cond.finisher_target` -> `act.attack_wounded` | New cond: an enemy at or below 30% HP within 6 tiles, reachable, none adjacent (adjacent: baseline already attacks, and focus decides). Action: step toward it (`approach` with that target). With an adjacent enemy the baseline attacks anyway. |
| **Bodyguard** | `cond.healer_far` -> `act.stay_by_healer` | New cond: the party has a living ally whose picked role is Healer (`tactic.healer`) more than 3 tiles away, and no enemy adjacent. Action: path to within 2 tiles of them. With no healer: skipped "no healer to guard". Uses the picked role, not a class. |
| **Curious** | `cond.safe_to_test` (existing) -> `act.test_unknown` | New action: quaff-test one unknown **potion** (scrolls are already read by the baseline `act.read_unknown_scroll`), only when HP >= 70%. See secrecy below. |

Exclusive pair: **Quick to quaff <-> Sparing with potions**. Any other contradiction later: *Avoids combat* vs *Finisher* is a real contradiction, so mark that a second pair (`exclusiveWith` is already mutual-checked by the content validator). Open question 3.

### Slots and enforcement
- `habitSlots = capacity(profile, 'habitSlots', 1)`, in `src/meta/prepare/` (new tiny `habits.ts` helper `habitSlotsOf(profile)`, clamped to `MAX_HABITS` 3).
- **Command validation, in the sim**: `setTactics` gets the limit from run state, not from the profile (sim has no meta access). `RunConfig.habitSlots?: number` (default 1) is stored in `RunState` (`state.tactics.habitSlots`, new field, serialized, STATE_VERSION bump). `tacticPickProblems(picks, slots)` adds "N habits, only S slots" and the existing exclusive/duplicate messages. The `core.tactics` invariant uses the same check, so a hand-built run can't exceed it. Reason text goes back through the existing command-refusal path and is logged by the UI.
- **Prepare**: `buildRunConfig` passes `habitSlots`. Picks already stored in roster records that exceed slots (after a respec of the Clerk node) are **truncated to the first S habits** at Prepare, with a note on the party card ("2 habits dropped: only 1 slot"). Roster picks are not rewritten until the player confirms. (ETH-196 owns the panel UI; I only expose `habitSlotsOf` and the truncation helper.)
- `MAX_HABITS` stays 3 as the hard cap; the constant remains in content.

### Rule Clerk rename and migration
- `upgrade.rule_clerk` is kept as an **id** (ids are never reused/renamed; owned nodes are stored by id, so existing saves keep it) but renamed **"Habit Tutor"**, text: "Teaches each adventurer room for one more habit. Pick this or the Second Contract Board; respec to change." Tags `habits`, `capability`. Grants `habitSlots +1`. Open question 4: if you want the id changed too, that needs an upgrades-slice migration (owned id and the exclusive group); I recommend not.
- `CAPACITY_INFO.ruleSlots` -> `habitSlots` ("Habit slots: how many habits each adventurer can carry."). Capacities are **derived from owned nodes' grants** (not stored), so there is **no data to migrate** and no save-format change for `ruleSlots` itself. The profile (SAVE) version therefore does **not** need a bump for this. The STATE_VERSION bump (41 -> 42) is for `RunState.tactics.habitSlots` only. Tests in `test/meta/upgrades.test.ts` that use `ruleSlots` as a throwaway key switch to `habitSlots`; ARCHITECTURE §upgrades capacity list updated. (This corrects the item text, which assumed a stored key.)

### Secrecy (Curious)
`act.test_unknown` chooses by what the party knows: it picks the first pack item that is a potion kind **and** `!isInstanceTypeKnown`. The condition and the choice never read the real type, enchantment or curse; the log line names the item as the actor knows it ("quaffing the unknown pink potion to learn what it does"), and what happens afterwards is the normal seeded effect and message. Rows and trace use only known info. Add to the §11.6 guard: the habit rows are covered by the hidden-state test (same decisions whatever an unidentified potion really is, for two seeds that differ only in the hidden potion type). Safety: HP >= 70%, `cond.safe_to_test` (no enemy in sight, stairs near), and never when any harmful potion exists unless the existing `identifySecrecy.test.ts` "every scroll is harmless" style assertion is extended: **today harmful potions may exist; Curious is a risk the player chooses** (Open question 5), so I only test when HP >= 70% and not on the last floor stretch.

### Trace, tooltip, Codex, log text
- Trace: the existing "tactic option name + rule" line, e.g. "Treasure hunter: picking up the iron ring (6 steps)"; skipped: "Bodyguard: no healer to guard, carrying on as normal".
- Log (AI tab), one line the first time per floor, then silent: "Curious Mira quaffs an unknown potion", "Bodyguard Bram closes on Mira (Healer)", "Finisher Bram goes for the wounded rat", "Treasure hunter Mira detours for a ring", "Avoids combat Mira steers clear of the ogre", "Sparing Bram holds the potion (HP 31%, waits for 20%)" on the first suppressed quaff.
- Tooltip/Codex: each habit has `description` (what it does, numbers included), `hint` (flavor), exclusive pair noted in the description ("Can't be taken with Sparing with potions"); habits get a Codex entry via the existing tactics Codex path (ETH-162) so `tacticsCodex` guards cover them. New conditions/actions get `name`/`description`/`describe`.

### Tests (fixed seed, hand-built maps)
`test/sim/tacticsHabits.test.ts`: per habit, one test showing the behavior and one showing the skipped fallback; slot refusal (too many, exclusive pair, duplicate) via `setTactics`; truncation helper; Curious hidden-state test (two potion types, identical decision trace); content validation test (habits registered, exclusive mutual, only habit axis). `test/meta/habitSlots.test.ts`: `habitSlotsOf`, Clerk node grants, truncation. Update existing tests for the key rename. `npm run check`.

### Sim checks
T0 identity (20 seeds): no habits picked -> metric-identical to ETH-162 (the baseline reads `healBelow` default 35, `pickup` unchanged). Smoke: 20 seeds per habit, set via a new `--habit <id>` flag on `tools/sim.ts` (mirrors ETH-071's `--stance`; keep in its own args block to ease the merge), reporting depth/turns/deaths and each habit's trigger count.

### Risks
- Habit rows sit above the baseline's urgent rows (potions, fleeing), so each habit condition must be safe by itself (`cond.calm`); a bad habit could starve exploring. Mitigation: the stuck detector and per-floor cap still apply; a test per habit that a run with it finishes.
- Merge order: Avoids combat leans on ETH-193; `healBelow` param touches items rules next to ETH-071's `stanceParams`.
- Finisher vs focus (ETH-193) overlap when a target is adjacent: Finisher only fires when the target is not adjacent.

### Open questions
1. Sparing/Quick as **param-only** (baseline reads `healBelow`) versus rows? Params are the only way for Sparing to *lower* the baseline's 35%. OK?
2. Avoids combat: depend on ETH-193's `act.avoid_fight` (merge ETH-193 first), or ship my own `act.steer_clear`?
3. Second exclusive pair Avoids combat vs Finisher: yes?
4. Rule Clerk: keep id `upgrade.rule_clerk`, rename to "Habit Tutor" (no migration)? Or a real id change plus an upgrades-slice migration?
5. Curious quaffs unknown potions: is a harmful potion outcome acceptable (the player opted in by picking the habit), or should it be scrolls/wands only?
6. Where should the Prepare truncation note live until ETH-196 builds the panel (log line only)?

## Log
- 2026-11-25: Created from the tactics design (Nate, 2026-11-25).
- 2026-11-25: Started. Refined plan written; planning gate, no code until approved.
- 2026-11-25: Plan approved. Decisions: Quick to quaff and Sparing are param-only (`healBelow`, read by the baseline's quaff rule through `cond.needs_healing`); Avoids combat reuses ETH-193's `act.avoid_fight`; Avoids combat and Finisher are a second exclusive pair; Rule Clerk keeps its id and becomes **Habit Tutor**; Curious drinks unknown potions (a harmful one is possible, said in the tooltip). Rebased on ETH-193 (stack 162 -> 193 -> 194).
- 2026-11-25: Correction to the item text: there is **no save migration** for `ruleSlots` -> `habitSlots`. Capacities are derived from the owned nodes' grants and never stored, and the node keeps its id, so old saves load as they are. The only version bump is `STATE_VERSION` 41 -> 42 for `RunConfig.habitSlots`.
- 2026-11-25: Built: six habits (`src/content/tacticsHabits.ts`), conditions and actions in `src/sim/combat/habitRules.ts` and `src/sim/items/habitRules.ts`, `habitParams.ts`, slots in `RunConfig.habitSlots` (checked in `createRun`, `setTactics` and the `core.tactics` invariant), `habitSlotsOf` and `fitHabits` in `src/meta/prepare/habits.ts`, `--habit` in `npm run sim`. Finisher's threshold is 35% (a rat at 1 of 3 HP is 33%). Tests: `test/sim/tacticsHabits.test.ts`, `test/meta/habitSlots.test.ts`. `npm run check` green. T0 (20 seeds vs ETH-193, no habits): every metric identical; state hashes differ only because the state version changed. Smoke (20 seeds, `--recruits --party 3`, Bodyguard on 3 Lorekeepers): no habit breaks a run.
- Out of scope: a trigger counter per habit in the sim report (hit counts for the tooltip belong with ETH-196); Softens targets with ETH-195; a note to the player when `fitHabits` drops habits (ETH-196's panel).
