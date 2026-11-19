---
id: ETH-066
title: Possess an adventurer and play them directly
type: feature
status: done
priority: P2
milestone: M1
epic: ui-shell
size: M
depends_on: [ETH-058, ETH-060]
created: 2026-11-17
updated: 2026-11-19
---

## Summary
`possess` and `release` commands; while possessed, the adventurer waits for player input (move, attack by bumping, pick up, use, stairs) instead of running the AI.

## Why
See `CLAUDE.md` §5.4 and `docs/ARCHITECTURE.md` §4 (possession input is first in the decision order).

## Acceptance criteria
- [x] `possess`/`release` commands in the sim; a possessed actor is skipped by the AI and the step waits for a `playerAction` (the paced runner holds while input is pending)
- [x] Keys: `P` possess/release the selected adventurer, double-click on the map possesses, WASD/arrows/numpad move or bump-attack, `g` pick up, `>`/`<` stairs
- [x] The party card and top bar show who is possessed; the trace shows "player" as the rule source
- [x] Possession survives serialize; releasing hands control back to the AI the same turn
- [x] Sim tests for possess, input, release; a component test for the keys

## Log
- 2026-11-17: Created as part of the backlog fan-out plan.
- 2026-11-18: While possessed, Q/E/Z/C are diagonals with WASD, and `[`/`]` still cycle adventurers (ETH-090).
- 2026-11-19: Started.
- 2026-11-19: Done. `possess`/`release` commands and `AiPart.possessed`; the step holds at a possessed adventurer's turn until a `playerAction`, and the paced runner answers one at once. Movement keys send a new core `bump` action (attack, open door, swap or move). Keys G, `>`/`<`, F (fountain underfoot), `.`/X/numpad 5 (wait); Equip, Take off and Use buttons in the pack. Card banner, Possess/Release button, top-bar badge, `player` trace. STATE_VERSION 19.
- (default) A command for the possessed adventurer runs at once even while paused, and the world advances until their next turn — alternative: honor the pause/speed setting and step at the paced rate.
- (default) Possessing a second adventurer releases the first: one at a time — alternative: allow several, each holding the run in turn.
- (default) F drinks from the fountain the adventurer stands on (the sim's `drink` needs that); bumping into a fountain tile just steps onto it — alternative: drink from an adjacent fountain without stepping on it (a sim change to `drink`).
- (default) Wait is `.`, X and numpad 5; a player action on an un-possessed member (a raw `playerAction`) is also traced as `player`.
