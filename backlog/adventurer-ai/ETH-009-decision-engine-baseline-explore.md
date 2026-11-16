---
id: ETH-009
title: "Decision engine with baseline exploration, trace and stuck detection"
type: feature
status: done
priority: P0
milestone: M0
epic: adventurer-ai
size: M
depends_on: [ETH-005, ETH-007, ETH-008]
created: 2026-11-16
updated: 2026-11-16
---

## Summary
The rule-walking decision engine, the condition and rule-action registries, and the first baseline rules: explore the frontier, open doors, and get unstuck.

## Why
Competent exploration with zero player rules is the answer to Roguathia's main complaint, and the same engine later runs player rules and monsters. See `docs/ARCHITECTURE.md` §4 and `CLAUDE.md` §5.3.

## Acceptance criteria
- [x] The engine takes the first enabled rule whose condition is true and whose action resolves, and emits `ruleFired` with a readable reason
- [x] On generated floors across 100 seeds, a lone adventurer explores every reachable tile and stops, within a turn cap
- [x] On a hand-built map with dead ends, no explored dead end is entered twice
- [x] If position and explored percentage are unchanged for N turns, the goal changes and an event is logged
- [x] Baseline behaviors are registered as ordinary rule actions, not special cases

## Notes
Fixed seed and hand-built maps for behavior tests, per `CLAUDE.md` conventions. Combat and flee rules arrive in M1.

The engine plugs into the scheduler as a `Decide` function (`src/sim/step.ts`); make it the
default in place of `waitDecide`. `DecideCtx.emit` is how it records `ruleFired`.

## Log
- 2026-11-16: Created.
- 2026-11-16: Started.
- 2026-11-16: Done. Engine, registries and baseline rules in `src/sim/ai/`, now the default `Decide`; tests in `test/sim/ai.test.ts`. Seeds 1–100 finish exploring in at most about 280 party turns (cap 600). `STATE_VERSION` is 3 for the new `ai` part. Corridor deadlocks between party members became ETH-017.
