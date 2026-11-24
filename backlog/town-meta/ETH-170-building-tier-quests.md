---
id: ETH-170
title: Building-tier quests open each building's next tier
type: feature
status: idea
priority: P2
milestone: M2
epic: town-meta
size: M
depends_on: [ETH-093, ETH-172]
created: 2026-11-24
updated: 2026-11-24
---

## Summary
Once 50% of all of a building's available nodes are bought (from any of its open tiers), a harder quest in that building's theme is offered. Completing it opens the building's next tier.

## Why
Nate (2026-11-24): buildings should grow in stages, each stage opened by a thematic and slightly harder quest (deeper dungeon, tougher foe). Higher tiers hold stronger nodes. See `CLAUDE.md` §4 (Building quests).

## Acceptance criteria
- [ ] Spec reviewed by Nate before building (spec gate); the quest list may be settled in the quests discussion
- [ ] Each building tier beyond the first has a tier quest in content, harder than the one before it
- [ ] The quest is offered once 50% of all the building's available nodes are bought, counting every open tier
- [ ] Tier quests are building quests: they use a contract slot and count toward the one-building-quest-per-run limit (ETH-093)
- [ ] Completing one opens the tier (ETH-172), with a run-summary line and a Town highlight

## Notes
Example: all of the Smithy's tier 1 bought and nothing in tier 2 still crosses 50% once tier 2 is open, so the tier 3 quest appears.

## Log
- 2026-11-24: Created from the progression discussion with Nate.
