---
id: ETH-121
title: Shared conditions: run-scope conditions and a Requirement type usable outside rules
type: feature
status: blocked
priority: P1
milestone: M2
epic: behavior-rules
size: M
depends_on: [ETH-009, ETH-055, ETH-074]
created: 2026-11-19
updated: 2026-11-19
---

## Summary
One predicate vocabulary for the whole game. Behavior-rule `CONDITIONS` gain a scope so some can
be checked without a deciding actor, and a data type, `Requirement`, combines them (all / any /
not). Unlock requirements, deity taboos and quirk triggers are then written as data against
`CONDITIONS` instead of each feature defining its own little predicate language.

## Why
Four planned features each need "a check written as data": milestone-gated unlocks (ETH-036,
"find a spellbook, reach floor 10"), building quests (ETH-093), deity taboos (ETH-070) and quirk
triggers (ETH-104, "nearly died to a spider"). Today the only data predicates are rule
conditions (`ConditionDef`, which need an `AiCtx` with an actor) and the profile-level
`Milestone` union (`src/content/milestones.ts`). Without a shared layer each feature would grow a
third and fourth vocabulary, and the rules editor (M3) would not offer them. See `CLAUDE.md`
§5.2 and the "Shared systems" list in `docs/ARCHITECTURE.md`.

## Acceptance criteria
- [ ] `ConditionDef` (`src/sim/ai/types.ts`) gains `scope: 'actor' | 'run'` (default `actor`,
      so every existing condition is unchanged). A `run` condition's `evaluate` takes a
      `RunCtx = { state }` (`AiCtx` extends it), so it can be checked by the run, a tracker or
      the meta layer as well as inside a rule. `defineCondition` types the ctx by scope. At
      least `cond.always`, `cond.heading_out`, `cond.bottom_floor` and `cond.contracts_complete`
      are marked `run`.
- [ ] `Requirement` (plain data, Zod `requirementSchema` in `src/content/requirements.ts`):
      `{ cond: id, params? } | { all: Requirement[] } | { any: Requirement[] } | { not: Requirement }`.
      `checkRequirement(ctx, req) → { ok, detail }` (`src/sim/ai/requirements.ts`) evaluates it,
      and `describeRequirement(req)` words it from each condition's `describe` ("HP below 30% and
      not poisoned"). An `actor`-scope condition inside a requirement checked with a `RunCtx`
      is a validation error, not a runtime surprise.
- [ ] Content refs: `requirementRefs(path, req)` lets any kind that embeds a requirement have its
      condition ids and params checked by `checkGame` against `CONDITIONS` (the same way upgrade
      unlock ids are checked today).
- [ ] Profile scope: a new `Milestone` kind `{ kind: 'metInRun', requirement }` (one union member,
      schema option and cases in `milestoneMet` / `describeMilestone`). A run tracker
      `track.requirements` checks each watched run-scope requirement at the end of every step
      and records the ones that held at least once; its `RunResult.extras` lists them, and
      `unlockMilestones` reads it. Watched requirements are collected from `milestoneTargets()`
      and passed in through `RunConfig.watchRequirements?` by `buildRunConfig`.
- [ ] Tests: combinators and wording; a run-scope condition used both in a rule and in a
      requirement gives the same answer; a fixed-seed run that reaches floor 3 records a
      `metInRun` milestone; content validation rejects an unknown condition id and an
      actor-scope condition in a run-scope requirement.
- [ ] `docs/ARCHITECTURE.md` §4 and the "Shared systems" entry describe scopes and `Requirement`.

## Notes
Who uses it and how:
- **ETH-036** writes each class or race unlock as a `metInRun` milestone with a requirement
  ("carrying a spellbook", "reached depth 10").
- **ETH-093** words a building quest's requirement with it (the objective itself is ETH-114,
  whose `condition` objective kind wraps a `Requirement`).
- **ETH-070** writes a taboo as a requirement that must never hold (checked through ETH-114's
  `avoid` objectives).
- **ETH-104** writes a quirk trigger as an actor-scope requirement checked on an event.

Open decisions:
- (default) Extend `CONDITIONS` with a scope rather than add a separate `PREDICATES` registry —
  alternative: a new `pred.*` registry that rule conditions wrap. One registry keeps the rules
  editor and data checks on one vocabulary.
- (default) Profile-level requirements stay in the `Milestone` vocabulary (lifetime totals) and
  reach run-level checks only through `metInRun` — alternative: make `Requirement` evaluate
  against the profile too, with profile-scope conditions.
- (default) A run requirement is checked at the end of each step, not on every event —
  alternative: check after every action (finer, slower).

## Log
- 2026-11-19: Created in the shared-systems pass (foundation for ETH-036, ETH-070, ETH-093, ETH-104).
- 2026-11-19: (spec gate) awaiting Nate's review of this spec
