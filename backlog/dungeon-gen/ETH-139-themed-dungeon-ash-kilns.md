---
id: ETH-139
title: "Themed dungeon: The Ash Kilns"
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
Add *The Ash Kilns* as a high-tier unlockable dungeon (around `depth: 10–14`, starting Danger ~6) set in abandoned underground smelteries filled with high-armor constructs and cinder-kin casters behind brute frontlines.

## Why
Rewards Smithy-upgraded parties and armor-piercing/caster party compositions while demonstrating multi-dungeon Danger curves (`docs/DIFFICULTY_PHILOSOPHY.md` §2 & §3.2).

## Acceptance criteria
- [ ] Clean-room `DungeonDef`, smeltery hall theme, and construct/cinder bestiary entries with full `hint`, description, and Codex support (`ETH-091`)
- [ ] High-Danger curve and high-armor encounter patterns verified in `npm run sim` and `npm run check`

## Notes
- All names, descriptions, and monsters must be 100% original (clean-room, `CLAUDE.md` §9).

## Log
- 2026-11-23: Created as a future themed dungeon placeholder leveraging ETH-133's extensible Danger schema.
