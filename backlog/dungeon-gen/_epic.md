---
epic: dungeon-gen
title: Dungeon generation
status: active
milestones: [M0, M1.5, M2, M6, M8, later]
---

## Goal
Varied, always-connected floors built from reusable generation steps, linked into a dungeon with stairs and, later, forks.

## Scope
**In:**
- GenStep pipeline and step registry
- Floor types as data
- Dungeon graph, stairs, route forks
- Gravestone and altar placement

**Out (later or elsewhere):**
- Monster and item definitions (see `content`)

## Design refs
- `CLAUDE.md` §6: Floor variety and routing
- `docs/ARCHITECTURE.md` §3.6
- `docs/DIFFICULTY_PHILOSOPHY.md`

## Items
- [x] [ETH-006 Dungeon gen pipeline: rooms-and-corridors floor](ETH-006-dungeon-gen-pipeline.md)
- [ ] [ETH-046 Traps and searching](ETH-046-traps-searching.md)
- [ ] [ETH-049 Dungeon merchants](ETH-049-dungeon-merchants.md)
- [x] [ETH-072 Fountains with a documented effect table and a drink action](ETH-072-fountains.md)
- [ ] [ETH-098 Hand-made room vaults](ETH-098-hand-made-vaults.md)
- [ ] [ETH-102 A rival guild party in the dungeon](ETH-102-rival-guild.md)
- [ ] [ETH-107 Rare floor-wide dungeon events](ETH-107-dungeon-events.md)
- [ ] [ETH-116 Dungeon encounters: placed interactive features with an interact action, choices and outcomes](ETH-116-dungeon-encounters.md)
- [x] [ETH-133 Extensible Danger scale, innate monster Bundles, and variable hidden dungeon depth](ETH-133-extensible-danger-and-hidden-depth.md)
- [x] [ETH-135 Threat-budget room encounters, cohesive group engagement, and corridor patrols](ETH-135-density-encounters-groups-and-patrols.md)
- [ ] [ETH-137 Themed dungeon: The Drowned Cisterns](ETH-137-themed-dungeon-drowned-cisterns.md)
- [ ] [ETH-138 Themed dungeon: The Mycelial Warren](ETH-138-themed-dungeon-mycelial-warren.md)
- [ ] [ETH-139 Themed dungeon: The Ash Kilns](ETH-139-themed-dungeon-ash-kilns.md)
- [ ] [ETH-140 Themed dungeon: The Salt Catacombs](ETH-140-themed-dungeon-salt-catacombs.md)
