---
id: ETH-159
title: Smithy upgrade tree spent in Trophies
type: feature
status: idea
priority: P1
milestone: M2
epic: town-meta
size: M
depends_on: [ETH-063, ETH-086, ETH-043, ETH-044]
created: 2026-11-24
updated: 2026-11-24
---

## Summary
Give the Smithy its tree: starting gear kits, a starting enchantment, and identification knowledge, all paid in Trophies.

## Why
Trophies have no sink today: the Smithy is a locked placeholder building (`src/content/town/smithy.ts`). The meta loop needs every currency to buy something. See `CLAUDE.md` §3 and §4.

## Acceptance criteria
- [ ] The Smithy tree has at least two pick-one tiers, and each numeric node shares its tier with a capability node (`CLAUDE.md` §4)
- [ ] Gear-kit nodes change the starting equipment of new runs
- [ ] An identification-knowledge node starts runs with some item types already known
- [ ] The Smithy is a Foundation tree (ETH-086)
- [ ] Every node has a tooltip and Codex text

## Notes
Needs decomposing before work starts. It may split into the tree data plus the starting-loadout plumbing that the Prepare screen's loadout step (`CLAUDE.md` §2, step 2) will also use.

## Log
- 2026-11-24: Created in the backlog reorganization by theme (gap: Trophies had no sink).
