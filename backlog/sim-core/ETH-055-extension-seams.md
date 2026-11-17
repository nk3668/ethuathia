---
id: ETH-055
title: Extension seams so feature work lands in per-domain files
type: chore
status: ready
priority: P0
milestone: M1
epic: sim-core
size: M
depends_on: []
created: 2026-11-17
updated: 2026-11-17
---

## Summary
Restructure the sim and log-text roots so each feature domain (stats, floors, combat, items, quests, run) owns its events, actions, state slice, snapshot slice and log text in its own files. Fix the shared contracts (stat ids, reward flow, state versioning) before parallel M1+ work starts.

## Why
Many items are about to be built in parallel. Today every new event, action or state field edits the same few files (`events.ts`, `actions.ts`, `state.ts`, `snapshot.ts`, `ui/shell/text.ts`), so parallel branches would conflict constantly. See `docs/ARCHITECTURE.md` §2 and §9.

## Acceptance criteria
- [ ] `src/sim/{stats,floors,combat,items,quests,run}/` each have an `index.ts` exporting a (possibly empty) event union, action record, state-slice type with an `init*` function, and snapshot-slice type. The root `SimEventBody`, `ACTIONS`, `RunState` and `Snapshot` only compose them, and `ACTIONS` stays exhaustive at compile time
- [ ] `ui/shell/text.ts` becomes a mapped record of per-event formatters, built from `ui/shell/logText/<domain>.ts` files; a missing formatter is a type error
- [ ] Placeholder content kinds (monster, item, contract, bounty, omen, deity) are registered in `CONTENT_KINDS` with schemas and no defs
- [ ] A `StatId` union (`hp, mp, accuracy, evasion, damage, armor, speed, sight, carry`) is defined in `src/sim/stats/` for ETH-057 to build on
- [ ] `docs/ARCHITECTURE.md` gets a **Contracts** section: domain module layout, stat ids, reward flow (events → `RunTracker` → `rewards.atRisk` → `applyRunResult`), state-version bump rule, log-text rule, where new rule conditions/actions go
- [ ] Behavior is unchanged: the determinism test and `npm run sim` hashes are unchanged except for the version bump

## Notes
- State-version rule: any PR that changes `RunState` shape bumps `STATE_VERSION` to (version on main) + 1 when rebasing.
- Keep it a refactor: no gameplay.

## Log
- 2026-11-17: Created as the first step of the backlog fan-out plan.
