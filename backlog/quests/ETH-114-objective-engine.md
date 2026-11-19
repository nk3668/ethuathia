---
id: ETH-114
title: Objective engine: reusable objectives with progress, generalized from contracts
type: feature
status: blocked
priority: P1
milestone: M2
epic: quests
size: M
depends_on: [ETH-024, ETH-121]
created: 2026-11-19
updated: 2026-11-19
---

## Summary
Lifts ETH-024's contract objective (`ContractObjective`, `objectiveSchema`, `contractProgress`)
out of contracts into one objective engine: a data `Objective` union, a registry of objective
kinds that measure progress, and a per-run list of tracked objectives with an owner. Contracts
become its first owner with no change in behavior; bounties, conducts, taboos and building
quests are later owners.

## Why
Contracts (026, 027, 032), bounties (029, 030), conducts (067), taboos (070), building quests
(093) and later achievements all need "a goal with progress toward a target, complete or
failed". Today that exists only inside `src/sim/quests/contracts.ts` as a `switch` on
`objective.kind`. Without a shared engine each feature would grow its own progress code,
events and invariants. See `CLAUDE.md` §6 and the "Shared systems" list in `docs/ARCHITECTURE.md`.

## Acceptance criteria
- [ ] Content: `src/content/objectives.ts` holds `Objective` and `objectiveSchema` (moved from
      `contracts.ts`; `ContractDef.objective` now uses them). Kinds in this item: `recover
      { item }` (as today), `count { event, match?, count }` (counted from events, e.g. kills of
      a monster id, fountains drunk), `reach { depth }`, `condition { requirement }` (ETH-121, 0/1)
      and `avoid { event, match? }` (failed the first time it happens; a conduct or taboo).
      `objectiveRefs` checks ids. A new kind is one union member, one schema option and one
      `ObjectiveKind` entry.
- [ ] Sim: `OBJECTIVE_KINDS` (`src/sim/quests/objectives.ts`), each
      `{ kind, measure: 'state' | 'events', target(spec), progress(state, spec, counter),
      reduce?(counter, event, spec), describe(spec) }`. State-measured kinds recompute from the
      run (as `contractProgress` does now); event-measured ones fold events into a plain
      `counter` saved in the slice. `contractProgress` becomes a thin call into it.
- [ ] State: `state.domains.quests.objectives: TrackedObjective[]`, each `{ key, owner:
      { kind: 'contract' | 'bounty' | 'conduct' | 'taboo' | 'quest', id }, spec, counter?,
      current, target, status: 'active' | 'complete' | 'failed' }`. `trackObjective` /
      `syncObjectives` (run from the quests `turnStart` / `turnEnd` hooks, replacing
      `syncContracts`) return the transitions; the **owner** emits its own events (contracts
      keep `contractProgress` / `contractCompleted` / `contractLost` unchanged). Invariant
      `quests.objectives` (whole numbers, `current ≤ target` for non-`avoid`, status agrees
      with progress). `STATE_VERSION` + 1.
- [ ] Results: `RunResult.extras['quests.objectives']` lists every tracked objective's owner,
      key and final status, so meta (milestones, achievements, Favor for kept conducts) reads
      one place. A `Milestone` kind `{ kind: 'objectiveDone', owner }` is added for ETH-093.
- [ ] Tests: the existing contract tests pass unchanged; fixed-seed tests for `count`, `reach`,
      `condition` and `avoid`; a save/load mid-run keeps event counters; the sim compare shows
      no behavior change.
- [ ] `docs/ARCHITECTURE.md` "Contracts in the run" points at the engine; the "Shared systems"
      entry is marked built.

## Notes
Who uses it and how:
- **ETH-026 / 027 / 032:** each contract type is an objective kind (`slay`, `gather`, `reach`,
  `rescue`) plus, if it places something, a `FLOOR_PLAN_HOOKS` entry.
- **ETH-029 / 030:** a bounty is a tracked objective with owner `bounty`; its reward joins the
  at-risk total through its own tracker, like `track.contracts`.
- **ETH-067:** a conduct is an `avoid` objective with owner `conduct`; kept ones pay Favor.
- **ETH-070:** a taboo is an `avoid` (or `condition` with `not`) objective with owner `taboo`.
- **ETH-093:** a building quest is an objective with owner `quest`; finishing it records an
  `objectiveDone` milestone that opens the building.
- **ETH-031:** quest rule conditions and AI weighting read `TrackedObjective`s, not contracts.

Open decisions:
- (default) Owners emit their own events; the engine emits none — alternative: generic
  `objectiveProgress` / `objectiveCompleted` events with an owner field (fewer event types, but
  blander log text and a breaking change to ETH-024's events).
- (default) `count` objectives count from the moment the objective is tracked, not from run
  start — alternative: count the whole run so far.
- (default) An `avoid` objective is `complete` at run end if never broken (so kept conducts read
  like completed ones) — alternative: a separate `kept` status.

## Log
- 2026-11-19: Created in the shared-systems pass (foundation for ETH-026, 027, 029, 030, 031, 032, 067, 070, 093).
- 2026-11-19: (spec gate) awaiting Nate's review of this spec
