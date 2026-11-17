---
id: ETH-054
title: Food as consumables that grant short-term buffs
type: feature
status: idea
priority: P2
milestone: M2
epic: combat-items
size: M
depends_on: [ETH-043]
created: 2026-11-17
updated: 2026-11-17
---

## Summary
Food items found in the dungeon (or bought in town) that grant a short-term buff when eaten, such as faster regeneration, extra damage or resistance. There is **no hunger meter and no starvation**: food is always optional.

## Why
Adds a small, readable consumable layer without the chore of managing hunger. See `CLAUDE.md` §5.3 (Inventory) and §6 (Omens: Ravenous).

## Acceptance criteria
- [ ] Food defs in `src/content/` with a buff (a bundle of modifiers) and a duration in turns, validated at load time
- [ ] Eating applies a timed status, shown on the party card with a tooltip and remaining turns; eating logs a message
- [ ] Adventurers never take a penalty for not eating
- [ ] A rule action `eat best food` and a baseline behavior (eat before a known fight, e.g. a mini-boss or a unique in sight)
- [ ] Codex entries for each food

## Notes
- Buffs use the existing modifier and trigger bundles (`docs/ARCHITECTURE.md` §2.2), the same as other statuses.
- Open question: do food buffs stack, or does a new one replace the old one? Default proposal: one food buff per adventurer, and a new one replaces it.
- The Ravenous Omen is redefined around food buffs in ETH-053.

## Log
- 2026-11-17: Created. The player wants food only for short-term buffs, with no hunger or starvation.
