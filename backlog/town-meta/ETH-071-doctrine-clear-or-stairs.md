---
id: ETH-071
title: Guild Hall doctrine: prioritize clearing floors or prioritize the stairs
type: feature
status: ready
priority: P2
milestone: M2
epic: town-meta
size: S
depends_on: [ETH-058, ETH-063, ETH-064]
created: 2026-11-18
updated: 2026-11-18
---

## Summary
A pick-one Guild Hall tier lets the player choose how the party treats each floor: clear it fully before descending, or head down once the stairs are known.

## Why
The player asked (2026-11-18) that full exploration vs. stairs-first be the player's choice rather than fixed AI behavior. See `CLAUDE.md` §1 (Idle decisions matter), §5.2 (doctrine).

## Acceptance criteria
- [ ] Doctrine defs `doctrine.clear_floors` and `doctrine.seek_stairs` (content kind from ETH-063), unlocked by a pick-one Guild Hall tier
- [ ] The chosen doctrine reaches the run through `buildRunConfig` and the AI context; the baseline descend logic reads it (seek stairs: descend once the stairs are known and a minimum share of the floor is explored)
- [ ] With neither unlocked, the current behavior (clear floors) is the default
- [ ] The trace names the doctrine when it decides to descend; tooltips and Codex text
- [ ] Hand-map sim tests for both doctrines; sim compare shows turns per floor for each

## Log
- 2026-11-18: Created from the player's answer to the ETH-058 question.
