---
id: ETH-071
title: Party stances - Steady, Cautious, Reckless, Delve, Plunder and Fall back
type: feature
status: pending-review
priority: P2
milestone: M3
epic: town-meta
size: M
depends_on: [ETH-058, ETH-115, ETH-162]
created: 2026-11-18
updated: 2026-11-25
---

## Summary
Ship the party **stance** axis of tactics (`CLAUDE.md` §5.2). The stance sets how the whole party approaches a floor. The old clear-floors-or-stairs doctrine becomes two stances: *Plunder* clears floors and *Delve* heads down once the stairs are known.

## Why
In 2026-11-18, the player asked for full exploration vs stairs-first to be their choice. The tactics design (2026-11-25) widens that into a stance the player swaps at will.

## Acceptance criteria
- [x] `tactic.*` stance defs, each with a short plain-language effect:
  - *Steady* (the default, today's behavior)
  - *Cautious* (leaves a fight and retreats earlier, stays closer)
  - *Reckless* (fights everything in sight, flees later)
  - *Delve* (descends once the stairs are known and a minimum share of the floor is explored)
  - *Plunder* (clears each floor and picks up more)
  - *Fall back* (heads home now, the same as `act.retreat_run`)
- [x] Stances change behavior through rule rows and `AiCtx` parameters (ETH-162), reusing the run-modifier flag path where it fits (ETH-115). The baseline descend logic reads the stance.
- [x] *Steady* reproduces today's behavior (T0 identity with it picked).
- [x] The trace names the stance when it decides ("Delve: stairs known, heading down").
- [x] Tooltips, Codex text and log lines. Hand-map sim tests per stance. A smoke run reports turns per floor and win rate for each stance.

## Refined plan

Planning gate: nothing below is built yet. Base: `eth-162-tactics-engine` (PR #138).

### Mechanism: rows for orders, parameters for thresholds

ETH-162 puts a stance's rows **ahead of the whole baseline**, so a bare row such as "stairs known -> descend" would pre-empt fighting, quaffing and fleeing. Two rules keep that safe, and neither edits `BASELINE_RULES` (so no clash with ETH-189 / ETH-154 in `engine.ts`):

1. **Guarded conditions.** Every stance row uses a new condition that is only true when the baseline has nothing urgent: not heading out already, not fleeing (`memory.fleeing === null` and HP at or above the stance's flee threshold), no enemy adjacent, no threat in sight, HP at or above `HEAL_BELOW_PERCENT`, not overloaded. One shared helper `stanceMayAct(ctx)` in a new `src/sim/ai/stanceRules.ts` does this; each new condition calls it first.
2. **Stance parameters.** The stance axis gains optional `params` (it already has `rows`; today only formation, range and focus take params). A stance without a key plays the baseline constant, so **Steady has no params and no rows and is exactly today's baseline**. `tacticParamProblems` and the schema allow these optional whole-number keys on a stance: `fleeBelow`, `fleeRelease` (percent, 1-99), `pickupDetour` (tiles), `floorCapPercent` (percent of `FLOOR_TURN_CAP`), `leash` (tiles). `stanceParam(ctx, key, fallback)` reads them from `tacticsOf(ctx).stance.params`.

Baseline reads (one-line changes each; the constants stay the defaults): `cond.fleeing` and `updateThreatMemory` (`fleeBelow` / `fleeRelease` instead of `BASELINE_FLEE_PERCENT` / `FLEE_RELEASE_PERCENT`; the engine already calls `updateThreatMemory` with the actor, so it takes the numbers as arguments), `floorTurnCap` for `cond.floor_overstayed` (`floorCapPercent`), `act.pick_up`'s default `maxDetour` (`pickupDetour`; an explicit param wins) and `cond.party_scattered` (`leash`, a minimum with the formation's leash once ETH-151 wires formation: that item owns the formation numbers).

### The six stances (constants named in `src/content/tactics.ts`, own stance section)

| Stance | Rows | Params | Plain-language effect |
|---|---|---|---|
| **Steady** (default) | none | none | Today's behavior. Explore every reachable corner, then descend. |
| **Cautious** | `cond.party_worn {percent: 40}` -> `act.retreat_run` | `fleeBelow 50`, `fleeRelease 75`, `pickupDetour 4`, `leash 5` | Flees sooner and recovers longer before going back in, stays within 5 tiles of the lead, and turns the whole party back once the living members' combined HP falls below 40% with nothing in sight (a retreat: keeps everything, survivors return). |
| **Reckless** | `cond.reckless_charge` -> `act.approach_enemy`; `cond.delve_ready {share: 60}` -> `act.descend` | `fleeBelow 20`, `fleeRelease 40`, `pickupDetour 4`, `leash 14` | Walks up to everything it sees, flees only below 20% HP, and heads down once the stairs are known and 60% of the floor is explored. |
| **Delve** | `cond.delve_ready {share: 25}` -> `act.descend` | `pickupDetour 4` | Heads for the stairs down as soon as they are known and 25% of the floor is explored. Still fights, flees and takes gear a few steps away. |
| **Plunder** | none | `pickupDetour 40`, `floorCapPercent 150` | Clears each floor and detours up to 40 steps for loot, with 1.5x the per-floor turn budget so the cap does not cut a thorough sweep short. Never leaves a floor early. |
| **Fall back** | `cond.fall_back_ready` -> `act.retreat_run` | none | Heads home now: climbs out together and ends the run as a retreat. |

The numbers are first guesses for the smoke runs, not tuned (balance is the M3 capstone). Each is a named constant, and each description interpolates them.

New conditions (all in `src/sim/ai/stanceRules.ts`, registered in `domains.ts` beside the tactic actions):
- `cond.delve_ready {share}`: guard passes, stairs down known, not the bottom floor, explored share of the floor at or above `share`, and no contract item the baseline would still fetch (`act.recover_contract_item` resolves to null). Detail: "stairs known, 38% explored".
- `cond.party_worn {percent}`: guard passes, and the living party's summed HP over summed max HP is below `percent`.
- `cond.reckless_charge`: guard passes (the flee threshold is Reckless's own 20%), and an enemy that is a threat is in sight but not adjacent.
- `cond.fall_back_ready`: not already heading out, and no enemy adjacent (one step toward the stairs next to a foe is worse than finishing the fight). Once `leaving` is set, the baseline's own `cond.heading_out` rules (below combat) carry the party out, so the stance row fires once.

Explored share uses the known-terrain data the engine already reads (`explored()`); a small helper `exploredShare(state, floor)` is added if none exists (to confirm).

### Interaction with existing systems
- **Floor-leaving / overstay:** Steady unchanged. Delve and Reckless leave through their row before exploring finishes. Plunder only raises the cap. The turn cap stays the safety net for every stance.
- **Loot:** `act.pick_up` keeps its `wantsItem` filter in every stance (no corpses or junk). Only the detour length changes.
- **Contracts and the return trip:** Delve and Reckless never skip a contract item the baseline would fetch. On the way up the party is heading out, so every stance row is off (`stanceMayAct` requires not heading out) and the return trip is identical in all stances; the Cautious and Fall back rows only *start* it. A retreat ends the run as a retreat (CLAUDE.md §2).
- **Bottom floor:** Delve's condition needs stairs down, so it falls through to the baseline, which turns back from the bottom floor as today.
- **Changes only when picked:** Cautious's worn-party retreat and Fall back are behaviors of a stance the player chose; nothing swaps stance by itself.

### Doctrines
`src/content/doctrines.ts` is a placeholder kind with no defs. Its users are the Codex renderer (`ui/codex/renderers/doctrine.tsx`), the registry list, the `doctrine.*` unlock-grant kind in upgrade validation and one content test with made-up ids. No Guild Hall or Smithy node references a doctrine. Proposal: **keep the kind**, update its header comment to say stances replaced doctrines (ETH-163 unlocks stances through `tactic.*` ids), and fix the `doctrine.seek_stairs` mentions in comments (`runModifiers.ts`, ARCHITECTURE) to say stances; no node changes.

### Trace, log, Codex, tooltips
- Row detail names the stance through ETH-162's `optionName` prefix: "Delve: stairs known, 38% explored, heading down", "Cautious: the party is down to 36% of its HP, heading home", "Reckless: closing in on the goblin", "Fall back: heading for the stairs up".
- Earlier fleeing shows in the existing flee line, whose condition detail gains the threshold ("HP 45% < 50%").
- Codex and tooltip text is each def's `description` and `hint` (already shown by the Codex tactic renderer), with the numbers interpolated from the constants so text and code cannot drift.

### Tests (fixed seed, hand-built maps, `test/sim/stances.test.ts`)
- Steady identical: a party with explicit Steady picks and one with no picks give identical event logs on the same map and seed.
- Delve: descends with stairs seen at 25% or more explored and not at 10%; an adjacent enemy is fought first; below 35% HP it quaffs first; a known contract item is fetched first.
- Plunder: an item 30 steps away is picked up (Steady leaves it); the floor cap is 1500.
- Cautious: flees at 45% HP where Steady fights; a calm party at 38% total HP turns back and the run ends as a retreat; with an enemy in sight no retreat row.
- Reckless: walks toward a visible enemy; at 25% HP it fights on where Steady flees; at 15% it flees.
- Fall back: from floor 2 the party climbs out together; an adjacent enemy is fought first; the run ends as a retreat.
- Content: every stance validates, params in range, the `core.tactics` invariant holds, descriptions contain their constants; a mid-run swap applies at the next decision.

### Sim checks (DIFFICULTY_PHILOSOPHY §9, work items)
T0 identity with Steady (20 seeds, metrics equal to base; no version bump expected, since stance already exists in picks). Smoke: 20 seeds per stance, which needs a `--stance <id>` flag on `tools/sim.ts` / `headless.ts` applying the stance to the whole party, reporting turns per floor, mean depth, wins, wipes, retreats and stalls. No T1-T3.

### Files touched
New: `src/sim/ai/stanceRules.ts`, `test/sim/stances.test.ts`. Shared with other work: `src/content/tactics.ts` (stance section, stance param keys in `tacticParamProblems` and the schema), `src/sim/ai/domains.ts` (register conditions), `src/sim/combat/rules.ts` and `src/sim/combat/threat.ts` (flee thresholds), `src/sim/floors/rules.ts` (cap, leash), `src/sim/items/rules.ts` (pickup default), `tools/sim.ts` and `tools/headless.ts` (flag), `docs/ARCHITECTURE.md` §4, `src/content/doctrines.ts` and `runModifiers.ts` (comments only). `engine.ts` and `BASELINE_RULES` are untouched.

### Risks
- Param edits in `combat/rules.ts` may textually conflict with ETH-189 and ETH-154 (kept to one-liners).
- ETH-193 also edits the shared `tactics.ts` param machinery; stance keys go in a separate branch of it.
- The guard duplicates some of the baseline's priority knowledge; if the baseline order changes, the guard must follow (tests pin it).
- `approach_enemy` must only target real threats (check `visibleEnemies` filtering while implementing).

### Questions
1. Fall back is one-way once `leaving` is set (same as a manual retreat). OK, or should re-picking Steady cancel it before the party reaches the stairs?
2. Keep the empty `doctrine` kind with an updated comment (planned) or delete it in a follow-up item?
3. Stance rows above the baseline with self-guarded conditions (planned) versus adding baseline-order hooks in `engine.ts`?
4. Should Cautious's worn-party retreat exist (it ends the run), or should Cautious only flee earlier and stay close, leaving "go home" to Fall back?
5. Cautious carries its own `leash 5` until ETH-151 owns formation. OK?

## Notes
- Which stances are free and which the Library unlocks: ETH-163.
- Stance changes only when the player picks one; there is no automatic switch to *Fall back*.

## Log
- 2026-11-18: Created from the player's answer to the ETH-058 question.
- 2026-11-18: Doctrine becomes a free-to-redo Tactics choice (ETH-086).
- 2026-11-19: Added ETH-115 (run-wide modifiers) to `depends_on`: build on the shared system instead of a parallel version.
- 2026-11-24: Moved from M2 to M3 in the backlog reorganization by theme.
- 2026-11-24: Nate: doctrines are unlocked through building trees; the unlock moves from a Guild Hall tier to a Library node (ETH-163).
- 2026-11-25: Rewritten for the tactics design (Nate, 2026-11-25): the doctrine becomes the party stance axis (six stances, Delve vs Plunder covering clear-or-stairs). Back to `idea` until ETH-162 lands; size M.
- 2026-11-25: In progress: refined plan written (planning gate), awaiting approval. Branch eth-071-party-stances from eth-162-tactics-engine.
- 2026-11-25: Built (branch eth-071-party-stances). Approved plan followed with changes: Reckless uses its own act.charge (remembers a threat 5 turns; act.approach_enemy untouched, ETH-193), Delve and Reckless pair act.descend with act.gather, explored share is the snapshot's explored().fraction. New: src/content/stances.ts, src/sim/ai/stanceRules.ts, stanceParams.ts, `--stance` on npm run sim. No STATE_VERSION bump. T0 against eth-162: 20 seeds, every metric and state hash identical. ETH-151 must fold Cautious's own leash (5) and Reckless's (14) into formation. Cautious's worn-party retreat and Fall back are one-way (leaving). Doctrine kind kept as an empty placeholder (deletion is an idea for Nate).
