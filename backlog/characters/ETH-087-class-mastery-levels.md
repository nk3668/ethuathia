---
id: ETH-087
title: Class Mastery XP: every run banks XP toward a guild-wide level per class
type: feature
status: ready
priority: P1
milestone: M2
epic: characters
size: M
depends_on: [ETH-034, ETH-119]
created: 2026-11-18
updated: 2026-11-24
---

## Summary
Each class has one guild-wide Mastery level, and from M2 on every run adds Mastery XP to it. Adventurer levels reset each run, so Mastery is the lasting power a run earns for a class. The talent points it grants are spent in M4 (ETH-088); until then they bank up.

## Why
With levels resetting (Nate, 2026-11-24), each run has to leave something behind for its classes. Counting from M2 means runs played before the trees arrive still count. See `CLAUDE.md` §4 (Class Mastery and talents).

## Acceptance criteria
- [x] Spec reviewed by Nate before building (spec gate)
- [ ] **Profile slice `mastery`** (`src/meta/slices/mastery.ts`, one line in `PROFILE_SLICES`): `{ classes: Record<classId, { xp: number; runs: number }> }`. Only XP is stored; level and points are derived from it by the curve, so retuning the curve never needs a migration. Old saves load with `classes: {}`. Invariants: non-negative integer `xp` and `runs`; keys are class ids (unknown ids kept but ignored, like upgrade ids).
- [ ] **Per-member XP** comes from `RunResult.extras['track.xp'].byActor` (already recorded, the fallen included), joined to `extras['run.party']` for the class.
- [ ] **Diminishing returns per class, per run:** sort that class's members by run XP, highest first; they contribute `MASTERY_SHARES = [1, 0.75, 0.5, 0.25]`, and any further member 0.25. Members marked as companions contribute `MASTERY_COMPANION_SHARE = 0.5` and are left out of that ordering. This item adds the optional `companion?: true` to `PartyMemberRecord`; nothing sets it until ETH-089.
- [ ] **Run-end bonus**, once for each class in the party (not per member, not diminished): `MASTERY_BONUS_PER_DEPTH × deepest floor reached + MASTERY_BONUS_PER_OBJECTIVE × objectives completed` (completed contracts from `extras['quests.objectives']`; bounties count once they exist). Paid on every outcome; a wipe does not take 25% of it (Mastery isn't currency).
- [ ] **Endless curve, one tunable table** (`src/meta/mastery.ts`): Mastery starts at level 0; going from level L to L + 1 costs `MASTERY_CURVE.base × (1 + MASTERY_CURVE.growth × L)` XP. Each level is one talent point; `points = level` until M4 adds spending. Pure helpers: `masteryLevel(xp)`, `masteryProgress(xp)` (level, XP into it, XP to next), `masteryOf(profile, classId)`, `masteryGain(profile, result)` (per class: XP gained, the member/bonus breakdown, level before and after).
- [ ] **Calibration:** pick `base` so the `npm run sim` median victory at the default preset, credited to a class at Mastery 0 with one contract done, gains about 5 levels; pick `growth` so the ~40th point takes about 20 such runs. Put the measured numbers in the PR. ETH-161 retunes them.
- [ ] **`onRunResult`** adds each class's gain and `runs + 1` using `masteryGain`; pure, returns a new slice.
- [ ] **Run summary** shows one line per class: "Vanguard Mastery +1,240 XP · level 3 → 5", with a tooltip that breaks it down (each member's XP × share, the bonus terms). It reads `masteryGain` with the profile from before the run was banked (follow how the summary gets that today).
- [ ] **Guild Hall** shows a Mastery list: each class with Mastery XP, its level, a progress bar to the next level (with a text value, not color alone), and banked talent points, plus a tooltip explaining Mastery, the shares and that points are spent from M4 on. Codex/help text for "Class Mastery".
- [ ] **Tests:** a living and a fallen member both contribute; two and four members of one class get 100/75 and 100/75/50/25 by XP order; a companion gets 50% outside the order; the bonus grows with depth and objectives and is paid once per class; a wipe still banks Mastery in full; curve: level from XP at the boundaries, endless; old save migrates; profile round-trip.

## Notes
- The XP already flows: `grantXp` emits `xpGained` with the class id and `track.xp` sums it per actor and per class (`src/sim/stats/leveling.ts`). No sim change is needed apart from the optional `companion` flag.
- ETH-119 (adventurer records) lands first and touches `onRunResult` and `PartyMemberRecord`; build on it.
- Talent trees and spending stay in M4 (ETH-088). Points past the end of the trees go into small repeatable bonuses there.

Open decisions:
- (default) Mastery XP is not reduced on a wipe. Alternative: lose 25% like currencies. Nate's rule "a short loss earns little" already holds because a short run earns little XP.
- (default) The run-end bonus is paid once per class in the party. Alternative: per member through the same shares (bigger parties of one class earn more bonus).
- (default) The Omen multiplier (M6) does not apply to Mastery XP. Revisit in M6.
- (default) Mastery starts at level 0 and each level is one point.

## Log
- 2026-11-18: Created from Nate's interview answers (2026-11-18).
- 2026-11-19: Added ETH-119 (adventurer records) to `depends_on`: build on the shared system instead of a parallel version.
- 2026-11-24: Moved from M2 to M4 in the backlog reorganization by theme.
- 2026-11-24: Progression discussion with Nate: levels reset each run and Mastery XP starts counting in M2, so this item moves back to M2 as XP tracking only. The trees and spending stay in M4 (ETH-088). Added diminishing returns, run-end bonus, companion share; dropped the ETH-086 dependency.
- 2026-11-24: (spec gate) Spec written against the code (`track.xp` in `src/sim/stats/leveling.ts`, `run.party` in `src/sim/run/end.ts`, `quests.objectives`); awaiting Nate's review.
- 2026-11-24: Spec approved by Nate with all defaults as written. Status ready.
