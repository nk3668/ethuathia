---
id: ETH-146
title: Composition and rules balance pass (M4 capstone)
type: chore
status: idea
priority: P2
milestone: M4
epic: tools-balance
size: M
depends_on: [ETH-080]
created: 2026-11-23
updated: 2026-11-24
---

## Summary
Once several classes with distinct roles and the rules editor exist, check that party composition
and behavior rules spread outcomes as `docs/DIFFICULTY_PHILOSOPHY.md` §2 describes.

## Why
ETH-080 originally asked for a spread between naive mono-melee stacks (~35–40%) and composed
parties with matching rules (~55–65%). Only the Vanguard class exists in M1.5 and the rules editor
arrives in M3, so that target can't be measured until then. This item carries it forward and doubles
as M3's milestone balance check (§9.1).

## Acceptance criteria
- [ ] The harness can build mixed-class parties and attach rule presets per adventurer.
- [ ] Progressed 4-party sweeps (200 seeds): mono-melee with baseline rules ~35–40% victory; a
      frontline + ranged/support party with a matching preset ~55–65%.
- [ ] The party-size ordering from ETH-145 still holds.
- [ ] Principle 8: each class makes at least one mixed party stronger than the same-size Vanguard party, and no single composition is best in every dungeon (Principle 13).
- [ ] Before/after tables in the PR, with `npm run check` passing.

## Notes
- Fill in the class list and presets when M3 starts and promote this item to `ready`.

## Log
- 2026-11-23: Created. Composition-spread criterion moved here from ETH-080.
- 2026-11-24: Moved from M3 to M4 in the backlog reorganization by theme.
