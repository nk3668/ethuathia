---
id: ETH-066
title: Possess an adventurer and play them directly
type: feature
status: ready
priority: P2
milestone: M1
epic: ui-shell
size: M
depends_on: [ETH-058, ETH-060]
created: 2026-11-17
updated: 2026-11-17
---

## Summary
`possess` and `release` commands; while possessed, the adventurer waits for player input (move, attack by bumping, pick up, use, stairs) instead of running the AI.

## Why
See `CLAUDE.md` §5.4 and `docs/ARCHITECTURE.md` §4 (possession input is first in the decision order).

## Acceptance criteria
- [ ] `possess`/`release` commands in the sim; a possessed actor is skipped by the AI and the step waits for a `playerAction` (the paced runner holds while input is pending)
- [ ] Keys: `P` possess/release the selected adventurer, double-click on the map possesses, WASD/arrows/numpad move or bump-attack, `g` pick up, `>`/`<` stairs
- [ ] The party card and top bar show who is possessed; the trace shows "player" as the rule source
- [ ] Possession survives serialize; releasing hands control back to the AI the same turn
- [ ] Sim tests for possess, input, release; a component test for the keys

## Log
- 2026-11-17: Created as part of the backlog fan-out plan.
