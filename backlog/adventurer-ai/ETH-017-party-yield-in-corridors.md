---
id: ETH-017
title: "Party members yield or swap places in narrow passages"
type: feature
status: idea
priority: P2
milestone: M1
epic: adventurer-ai
size: S
depends_on: [ETH-009]
created: 2026-11-16
updated: 2026-11-16
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
- [ ] On a hand-built map, two adventurers exploring toward each other in a one-tile corridor get past each other without a `stuck` event
- [ ] Monsters are never swapped with

## Notes
Options: a `swap` action for willing party members, or a deterministic yield rule (lower party index
steps aside into the nearest side tile). Formation doctrine (M3) may want a say.

## Log
- 2026-11-16: Created while building ETH-009.
