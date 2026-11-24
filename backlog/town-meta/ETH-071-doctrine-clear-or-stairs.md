---
id: ETH-071
title: Guild Hall doctrine: prioritize clearing floors or prioritize the stairs
type: feature
status: ready
priority: P2
milestone: M3
epic: town-meta
size: S
depends_on: [ETH-058, ETH-063, ETH-064, ETH-115]
created: 2026-11-18
updated: 2026-11-24
---

## Summary
A pick-one Guild Hall tier lets the player choose how the party treats each floor: clear it fully before descending, or head down once the stairs are known.

## Why
The player asked (2026-11-18) that full exploration vs. stairs-first be the player's choice rather than fixed AI behavior. See `CLAUDE.md` §1 (Idle decisions matter), §5.2 (doctrine).

## Acceptance criteria
- [ ] Doctrine defs `doctrine.clear_floors` and `doctrine.seek_stairs` (content kind from ETH-063), unlocked by a Library node (ETH-163; Nate, 2026-11-24: doctrines are unlocked through the building trees, and the town-tree layout puts them in the Library)
- [ ] The chosen doctrine reaches the run through `buildRunConfig` and the AI context; the baseline descend logic reads it (seek stairs: descend once the stairs are known and a minimum share of the floor is explored)
- [ ] With neither unlocked, the current behavior (clear floors) is the default
- [ ] The trace names the doctrine when it decides to descend; tooltips and Codex text
- [ ] Hand-map sim tests for both doctrines; sim compare shows turns per floor for each

## Log
- 2026-11-18: Created from the player's answer to the ETH-058 question.
- 2026-11-18: Doctrine becomes a free-to-redo Tactics choice (ETH-086).
- 2026-11-19: Added ETH-115 (run-wide modifiers) to `depends_on`: build on the shared system instead of a parallel version.
- 2026-11-24: Moved from M2 to M3 in the backlog reorganization by theme.
- 2026-11-24: Nate: doctrines are unlocked through building trees; the unlock moves from a Guild Hall tier to a Library node (ETH-163).
