---
id: ETH-138
title: "Themed dungeon: The Mycelial Warren"
type: content
status: idea
priority: P3
milestone: M6
epic: dungeon-gen
size: M
depends_on: [ETH-133, ETH-042]
created: 2026-11-23
updated: 2026-11-23
---

## Summary
Add *The Mycelial Warren* as an unlockable mid-high dungeon variant (around `depth: 8–13`, starting Danger ~4) featuring spore-lit root tunnels, fungal/burrower swarms, and status-heavy attrition (poison/dazzled clouds).

## Why
Provides a status-resistance and area/cleansing challenge built purely as data on top of `ETH-133`'s Danger and ecology schema (`docs/DIFFICULTY_PHILOSOPHY.md` §2 & §3.2).

## Acceptance criteria
- [ ] Clean-room `DungeonDef`, floor theme, and fungal/burrower bestiary entries with full `hint`, description, and Codex support (`ETH-091`)
- [ ] Balanced spore/status pressure tested against upgraded parties with `npm run check` passing

## Notes
- All names, descriptions, and monsters must be 100% original (clean-room, `CLAUDE.md` §9).

## Log
- 2026-11-23: Created as a future themed dungeon placeholder leveraging ETH-133's extensible Danger schema.
