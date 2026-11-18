---
id: ETH-060
title: Monsters, melee combat and death
type: feature
status: done
priority: P0
milestone: M1
epic: combat-items
size: M
depends_on: [ETH-057]
created: 2026-11-17
updated: 2026-11-18
---

## Summary
Monster definitions, monster spawning per floor, an `attack` action resolved through stats, death, and monsters acting through the same decision engine as adventurers.

## Why
Combat is the core of a run, and kills feed Trophies, XP, bounties and contracts. See `CLAUDE.md` §5.1, §5.3.

## Acceptance criteria
- [x] Monster content defs (glyph, stats base, rule set, depth range, spawn weight, threat value), validated; 6+ original starter monsters
- [x] A gen step spawns monsters by depth with the dungeon RNG stream, away from the arrival stairs
- [x] `attack` action: hit = accuracy vs evasion, damage − armor, using `getStat` and the combat RNG stream; events `attacked`, `missed`, `died`, `killed` (with killer and victim) and log text
- [x] Dead actors leave the schedule and the floor (a corpse is not an item); a whole-party death sets a wipe flag the run-end item reads
- [x] Monsters run `ruleDecide` with their def's rule set (approach + attack visible party members; wander otherwise). Baseline adventurer rules: attack adjacent, flee at very low HP when an escape route exists
- [x] Snapshot `ActorView` carries name, hp and maxHp for visible actors; the map colors monsters from their glyph def
- [x] Hand-map sim tests: fight to the death, flee, monster pathing; soak and sim compare report kills and deaths

## Log
- 2026-11-17: Created as part of the backlog fan-out plan.
- 2026-11-18: Done. Seven monsters, `gen.monsters`, the `attack` action, monster AI on the shared
  engine, baseline flee and attack, `ActorView` name/hp/maxHp, a monster Codex view and kill
  Trophies. Party deaths go through ETH-062's `fell` and wipe; fallen adventurers stay in the
  state at 0 HP without taking up a tile. Adventurer damage comes from attributes (ETH-033):
  blows roll 1-3 plus the `damage` stat. `npm run sim -- --seeds 50`: 43 of 50 reach the bottom,
  11 wipes (22%), 28.7 kills per run; soak and compare report kills and deaths (compare also
  fountain drinks).
