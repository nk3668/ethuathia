---
id: ETH-140
title: "Themed dungeon: The Salt Catacombs"
type: content
status: idea
priority: P3
milestone: M8
epic: dungeon-gen
size: M
depends_on: [ETH-133, ETH-042]
created: 2026-11-23
updated: 2026-11-24
---

## Summary
Add *The Salt Catacombs* as a late-game dungeon variant (around `depth: 10–15`, starting Danger ~8) through crystalline burial galleries populated by undead/wraith warbands, hexing supports, cursed treasure, and relentless return-trip hunters.

## Why
Offers an end-game challenge calibrated for full 4-member companies, Town unlocks, and Omen multipliers (`docs/DIFFICULTY_PHILOSOPHY.md` §2 & §3.2).

## Acceptance criteria
- [ ] Clean-room `DungeonDef`, catacomb floor theme, and undead/wraith bestiary entries with full `hint`, description, and Codex support (`ETH-091`)
- [ ] Late-game Danger curve (`8+`) and intense ascent surge verified with `npm run sim` and `npm run check`

## Notes
- All names, descriptions, and monsters must be 100% original (clean-room, `CLAUDE.md` §9).

## Log
- 2026-11-23: Created as a future themed dungeon placeholder leveraging ETH-133's extensible Danger schema.
- 2026-11-24: Moved from M6 to M8 in the backlog reorganization by theme.
