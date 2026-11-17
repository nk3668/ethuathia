---
id: ETH-060
title: Monsters, melee combat and death
type: feature
status: ready
priority: P0
milestone: M1
epic: combat-items
size: M
depends_on: [ETH-057]
created: 2026-11-17
updated: 2026-11-17
---

## Summary
Monster definitions, monster spawning per floor, an `attack` action resolved through stats, death, and monsters acting through the same decision engine as adventurers.

## Why
Combat is the core of a run, and kills feed Trophies, XP, bounties and contracts. See `CLAUDE.md` §5.1, §5.3.

## Acceptance criteria
- [ ] Monster content defs (glyph, stats base, rule set, depth range, spawn weight, threat value), validated; 6+ original starter monsters
- [ ] A gen step spawns monsters by depth with the dungeon RNG stream, away from the arrival stairs
- [ ] `attack` action: hit = accuracy vs evasion, damage − armor, using `getStat` and the combat RNG stream; events `attacked`, `missed`, `died`, `killed` (with killer and victim) and log text
- [ ] Dead actors leave the schedule and the floor (a corpse is not an item); a whole-party death sets a wipe flag the run-end item reads
- [ ] Monsters run `ruleDecide` with their def's rule set (approach + attack visible party members; wander otherwise). Baseline adventurer rules: attack adjacent, flee at very low HP when an escape route exists
- [ ] Snapshot `ActorView` carries name, hp and maxHp for visible actors; the map colors monsters from their glyph def
- [ ] Hand-map sim tests: fight to the death, flee, monster pathing; soak and sim compare report kills and deaths

## Log
- 2026-11-17: Created as part of the backlog fan-out plan.
