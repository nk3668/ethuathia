---
id: ETH-193
title: Roles, ranges and focuses - Tank, Healer, Damage and Scout; engagement distance; target choice
type: feature
status: in-progress
priority: P1
milestone: M3
epic: behavior-rules
size: M
depends_on: [ETH-162, ETH-192]
created: 2026-11-25
updated: 2026-11-25
---

## Summary
Ship three per-adventurer tactics axes (`CLAUDE.md` §5.2), and tune each class's default build from them.
- **Roles:** *Tank*, *Healer*, *Damage*, *Scout*. The *Controller* role is ETH-195.
- **Ranges:** *Front line*, *Close support*, *Back line*, *Keep away*.
- **Focuses:** *Nearest*, *Weakest*, *Strongest*, *Casters*, *Melee*, *Ranged*, *Protect allies*.

## Why
These are the core choices: what an adventurer is for, how close they fight and who they hit.

## Acceptance criteria
- [ ] **Roles** work through ability tags (ETH-192):
  - *Tank* holds the front, steps between foes and hurt allies, and stays at the front of the leash
  - *Healer* puts `heal` and `buff` on allies before attacking
  - *Damage* uses its best `damage` source
  - *Scout* ranges ahead of the party and avoids fights it can walk away from

  Each has a stated fallback when the adventurer lacks the tag.
- [ ] **Ranges** set preferred engagement distance, read by approach, hang-back and bolt actions.
- [ ] **Focuses** set target choice, read by attack, approach and rush actions. *Protect allies* targets whoever last hit an ally.
- [ ] **Class default builds** are tuned from these. The defaults may change behavior, measured with a 20-seed smoke run against tactics off.
- [ ] Trace, tooltip, Codex and log text for every option. Hand-map sim tests per option on a fixed seed. `npm run check` passes.

## Notes
- Reuse the existing actions: `act.mend_ally`, `act.bolster_ally`, `act.hang_back`, `act.surround`, `act.rush_caster`, `act.regroup`, `act.hold_position`.
- If this runs over size M, split roles from ranges and focuses.

## Refined plan
Written 2026-11-25 against ETH-162's branch. Awaiting approval before any code.

### What the code allows today (shapes the plan)
- Adventurers fight only in melee, never approach an enemy on their own (the baseline attacks what is adjacent, otherwise explores), and items act on their user only (`sourcesByTag`). So *Healer* cannot mend an ally and *Back line* has no ranged attack to use yet; ranged weapons and ally-targeted abilities arrive with ETH-195 and M4.
- This item therefore builds the options and parameters now, makes them do something real for melee-only parties, and leaves hooks (the `engage` and `prefer` params are read where a ranged source will later read them). Where a role asks for something that cannot be done yet it falls back with a trace note, as ETH-162 designed.

### Options (a new section at the end of `src/content/tactics.ts`; split into `src/content/tacticsRoles.ts` if the file passes ~450 lines)
**Role** (rows, built in order stance, habits, role; every row is gated by a condition so the baseline is untouched when it does not apply):
- *Tank* (new). Row: `cond.ally_ahead` (new: an ally in sight is nearer an enemy in sight than I am) -> `act.guard_front` (new): step to the free tile nearest the enemy that keeps me between the foe and that ally. Already adjacent to a foe: does nothing, the baseline attacks. No ally nearer: null, baseline. Trace: "Tank: stepping up between Gloomling and Mira".
- *Healer* (placeholder replaced). Rows: (1) `cond.wounded 50` -> `act.use_ability {tag heal}` (kept); (2) `cond.ally_hurt 60` -> `act.tend_ally {tag heal}` (new): needs an ally-reaching source, and `bestByTag(ctx, tag, ally)` finds none today, so it skips with "no healing that reaches allies, carrying on as normal" and works unchanged once a source exists; (3) `cond.enemy_visible` -> `act.hang_back` (existing; reach comes from the range pick instead of monster powers).
- *Damage* (stays the neutral default). One row: `cond.enemy_adjacent` -> `act.use_ability {tag damage}`; with no damage source (all of today) it skips with "no damage ability, striking with the weapon" and the baseline attack follows, so play is unchanged. Becomes live with wands and abilities.
- *Scout*. Rows: (1) `cond.enemy_visible` -> `act.avoid_fight` (new): with no enemy adjacent, walk away along the flee map from enemies that can hurt the party (harmless ones ignored); cornered: null, baseline; (2) `cond.party_scattered` -> `act.scout_ahead` (new): keep exploring instead of regrouping, up to 2x the formation leash from the lead, never with an enemy in sight or below 50% HP. Nothing to explore: null, baseline regroup.
- *Controller* is ETH-195, not here.

**Range** (params only, `engage` tiles; `tacticParamProblems` unchanged): *Front line* 1 (default, neutral), *Close support* 2, *Back line* 4 (the placeholder, kept), *Keep away* 6. Read by:
- a new baseline rule `cond.enemy_visible -> act.hold_range`, after `act.attack_adjacent` and before `act.rush_caster`. With `engage <= 1` it is always null (T0 identity). With engage >= 2, only while a fight is under way (an ally is adjacent to an enemy) and a living ally stands nearer the enemy than I do: hold or step to keep >= `engage` tiles from the nearest enemy, within 3 tiles of that ally. No front ally: null, so I fight like anyone. Trace: "Back line: holding 4 tiles from Gloomling behind Bram".
- *Keep away* also steps back from an adjacent enemy when another ally is adjacent to that same enemy and a free tile out of its reach exists (the `act.fall_back` geometry), so it never abandons a one-on-one.
- `act.approach_enemy` for party actors stops closing at `engage`; `act.cast_bolt` and any future ranged source use `engage` as the preferred distance (documented hook, no ranged adventurer yet).

