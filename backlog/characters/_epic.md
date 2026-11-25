---
epic: characters
title: Characters: attributes, classes and races
status: active
milestones: [M1, M2, M4, M7]
---

## Goal
Adventurers have attributes, grow by class when they level, have race aptitudes and class equipment proficiencies, and play to their class.

## Scope
**In:**
- Attributes and derived stats
- XP and leveling
- Proficiencies and aptitudes
- Class and race unlocks
- Class abilities and class-aware AI

**Out (later or elsewhere):**
- Roster and lineage (see `lineage`)
- Items themselves (see `combat-items`)

## Design refs
- `CLAUDE.md` §4: Guild Hall
- `CLAUDE.md` §5: The idle player
- `docs/ARCHITECTURE.md` §2.2: Modifiers
- `docs/ROGUELIKE-SURVEY.md`: clean-room ideas from other roguelikes

## Class and race roster plan (placeholders)
Nate (2026-11-24): leave room in the town trees for future classes and races; no reveal rules for the future ones yet. Each is trained or admitted by one building, picked by theme. Names and themes are placeholders.

| Class or race | Kind | Building | Status |
|---|---|---|---|
| Vanguard | class | — (start) | built |
| Outrider | class | Guild Hall | built (ETH-160), sold in town (ETH-036) |
| Lorekeeper | class | Guild Hall | built (ETH-160), sold in town (ETH-036) |
| Reaver | class | Smithy | built (ETH-160), sold in town (ETH-036) |
| Tinker (traps and gadgets) | class | Smithy | placeholder |
| Hexer (curses) | class | Library | placeholder |
| Mender (healer, can raise the fallen) | class | Temple | placeholder (ETH-173) |
| Wayfinder (ranged tracker) | class | Cartographer | placeholder |
| Gravecaller (calls on the dead) | class | Ossuary | placeholder |
| Chanter (party buffs) | class | Tavern | placeholder |
| Human | race | — (start) | built |
| Fenling | race | Guild Hall | built (ETH-160), sold in town (ETH-036) |
| Stonekin | race | Smithy | built (ETH-160), sold in town (ETH-036) |
| Ashborn (fire-touched) | race | Temple | placeholder |
| Tidefolk (flooded floors) | race | Cartographer | placeholder |
| Woodland race (consumes the fallen) | race | Ossuary | placeholder (ETH-179) |

## Items
- [x] [ETH-033 Four attributes and the stats derived from them](ETH-033-attributes-derived-stats.md)
- [x] [ETH-034 XP, leveling and per-class attribute growth](ETH-034-xp-leveling-class-growth.md)
- [ ] [ETH-035 Class equipment proficiencies and race aptitudes](ETH-035-proficiencies-aptitudes.md)
- [x] [ETH-036 Milestone-gated class and race unlocks bought at the Guild Hall](ETH-036-milestone-unlocks-guild-hall.md)
- [ ] [ETH-037 A signature ability per class](ETH-037-class-signature-abilities.md)
- [ ] [ETH-038 Class-aware AI roles](ETH-038-class-aware-ai-roles.md)
- [x] [ETH-039 Survey ideas from DCSS and NetHack with clean-room notes](ETH-039-survey-roguelike-ideas.md)
- [x] [ETH-081 Give each attribute a second job](ETH-081-attribute-secondary-jobs.md)
- [x] [ETH-087 Class Mastery XP: every run banks XP toward a guild-wide level per class](ETH-087-class-mastery-levels.md)
- [ ] [ETH-088 Talent tree engine: three trees per class and a build per adventurer](ETH-088-class-mastery-trees.md)
- [ ] [ETH-104 Personality quirks](ETH-104-personality-quirks.md)
- [x] [ETH-110 Rolled growth, shared kill XP and uncapped levels](ETH-110-leveling-followup.md)
- [x] [ETH-160 Starter set of unlockable classes and races](ETH-160-starter-classes-and-races.md)
- [x] [ETH-176 Classes start each run with a kit of gear](ETH-176-class-starting-kits.md)
- [x] [ETH-177 Reprice Finesse so classes can share one point budget](ETH-177-reprice-finesse.md)
- [ ] [ETH-179 A woodland race that heals by consuming the fallen but can't drink healing potions](ETH-179-corpse-eating-race.md)
- [ ] [ETH-182 Revisit attributes and derived stats, starting with Grit](ETH-182-attribute-stat-revisit.md)
- [ ] [ETH-184 Run-scope kill and identify counts, so the Reaver and Lorekeeper get their intended reveals](ETH-184-kill-identify-reveal-conditions.md)
- [ ] [ETH-173 A class that can resurrect a fallen party member during a run](ETH-173-resurrection-class.md)
