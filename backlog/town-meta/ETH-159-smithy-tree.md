---
id: ETH-159
title: Smithy upgrade tree spent in Trophies
type: feature
status: ready
priority: P1
milestone: M2.1
epic: town-meta
size: M
depends_on: [ETH-063, ETH-086, ETH-043, ETH-044, ETH-172, ETH-170, ETH-176]
created: 2026-11-24
updated: 2026-11-24
---

## Summary
Give the Smithy its tree, Tiers I–II of the approved town-tree page (v4), paid in Trophies. This item ships the nodes that build on existing systems; ETH-188 adds the ones that need new mechanics and ETH-186 adds the Omen unlocks.

## Why
Trophies need a sink, and gear does not carry over between runs, so Smithy starting kits are the gear progression (`CLAUDE.md` §3, §4).

## The tree (approved v4, 2026-11-24)
The source is the Smithy panel of the town-tree page (https://claude.ai/artifact/GG26YiRZpYzgWLsxfQ5XHP). Costs are a starting shape for ETH-161.

**Tier I** (open once the Smithy opens)
| Row | Node | Effect | Cost (Trophies) | Item |
|---|---|---|---|---|
| 1 | Fitted Straps I–III | +2 carry per rank | 25, ×1.5 | here |
| 1 | Maker's Marks I–III | +8% chance per rank to identify gear on pickup | 35, ×1.5 | ETH-188 |
| 2 | pick: Artisan Implements / Tailored Attire | Each class's starting main-hand / defensive piece upgrades to its own Tier-1 item | 120 each | ETH-188 |
| 2 | Appraiser's Eye | Potion kinds known at the start of a run | 150 | here |
| 3 | Reinforced Wagon | Party size +1 (the third berth) | 300 | here |
| 3 | Ironmonger Contract | Unlocks the Reaver (ETH-036 reveal) | 200 | here |
| 3 | Omen: Cursed Hoards | Unlocks an Omen | 75 | ETH-186 |

**Tier II** (quest: *Star-Iron*, bring star-iron back from floor 5)
| Row | Node | Effect | Cost | Item |
|---|---|---|---|---|
| 4 | Quarry Pact | Unlocks the Stonekin | 200 | here |
| 4 | Smelting Pit I–III | +15% Trophies per rank from carried items and leftover gold on exit | 120, ×1.6 | here |
| 4 | Omen: Armed Warbands | Unlocks an Omen | 450 | ETH-186 |
| 5 | pick: Runed Implements / Warded Attire | Starting main-hand item at +1 (its gear type's own enchantment) / defensive piece at +1 | 400 each | here |
| 5 | Scroll Case | The party starts with 1 Scroll of Identify and 1 Scroll of Uncursing | 350 | here |
| 6 | pick: Forge Stamps / Apprentice Trinket | Per-adventurer kit stamps / a class-matched ring or amulet | 550 each | ETH-188 |
| 6 | Assayer's Ledger | Ring and amulet kinds known at the start | 500 | here |
| 6 | Field Salvage Kit | Opt-in: overloaded adventurers break plain gear into scrap (at-risk Trophies) | 350 | ETH-188 |

Tier III (Tinker's Workshop, Scroll Lore, Reforged Echo, Loadout Bench) and the Gear trust doctrine are later milestones.

## Acceptance criteria
- [ ] `src/content/town/smithy.ts` holds the "here" nodes above on ETH-172 ranks, with the Tier II gate (*Star-Iron*, its contract def ships here) via ETH-170. The Reaver and Stonekin unlock nodes from ETH-036 keep their ids.
- [ ] Kit nodes (Runed Implements, Warded Attire, Scroll Case) change the starting kit of new runs through the ETH-176 kit path; kit items are never sold (ETH-171).
- [ ] Runed Implements uses each gear type's own enchantment, so a staff or focus gains its MP enchantment rather than damage.
- [ ] Identification nodes mark those kinds known at run start, respecting ETH-142's identification secrecy.
- [ ] Every node has tooltip and Codex text; `validateContent` passes; a test covers each kit node and the Tier II lock.

## Notes
- The starting-loadout plumbing (the Prepare screen's loadout step, `CLAUDE.md` §2 step 2) grows in ETH-188 with Forge Stamps.

## Log
- 2026-11-24: Created in the backlog reorganization by theme (gap: Trophies had no sink).
- 2026-11-24: Progression discussion with Nate: deeper tree on ranks and tiers; gear does not carry over, so Smithy kits are the gear progression.
- 2026-11-24: Town trees v4 approved. Specced from the Smithy panel, moved to M2.1 and `ready`; nodes needing new mechanics split out to ETH-188, Omen nodes to ETH-186.
