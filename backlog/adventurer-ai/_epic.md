---
epic: adventurer-ai
title: Decision engine and baseline AI
status: active
milestones: [M0, M1, M1.6, M4]
---

## Goal
Adventurers that explore, fight and survive competently with zero player rules, and explain every decision.

## Scope
**In:**
- Decision engine shared by adventurers and monsters
- Baseline rule set: explore, fight, flee, leave floor, inventory
- Stuck detection
- Decision trace events

**Out (later or elsewhere):**
- Player-editable rules and the editor (see `behavior-rules`)

## Design refs
- `CLAUDE.md` §5.3: Baseline behavior
- `docs/ARCHITECTURE.md` §4

## Items
- [x] [ETH-009 Decision engine with baseline exploration, trace and stuck detection](ETH-009-decision-engine-baseline-explore.md)
- [x] [ETH-017 Party members yield or swap places in narrow passages](ETH-017-party-yield-in-corridors.md)
- [x] [ETH-094 The AI avoids fountain draughts known to be harmful](ETH-094-fountain-avoid-harmful.md)
- [ ] [ETH-148 Smarter fleeing: hysteresis, only from real threats, and no walking back into danger](ETH-148-flee-hysteresis.md)
