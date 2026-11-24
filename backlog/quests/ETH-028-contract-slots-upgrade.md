---
id: ETH-028
title: Contract slots as a Guild Hall upgrade
type: feature
status: idea
priority: P2
milestone: M6
epic: quests
size: S
depends_on: [ETH-024, ETH-063, ETH-064]
created: 2026-11-17
updated: 2026-11-24
---

## Summary
The player starts with one contract slot; Guild Hall nodes add more. The Prepare screen lets the player pick a contract for each slot.

## Why
Taking more contracts is a risk the player chooses, paid with more rewards. See `CLAUDE.md` §4 and §6 (Quests).

## Acceptance criteria
- [ ] Guild Hall tree has contract-slot nodes with costs and tooltips
- [ ] Prepare shows one picker per unlocked slot; the same contract cannot be picked twice
- [ ] Tooltip on the slots explains that Victory needs every selected contract

## Notes
- None yet.

## Log
- 2026-11-17: Created from a design discussion on quests, depth and extra features.
- 2026-11-17: Wired `depends_on` to the foundation items added in the fan-out plan.
- 2026-11-24: Moved from M2 to M6 in the backlog reorganization by theme.
