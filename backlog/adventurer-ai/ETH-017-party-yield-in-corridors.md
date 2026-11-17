---
id: ETH-017
title: "Party members yield or swap places in narrow passages"
type: feature
status: done
priority: P2
milestone: M1
epic: adventurer-ai
size: S
depends_on: [ETH-009]
created: 2026-11-16
updated: 2026-11-17
---

## Summary
Let two party members heading opposite ways through a one-tile passage get past each other,
by swapping places or by one of them yielding, instead of both waiting until stuck detection fires.

## Why
Found while building ETH-009. Explore routes round other actors when it can (`OCCUPIED_COST`), but in
a corridor it can only wait for them. Stuck detection then drops the goal and both back off; when the
drop ends they can meet again in the same spot, which looks like the aimless wandering `CLAUDE.md`
§5.3 promises to avoid.

## Acceptance criteria
- [x] On a hand-built map, two adventurers exploring toward each other in a one-tile corridor get past each other without a `stuck` event
- [x] Monsters are never swapped with

## Notes
Options: a `swap` action for willing party members, or a deterministic yield rule (lower party index
steps aside into the nearest side tile). Formation doctrine (M3) may want a say.

## Log
- 2026-11-16: Created while building ETH-009.
- 2026-11-17: Started.
- 2026-11-17: (default) A core `swap` action for willing party members, not a yield rule. A member that
  wants an ally's tile swaps with them when the ally's last decision waited on it, or the ally has no
  decision yet or an idle one; a member busy heading elsewhere is waited behind. Only faction `party`
  swaps, so monsters never do. The alternative was a deterministic yield (the lower party index steps
  into the nearest side tile), which needs a side tile and costs both members turns. Formation
  doctrine (M3) can override either way.
- 2026-11-17: Note: two explorers sharing party memory can't meet head-on in a corridor (if each
  routes through the other, adding the two distance inequalities gives 2·d(A,B) < 0). The head-on case
  needs different goals, so the test pairs an explorer with a member following a goal-walking rule
  through the same `followMap`. `AiMemory.waitingFor` added; `STATE_VERSION` 5; invariant
  `core.aiMemory`; `swapped` event with log text. Done.
