---
epic: dungeon-gen
title: Dungeon generation
status: active
milestones: [M0, M1, M4, M5, M6]
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

## Items
- [x] [ETH-006 Dungeon gen pipeline: rooms-and-corridors floor](ETH-006-dungeon-gen-pipeline.md)
- [ ] [ETH-046 Traps and searching](ETH-046-traps-searching.md)
- [ ] [ETH-049 Dungeon merchants](ETH-049-dungeon-merchants.md)
