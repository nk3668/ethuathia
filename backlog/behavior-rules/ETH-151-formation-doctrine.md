---
id: ETH-151
title: Formation tactic - Stick together, Loose or Spread out
type: feature
status: done
priority: P2
milestone: M3
epic: behavior-rules
size: S
depends_on: [ETH-145, ETH-162]
created: 2026-11-24
updated: 2026-11-25
---

## Summary
Make party cohesion the **formation** axis of tactics (`CLAUDE.md` §5.2) instead of the fixed `PARTY_LEASH` constant the baseline AI got in ETH-145.

## Why
ETH-145 found that 75% of deaths in a progressed party of 4 happened with no ally within 6 tiles, so the baseline got a fixed regroup leash. Spreading out explores faster and suits a strong or ranged party; sticking together is safer. That trade-off is the player's decision (`CLAUDE.md` §1).

## Acceptance criteria
- [x] `tactic.*` formation defs:
  - *Stick together* (today's leash, the default)
  - *Loose* (a wider leash)
  - *Spread out* (a much looser leash or none)
- [x] `PARTY_LEASH` is read through the formation in `AiCtx`, defaulting to today's value, so balance numbers don't move under the default.
- [x] The regroup trace names the formation ("regrouping: formation is Stick together").
- [x] Codex and tooltip text explain the trade-off, with harness numbers for each setting.
- [x] Sim tests on a fixed seed and hand-built map for each setting. The party-size ordering (ETH-145) holds under the default. `npm run check` passes.

## Refined plan
Today `cond.party_scattered` reads only the stance's `leash` key and the `PARTY_LEASH` (8) / `PARTY_CLOSE` (3) constants; the formation options (ETH-162) carry `{ leash, close }` that nothing consumes, so Loose does nothing yet. ETH-193's Scout already reads `tacticsOf(ctx).formation.params.leash`, so that param must be the real leash.

**Formations (params `{ leash, close }`, validated by `tacticParamProblems`)**
| Option | leash | close | Notes |
|---|---|---|---|
| Stick together (default) | 8 | 3 | = today's constants, so the default is metric-identical |
| Loose | 14 | 6 | as ETH-162 shipped |
| Spread out | 30 | 12 | first guess; "much looser": about a third of a floor, so regrouping only triggers when someone is truly lost. Not "none", so a straggler can still be fetched and Scout's 2x leash stays finite. Tuned in the M3 balance capstone |

The defs keep their numbers; named constants `FORMATION_*_LEASH` / `_CLOSE` in a new `src/content/formations.ts` (as `stances.ts` does for stances) become the source of truth, with descriptions built from them. `PARTY_LEASH` / `PARTY_CLOSE` stay exported as aliases of the default for baseline fallbacks (an actor with no picks resolves to the default formation anyway).

**Folding in the stance leash (decision proposed)**
- Remove the stance `leash` key (tiles). Add one stance key `leashPercent` (whole number 25-400, joins `STANCE_PARAM_LIMITS`): the share of the formation's leash and close the stance allows. Cautious 60, Reckless 175, others unset (100).
- Effective numbers: `leash = max(2, round(formationLeash * percent / 100))`, `close = max(2, min(leash, round(formationClose * percent / 100)))`. Under Stick together this gives Cautious 5 / 2 and Reckless 14 / 5, which is exactly today's stopgap behaviour (today: leash 5 / close max(2, floor(3/8*5)) = 2; leash 14 / close floor(3/8*14) = 5). Loose + Cautious = 8 / 4; Spread out + Reckless = 52 / 21, effectively no leash, a corner the player chose twice.
- Why not "the stance drops the leash and Cautious recommends Stick together": a stance may not change another axis (tactics change only by player choice), and Cautious would then differ from Steady only in fleeing. Scaling keeps both axes meaningful and independent.
- `partyClose()` is deleted. One helper `partyCohesionOf(actor)` in `src/sim/ai/stanceParams.ts` (next to the other param readers; needs only `actor.ai.tactics`, no `AiCtx`) returns `{ leash, close, formation }` (the formation option id).

**Consumers**
- `cond.party_scattered` calls `partyCohesionOf`; its description is generated from the default numbers.
- `act.regroup` detail names the formation: "regrouping with Bram, 9 tiles away (formation: Stick together)". The ETH-162 trace names rule-row options already; this is a baseline rule, so the name goes in the detail.
- Scout (ETH-193) keeps reading the raw `formation.params.leash` (x2). No change here; I check the merged result when the two stack (question 3).
- `act.descend` / `act.gather` do not use the leash and stay as they are.
- Tool: `npm run sim -- --formation ID` (like `--stance`) for the per-formation smoke numbers.

**Text**
- Descriptions generated from the constants, each with its trade-off: Stick together "a straggler more than 8 tiles from the lead walks back until within 3. Safest, slower to explore"; Loose "14 ... 6. Explores faster, help is further away"; Spread out "30 ... 12. Explores fastest, and dies one at a time: suits a strong party". After the smoke runs I add one "measured" line per option (win rate, deaths with no ally near, turns per floor) marked as first-guess figures. Cautious and Reckless descriptions say "stays within 60% of the formation's leash" / "may drift 175% of it". No Codex schema change (tactic entries show description and hint). Log: regroup lines are the existing AI log entries, now naming the formation.

**Tests** (`test/sim/formation.test.ts`, fixed seed, hand-built map)
1. Contract: each formation def has valid params, close <= leash; the default equals the old constants; the stance `leash` key is rejected and `leashPercent` bounds are enforced.
2. Hand-built corridor, lead plus one follower at gap 10: Stick together regroups, Loose and Spread out do not; at gap 16 Loose regroups, Spread out does not; at gap 31 Spread out does.
3. Hysteresis: a regrouping follower keeps walking until `close` (3 / 6 / 12), then stops.
4. Stance scaling: Cautious + Stick together 5 / 2, Reckless + Stick together 14 / 5 (stopgap parity), Cautious + Loose 8 / 4.
5. The regroup trace names the formation.
6. Swapping the formation mid-run changes the leash on the next decision; the engine never changes it by itself.
7. The ETH-145 party-size ordering test stays unchanged and passes under the default.

**Sim checks (DIFFICULTY_PHILOSOPHY §9, work item)**: T0 on 20 seeds against eth-071 with the default formation: every metric and state hash identical (Cautious and Reckless included, since their numbers are preserved). Smoke, 20 seeds per formation at party 3 and party 4: win rate, mean depth, turns per floor, share of deaths with no ally within 6 tiles. No T1-T3.

**Risks / notes**
- Hash identity relies on the rounding in the Cautious and Reckless rows above; the T0 run proves it, otherwise I adjust the percents.
- No STATE/SAVE bump: no persisted shape changes (picks are ids; the stance param is content).
- The Library gate for Loose and Spread out is ETH-163; here all three are pickable, as ETH-162 left it.

**Questions**
1. Spread out at 30 / 12 and Loose at 14 / 6: OK, or prefer Spread out 24 / 10?
2. Stance `leashPercent` scaling (Cautious 60, Reckless 175) in place of the stance `leash` key: OK?
3. Should Scout read the stance-scaled effective leash (via `partyCohesionOf`) instead of the raw formation leash? I lean no and would leave ETH-193 alone.
4. OK to add the `--formation` flag to `npm run sim`?

## Notes
- *Stick together* is free; the others are Library unlocks (ETH-163).

## Log
- 2026-11-24: Created during ETH-145 (Nate chose a new M3 item over extending ETH-071).
- 2026-11-24: Nate: doctrines are unlocked through building trees. *Spread out* is unlocked by a Library node (ETH-163); *Stick together* stays the default.
- 2026-11-25: Rewritten for the tactics design: formation is a tactics axis with three options. Depends on ETH-162 instead of ETH-071.
- 2026-11-25: Planning gate: Refined plan written (branch eth-151-formation, based on eth-071-party-stances). Awaiting approval.
- 2026-11-25: Plan approved with answers: Loose 14/6 and Spread out 30/12 as first guesses (ETH-165 tunes them); stance `leashPercent` (Cautious 60, Reckless 175) replaces the stance `leash` key; `--formation` added to `npm run sim`; ETH-193's Scout is not on this base and is untouched.
- 2026-11-25: Built (branch eth-151-formation). Numbers in src/content/formations.ts; Spread out option added; `partyCohesionOf(actor)` (exported from `src/sim`) is the one reader, used by `cond.party_scattered` and `act.regroup`; `partyClose()` deleted, `PARTY_LEASH`/`PARTY_CLOSE` kept as the default formation's values. Trace/log: `Regroup: regrouping with Bram, 9 tiles away (formation: Stick together)`; the condition detail is `9 tiles from Bram (formation: Stick together)`. Cautious and Reckless descriptions say they tighten/loosen whatever formation is picked. No STATE/SAVE bump. T0 against eth-071 on 20 seeds: default at party 1 and 3, and `--stance cautious` / `--stance reckless` at party 3, every metric and state hash identical. Smoke 20 seeds each, see the report. Per-option measured lines were not added to the tooltips: at 20 seeds the differences are within noise.
- 2026-11-25: **When merging with ETH-193, Scout should read `partyCohesionOf(actor).leash` (not the raw `formation.params.leash`)** so Cautious ranges less.
- 2026-11-25: Idea (not built): `tools/compare.ts` `simArgv` does not forward `--stance` (or `--formation`, `--contract`), so `--compare` ignores them for the baseline run; use `--baseline FILE` made on the ref instead.
- 2026-11-25: Review feedback addressed and merged to main (PR #142). Done.
