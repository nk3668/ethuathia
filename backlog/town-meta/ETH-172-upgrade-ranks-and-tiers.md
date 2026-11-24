---
id: ETH-172
title: Upgrade engine supports ranked nodes and quest-locked tiers
type: feature
status: idea
priority: P1
milestone: M2
epic: town-meta
size: M
depends_on: [ETH-063, ETH-086]
created: 2026-11-24
updated: 2026-11-24
---

## Summary
Extend the upgrade engine so a node can be bought several times (ranks, each with its own cost and effect), and so a building's higher tiers stay locked until that tier's quest is completed.

## Why
Nate (2026-11-24) wants deeper, slower trees where every run can buy something, ranked numeric nodes (e.g. Hardy Recruits I–V), and building tiers opened by quests. The talent trees (ETH-088) also use ranks. See `CLAUDE.md` §4.

## Acceptance criteria
- [ ] Spec reviewed by Nate before building (spec gate)
- [ ] An upgrade def can declare ranks; each rank has a cost and its grants; the profile stores the rank bought, with a migration
- [ ] A building's tiers can be locked behind a requirement (ETH-121), which tier quests (ETH-170) satisfy
- [ ] The Town UI shows ranks (e.g. 2/5) and locked tiers with what they need
- [ ] Respec refunds every rank bought (ETH-086)
- [ ] Tests: buying ranks, rank cost growth, a locked tier, respec refunds

## Log
- 2026-11-24: Created from the progression discussion with Nate.
