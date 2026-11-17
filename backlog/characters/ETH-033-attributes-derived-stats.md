---
id: ETH-033
title: Four attributes and the stats derived from them
type: feature
status: idea
priority: P1
milestone: M1
epic: characters
size: M
depends_on: [ETH-057]
created: 2026-11-17
updated: 2026-11-17
---

## Summary
Adds four attributes with original names (roughly might, agility, intellect and vitality) and derives HP, MP, accuracy, evasion, damage and carry capacity from them through the existing modifier system.

## Why
Classes, races, gear and leveling all need a shared stat base. See `CLAUDE.md` §5 and `docs/ARCHITECTURE.md` §2.2.

## Acceptance criteria
- [ ] Attribute and derived stat ids are defined once, with Codex and tooltip text
- [ ] Classes and races set base attributes in their definitions (replacing the flat HP/MP fields)
- [ ] `getStat` shows each derived stat's contributing modifiers in its tooltip
- [ ] Unit tests cover the derivation formulas

## Notes
- Pick the final attribute names when the item is made ready; they must be original (CLAUDE.md §9 clean-room).

## Log
- 2026-11-17: Created from a design discussion on quests, depth and extra features.
- 2026-11-17: Wired `depends_on` to the foundation items added in the fan-out plan.
