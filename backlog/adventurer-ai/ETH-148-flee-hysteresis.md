---
id: ETH-148
title: Flee with hysteresis so a hurt adventurer doesn't return to exploring while chased
type: bug
status: idea
priority: P2
milestone: M1.6
epic: adventurer-ai
size: S
depends_on: [ETH-145]
created: 2026-11-24
updated: 2026-11-24
---

## Summary
Flee is decided from this turn's HP alone, so an adventurer hovering around the threshold flips
between fleeing and `act.explore` while monsters are still chasing. Keep fleeing until a recovery
condition holds.

## Why
ETH-145 diagnosis (seed 4, progressed party of 4): Tamsin fled alone, then went back to `act.explore`
at 33% HP with a clinker automaton and a fetid stalker still on her trail, and died. `CLAUDE.md` §5.3
says the baseline flees at very low HP when an escape route exists; flip-flopping wastes the escape.

## Acceptance criteria
- [ ] Once fleeing starts, the adventurer keeps fleeing (or regrouping, per ETH-145) until HP is back
      above a higher release threshold **or** no pursuer has been visible for N turns. Both are shared
      constants.
- [ ] The trace says why fleeing continues ("still fleeing: a fetid stalker is in pursuit, HP 33%").
- [ ] Sim test, fixed seed and hand-built map: a pursued adventurer at the threshold does not return to
      exploring until the release condition holds; one with no pursuer releases normally.
- [ ] `npm run sim` before/after for party 1 and 4 in the PR; the party-size ordering (ETH-145 check)
      still holds. `npm run check` passes.

## Notes
- Needs a little per-actor AI memory (a "fleeing since" marker); keep it serializable.
- Found by the ETH-145 agent (out-of-scope list).

## Log
- 2026-11-24: Created from the ETH-145 diagnosis (Nate approved filing).
