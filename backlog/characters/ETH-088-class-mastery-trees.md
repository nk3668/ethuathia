---
id: ETH-088
title: Talent tree engine: three trees per class and a build per adventurer
type: feature
status: idea
priority: P2
milestone: M4
epic: characters
size: M
depends_on: [ETH-087, ETH-037, ETH-086]
created: 2026-11-18
updated: 2026-11-24
---

## Summary
The capability for class talents: each class has three named trees, every adventurer of that class spends the full Mastery point budget on their own build, and builds are free to redo between runs. This item builds the engine and its UI; populating each class's talents is separate work.

## Why
Lets two adventurers of the same class play differently (e.g. a damage Vanguard and a tank Vanguard). Decided with Nate on 2026-11-24. See `CLAUDE.md` §4 (Class Mastery and talents).

## Acceptance criteria
- [ ] Spec reviewed by Nate before building (spec gate), including a sample Vanguard with three class-themed trees for review
- [ ] Talent nodes are content: skills and bonuses (starting level, damage, mitigation, starting weapon, ...); nodes can have several ranks
- [ ] Mixing trees is allowed; deeper nodes need a number of points already spent in that tree; each tree ends in a capstone
- [ ] Each adventurer record stores its build, with a migration; random recruits get the class's default build
- [ ] Named builds can be saved and applied on the Prepare screen; rebuilding is free between runs and never possible during one
- [ ] Points beyond the full trees go into small repeatable bonuses
- [ ] Every node has Codex and tooltip text
- [ ] Talent trees are opened through the town (Nate, 2026-11-24: they belong in the building trees too): a Guild Hall Tier III node, *Training Grounds*, opens them. Mastery XP banks before then, and the points wait.

## Notes
Open, settle in the spec: about 40 points per tree or 40 across all three (Nate, 2026-11-24). Simple classes may have fewer, bigger nodes; complex classes more, smaller ones.

## Log
- 2026-11-18: Created from Nate's interview answers (2026-11-18).
- 2026-11-24: Moved from M3 to M4 in the backlog reorganization by theme.
- 2026-11-24: Rewritten from the progression discussion with Nate: three trees per class, a full budget per adventurer, ranks, capstones, free rebuilds. Engine first; talents populated later.
