---
id: ETH-086
title: Split upgrade trees into permanent Foundations and free Tactics
type: feature
status: ready
priority: P1
milestone: M2
epic: town-meta
size: M
depends_on: [ETH-063]
created: 2026-11-18
updated: 2026-11-24
---

## Summary
Upgrade trees are either Foundations or Tactics. Both can be redone between runs, never during one. There is no respec fee for now (Nate, 2026-11-24); Foundations keep the hook so a fee can return later, and Tactics trees (including the class talent trees) are always free. Library picks, doctrine and class Mastery trees are Tactics. Guild Hall, Smithy, Cartographer, Temple, Ossuary and Tavern are Foundations.

## Why
Lets players experiment with builds between runs without wasting currency. Decided in Nate's interview answers (2026-11-18).

## Acceptance criteria
- [ ] Each tree definition has a `kind: foundations | tactics`
- [ ] Every tree can be reset or changed between runs, never during a run
- [ ] The Foundations respec fee is one tunable constant, set to 0; Tactics trees have no fee at all
- [ ] The Town UI shows which kind a tree is, with a tooltip
- [ ] Save migration for existing profiles
- [ ] Unit tests for free respec on both kinds, and for a nonzero Foundations fee when the constant is changed

## Notes
ETH-071 doctrine becomes a Tactics choice.

## Log
- 2026-11-18: Created from Nate's interview answers (2026-11-18).
- 2026-11-24: Priority P2 to P1 in the backlog reorganization by theme.
- 2026-11-24: Progression discussion with Nate: no respec fee for now. Foundations fee becomes a constant set to 0. Still ready.
