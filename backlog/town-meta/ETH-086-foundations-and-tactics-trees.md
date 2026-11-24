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
Upgrade trees are either Foundations (permanent; respec keeps the 50% fee) or Tactics (free to redo between runs). Library picks, doctrine and class Mastery trees are Tactics. Guild Hall, Smithy, Cartographer, Temple, Ossuary and Tavern are Foundations.

## Why
Lets players experiment with builds between runs without wasting currency. Decided in Nate's interview answers (2026-11-18).

## Acceptance criteria
- [ ] Each tree definition has a `kind: foundations | tactics`
- [ ] Tactics trees can be reset or changed for free between runs, never during a run
- [ ] The Town UI shows which kind a tree is, with a tooltip
- [ ] Save migration for existing profiles
- [ ] Unit tests for free respec and for the fee on Foundations

## Notes
ETH-071 doctrine becomes a Tactics choice.

## Log
- 2026-11-18: Created from Nate's interview answers (2026-11-18).
- 2026-11-24: Priority P2 to P1 in the backlog reorganization by theme.
