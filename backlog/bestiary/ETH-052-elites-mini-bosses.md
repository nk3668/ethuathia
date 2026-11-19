---
id: ETH-052
title: Elite monsters and mini-bosses with better loot
type: feature
status: idea
priority: P2
milestone: M2
epic: bestiary
size: M
depends_on: [ETH-041, ETH-045, ETH-067, ETH-117]
created: 2026-11-17
updated: 2026-11-19
---

## Summary
Elite monsters can appear on any floor with a name prefix and 1–2 traits (e.g. "Venomous", "Swift"). A mini-boss appears every 3 floors (default), often guarding the stairs down. Both drop magic items from a better loot table.

## Why
Regular peaks of danger and reward between floors. See `CLAUDE.md` §6.

## Acceptance criteria
- [ ] Elite traits are data (bundles of modifiers and triggers) with Codex and tooltip text; an elite's name shows its prefix
- [ ] A mini-boss is placed every N floors (N tunable, default 3), seeded
- [ ] Elites and mini-bosses drop from a better loot table: more affixes, higher rolls, more enchantment, and a chance of an artifact
- [ ] Log lines on engaging and killing an elite or mini-boss
- [ ] The Elite Spawns Omen raises how often elites appear

## Notes
- Mini-bosses can reuse named uniques or be elite versions of the floor's family leader.

## Log
- 2026-11-17: Created from a design discussion on quests, depth and extra features.
- 2026-11-17: Wired `depends_on` to the foundation items added in the fan-out plan.
- 2026-11-19: Added ETH-117 (monster templates) to `depends_on`: build on the shared system instead of a parallel version.
