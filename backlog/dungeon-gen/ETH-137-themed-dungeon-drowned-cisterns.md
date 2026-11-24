---
id: ETH-137
title: "Themed dungeon: The Drowned Cisterns"
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
Add *The Drowned Cisterns* as an unlockable mid-tier dungeon variant (around `depth: 8–12`, starting Danger ~3) featuring flooded stonework halls and an aquatic/ooze/vermin monster ecology.

## Why
Uses `ETH-133`'s extensible Danger scale and `DungeonDef` difficulty/ecology profile so players who outgrow *The Old Delve* can graduate to new biomes with distinct tactical hazards (`docs/DIFFICULTY_PHILOSOPHY.md` §2 & §3.2).

## Acceptance criteria
- [ ] Clean-room `DungeonDef`, floor theme, and aquatic/ooze bestiary additions with full `hint`, description, and Codex support (`ETH-091`)
- [ ] Unlockable via Cartographer/quest progression with tuned Danger curve, ecology weights, and `npm run check` passing

## Notes
- Reachability (ETH-143): the check counts only a dungeon's own floors, not return-trip `depthShift` or out-of-depth boosts. With a second dungeon, decide whether those paths should count, so a monster reachable only through them is not flagged (or is, deliberately).
- All names, descriptions, and monsters must be 100% original (clean-room, `CLAUDE.md` §9).

## Log
- 2026-11-23: Created as a future themed dungeon placeholder leveraging ETH-133's extensible Danger schema.
- 2026-11-24: Added a note from the M1.5/M1.6 fan-out (Nate approved).
