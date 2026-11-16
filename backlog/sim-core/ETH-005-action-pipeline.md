---
id: ETH-005
title: "Action pipeline: move, wait and open door"
type: feature
status: done
priority: P0
milestone: M0
epic: sim-core
size: S
depends_on: [ETH-004]
created: 2026-11-16
updated: 2026-11-16
---

## Summary
The `ActionDef` registry with validate and execute, and the first three actions.

## Why
Actions are the only way the world changes, shared by AI, rules, monsters and possession. See `docs/ARCHITECTURE.md` §2.3.

## Acceptance criteria
- [x] An action request is validated before it runs; an invalid one returns a reason and changes nothing
- [x] Move respects walls, closed doors and occupied tiles, and emits `moved`
- [x] Open door changes the door feature and emits an event; wait only spends energy
- [x] Each action has an energy cost that the scheduler charges

## Notes
ETH-004 left a stand-in in `src/sim/actions.ts`: `ActionRequest` (wait only), `ACTION_COSTS`
and `performAction`, which the scheduler calls and charges. Replace its body with the registry,
and keep the rule that a request failing validation emits `actionFailed` and costs a wait, so a
bad decision can never stall the scheduler. `playerAction` commands check the action id with
`isActionId`; extend that check to the new actions' parameters.

**Decisions:**
- The definitions are a typed `ACTIONS` record rather than a `Registry`. Actions are code, and
  the record's type makes sure every request type has exactly one def.
- Doorways can only be entered or left orthogonally, as in classic roguelikes, which makes doors
  real chokepoints. Diagonal steps are otherwise allowed, including between two walls.
- Moving into a closed door is invalid rather than opening it. The AI opens the door first, and
  bump-to-open for possession can come with the possession controls.
- Log text for `moved`, `doorOpened` and `actionFailed` comes with the log templates (ETH-015 and
  ETH-012). Each action's Codex and tooltip text is its `name` and `description`.

## Log
- 2026-11-16: Created.
- 2026-11-16: Started.
- 2026-11-16: Done. `src/sim/actions.ts` now has `ACTIONS` (wait, move, open door), each with
  `parse`, `validate`, `execute` and a `cost`, plus `parseRequest`, `validateAction`,
  `performAction` and `stepBlocker`. `playerAction` commands parse their request into a clean
  copy, so a malformed direction is rejected. New events: `moved` and `doorOpened`.
  `ActorEntity` moved to `state.ts`. Recorded in ARCHITECTURE §2.3.
