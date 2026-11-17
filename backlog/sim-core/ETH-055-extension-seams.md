---
id: ETH-055
title: Extension seams so feature work lands in per-domain files
type: chore
status: done
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
- [x] `src/sim/{stats,floors,combat,items,quests,run}/` each have an `index.ts` exporting a (possibly empty) event union, action record, state-slice type with an `init*` function, and snapshot-slice type. The root `SimEventBody`, `ACTIONS`, `RunState` and `Snapshot` only compose them, and `ACTIONS` stays exhaustive at compile time
- [x] `ui/shell/text.ts` becomes a mapped record of per-event formatters, built from `ui/shell/logText/<domain>.ts` files; a missing formatter is a type error
- [x] Placeholder content kinds (monster, item, contract, bounty, omen, deity) are registered in `CONTENT_KINDS` with schemas and no defs
- [x] A `StatId` union (`hp, mp, accuracy, evasion, damage, armor, speed, sight, carry`) is defined in `src/sim/stats/` for ETH-057 to build on
- [x] `docs/ARCHITECTURE.md` gets a **Contracts** section: domain module layout, stat ids, reward flow (events → `RunTracker` → `rewards.atRisk` → `applyRunResult`), state-version bump rule, log-text rule, where new rule conditions/actions go
- [x] Behavior is unchanged: the determinism test and `npm run sim` hashes are unchanged except for the version bump

## Notes
- State-version rule: any PR that changes `RunState` shape bumps `STATE_VERSION` to (version on main) + 1 when rebasing.
- Keep it a refactor: no gameplay.

## Log
- 2026-11-17: Created as the first step of the backlog fan-out plan.
- 2026-11-17: Started. Domain modules, composition hub, log-text records, placeholder content kinds and the Contracts section.
- 2026-11-17: Done. Six domain folders plus a "core" domain (`coreEvents/coreActions/coreCommands.ts`); `DomainTypes` table and `domains.ts` hub compose events, actions, commands, `RunState.domains`, `Snapshot.domains`, entity parts, config fields, registries and run trackers. Log text split into `ui/shell/logText/<domain>.ts`. Six placeholder content kinds. `StatId` in `src/sim/stats`. Run domain holds `rewards.atRisk` with an example invariant. `run.ts` renamed `createRun.ts` (it clashed with the `run/` domain folder). `STATE_VERSION` 3 → 4. Sim compare: identical metrics; hashes differ only from the state shape (re-hashing with `domains` removed and version 3 reproduces main's hashes for seeds 1–20).
- (default) Domain slices live under `RunState.domains.<key>` rather than as top-level fields — alternatives: top-level keys per domain (collides with core `floors`, and later possibly `party`).
- (default) Commands also got per-domain records (`CommandRecord`), like actions — alternative: keep the single `switch` in `commands.ts`.
