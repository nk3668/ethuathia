---
id: ETH-143
title: Content check that every discoverable def can actually appear in a run
type: chore
status: done
priority: P2
milestone: M1.6
epic: tools-balance
size: S
depends_on: [ETH-131]
created: 2026-11-23
updated: 2026-11-23
---

## Summary
Add a load-time or validation check that every monster, template, item and enchantment can actually come up in a run, not just be mapped to a Codex discovery.

## Why
ETH-131's Codex reachability test (`test/ui/codex.test.tsx`) feeds hand-built events to `discoveriesOf`. That proves an event would mark the entry. It doesn't prove the sim ever produces that event for the def. Some defs could still be impossible to find in play, which leaves their Codex entries stuck at `???` forever:
- a monster whose Danger band is outside every dungeon's range;
- an item with no loot entry and no other source;
- a special enchantment that fits no gear at a reachable depth.

Found in the ETH-131 review.

## Acceptance criteria
- [x] Monsters: each `MonsterDef.danger` range overlaps the Danger range of at least one registered dungeon, ecology included. Defs placed only by hand (uniques, test fixtures) opt out with an explicit flag.
- [x] Templates: each monster template can be rolled on at least one monster that can spawn.
- [x] Items: each item has a `loot` entry at a reachable depth, or is named as a source elsewhere (starting kits, contract relics, monster carries, fountain or encounter rewards).
- [x] Enchantments: each special enchantment fits at least one gear item that can spawn, at a depth within its range. Each base enchantment profile is used by at least one gear def.
- [x] Runs as part of content validation (ETH-022's `tsx` command and `npm test`). Each failure names the def and why it can't be reached.

## Notes
- Reuse `monsterWeightAt` / `monstersForDanger` (`src/sim/combat/monsters.ts`), `lootTable` (`src/sim/items/loot.ts`), and `specialEnchantmentsFor` / `enchantmentFits` (`src/content`) rather than restating the rules.
- If the check needs sim helpers, it belongs in `tools/` or `test/`, not `src/content` (layer rule).

## Log
- 2026-11-23: Created from the ETH-131 review (milestone M1.6, review follow-ups).
- 2026-11-23: Implemented `tools/content-reachability.ts` (run by `validateContent`), `MonsterDef.handPlaced` opt-out flag, tests in `test/content/reachability.test.ts`. All shipped defs are reachable today; no opt-outs used. Reachability counts a dungeon's own floors only (no return-trip shift or OOD). Special enchantments with weight 0 are treated as Smithy-only, not checked.
- 2026-11-23: Reviewed and merged into m1.5-living-dungeon by the orchestrator (npm run check green, 1167 tests).
