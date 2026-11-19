---
epic: behavior-rules
title: Behavior rules
status: active
milestones: [M2, M3]
---

## Goal
The player shapes how adventurers act by ordering if-then rules, and can see which rule fired and why.

## Scope
**In:**
- Condition and rule-action vocabulary
- Rules editor
- Presets and party doctrine
- Library upgrade tree
- AI trace in the log and on party cards

**Out (later or elsewhere):**
- The engine that evaluates rules (see `adventurer-ai`)

## Design refs
- `CLAUDE.md` §5.2: Behavior rules
- `docs/ARCHITECTURE.md` §4
- `docs/VISUAL-DESIGN.md` §5.1

## Items
- [ ] [ETH-121 Shared conditions: run-scope conditions and a Requirement type usable outside rules](ETH-121-shared-conditions-requirements.md)