**Focus** (params only, `prefer`): `FOCUS_PREFERENCES` grows to `weakest` (default), `strongest`, `nearest`, `casters`, `melee`, `ranged`, `protect`. A new `chooseTarget(ctx, candidates)` in `src/sim/ai/focus.ts` is the one place that picks, used by `act.attack_adjacent` (adjacent set) and `act.approach_enemy` (visible set, party actors only; `act.rush_caster` already goes for casters). Enemy classes come from the monster's role powers: caster = has a bolt, mend or bolster power; ranged = has a bolt; melee = none. *Protect allies* = an enemy adjacent to a party ally (not me) or whose last decision attacked an ally (read from the monster's `ai.memory.intent`, no new state), weakest of those. No match: fall back to Weakest and say so, "Casters: none next to me, striking the weakest".
Options: *Weakest* (default), *Strongest* (kept), *Nearest*, *Casters*, *Melee*, *Ranged*, *Protect allies*.

### Class default builds (`ClassDef.tactics`)
- Vanguard: Tank · Front line · Protect allies (as in `CLAUDE.md`).
- Reaver: Damage · Front line · Weakest (neutral; the control group).
- Outrider: Scout · Close support · Weakest.
- Lorekeeper: Healer · Back line · Casters.
Reaver stays equal to tactics off; the other three change behavior on purpose and are measured below.

### Text
Every option gets name, description (what it does and its fallback) and hint; new rule actions and conditions get `description` and `describe`. Codex and the party card pick options up through the existing tactic entries; the Codex guard in ARCHITECTURE §11.6 is extended for the new focus values and rule actions. Trace and log lines as quoted above, starting with the option name through the existing `option` tag.

### Tests
Hand-built-map, fixed-seed tests per option in new `test/sim/tacticsRoles.test.ts` and `test/sim/tacticsFocus.test.ts`: Tank steps between foe and ally and falls back with no ally; Healer self-heals and notes the missing ally source; Damage skips with the note; Scout avoids a fight and ranges ahead of the leash but not with an enemy in sight; each range holds its distance and Front line never fires `hold_range`; each focus picks its target, plus the no-match fallback and Protect allies. ETH-162's placeholder fixtures (Healer, Back line, Strongest in `test/sim/tactics.test.ts`, `tacticsBehavior.test.ts`, `determinism.test.ts`, `test/meta/tactics.test.ts`): Healer, Back line and Strongest keep their ids, so ids stay valid; assertions on the old one-row Healer are updated; fixtures that only need "some non-neutral option" move to test-local `defineTactic` options. Guards: every option validates, every class default build is playable, neutral picks give the same event stream as tactics off.

### Keeping default behavior identical
Neutral picks (Damage, Front line, Weakest) add no effective rows: Damage's row skips and the baseline follows; `act.hold_range` with engage 1 and `chooseTarget` with `weakest` return today's results (same order, same id tiebreak). A test compares the event stream of a seeded run with neutral picks against tactics off. T0 (20 seeds) with every class forced to neutral picks must match ETH-162's numbers exactly; then a 20-seed smoke with the tuned class defaults against neutral, side by side (depth, turns, deaths).

### Shared files touched
`src/content/tactics.ts` (new section appended, plus `FOCUS_PREFERENCES`), `src/content/classes.ts` (four `tactics:` lines), `src/sim/ai/engine.ts` (one baseline rule), `src/sim/combat/rules.ts` (`act.attack_adjacent` and `act.approach_enemy` call `chooseTarget`), `src/sim/combat/roles.ts` (`act.hang_back` reach), `src/sim/ai/tactics.ts` (`focusPreference` widened), `docs/ARCHITECTURE.md` §4. New: `src/sim/ai/focus.ts`, `src/sim/ai/roleActions.ts`, tests. ETH-071 touches the stance rows of `src/content/tactics.ts`; I only append below the existing options.

### Risks and questions
1. Healer cannot heal allies until a source exists: mostly self-heal plus hang-back for now. Ship with the trace note, or hold Healer for ETH-195?
2. `act.hold_range` waits while allies fight: it is `idle` like `act.hang_back` so stuck detection leaves it alone, and the fight-under-way guard keeps it from waiting on idle monsters.
3. "Last hit an ally" is approximated (adjacent to an ally, or its last decision attacked one) to avoid a new state field and a STATE_VERSION bump. Acceptable?
4. Scout ranging ahead overlaps ETH-151 (leash and formation). I use 2x the formation leash and expect ETH-151 to own the numbers.
5. Class defaults change behavior (Vanguard Tank may change depth; Lorekeeper Back line may idle). Per the item; I report numbers and can drop a default back to neutral if the smoke run shows a regression.
6. Size M is tight (about 5 new actions, 1 condition, 5 new focus values, tests). If it runs over I split ranges and focuses from roles, as the item allows.

## Log
- 2026-11-25: Created from the tactics design (Nate, 2026-11-25).
- 2026-11-25: Started. Refined plan written against ETH-162's branch; waiting for approval before implementing.
