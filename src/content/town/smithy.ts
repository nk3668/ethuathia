/**
 * The Smithy (CLAUDE.md §4): starting gear kits, starting enchantment and identification
 * knowledge, paid in Trophies. It opens with its building quest, *The Cold Anvil* (ETH-093,
 * `buildingQuests.ts`): bring the guild's anvil back from floor 3 and walk out.
 *
 * Tiers I and II of the approved town-tree page (ETH-159). Rows 1 to 3 are open once the Smithy is;
 * rows 4 to 6 open with the tier quest *Star-Iron* (ETH-170): bring star-iron back from floor 5.
 * Only the nodes that build on existing systems are here. Maker's Marks, the class-tier kit pick,
 * Forge Stamps, Apprentice Trinket and Field Salvage Kit (ETH-188) and the two Omens (ETH-186) join
 * the free cells of the grid: row 1 column 1, row 2 columns 0 and 1, row 3 column 2, row 4 column 2
 * and row 6 columns 0, 1 and 3.
 *
 * Costs are a starting shape for the pacing work (ETH-161).
 */
import { CONTRACT_COLD_ANVIL, CONTRACT_STAR_IRON } from '../buildingQuests';
import { ITEM_SCROLL_OF_IDENTIFY, ITEM_SCROLL_OF_UNCURSING } from '../items';
import { defineBuilding, defineUpgrade } from '../upgrades';

/** The first node row that the *Star-Iron* quest opens (Tier II). */
export const SMITHY_TIER_TWO_ROW = 4;

export const BUILDING_SMITHY = defineBuilding({
  id: 'building.smithy',
  name: 'Smithy',
  description:
    'A forge at the edge of town that works what the dungeon gives up. Its upgrades send ' +
    'adventurers down with better gear and teach them what they carry.',
  tags: ['town'],
  kind: 'foundations',
  unlock: { kind: 'objectiveDone', owner: { kind: 'contract', id: CONTRACT_COLD_ANVIL.id }, exited: true },
  tierGates: [
    {
      fromTier: SMITHY_TIER_TWO_ROW,
      unlock: { kind: 'objectiveDone', owner: { kind: 'contract', id: CONTRACT_STAR_IRON.id }, exited: true },
      name: 'Smithy Tier II',
    },
  ],
});

const building = BUILDING_SMITHY.id;

// --- Tier I ----------------------------------------------------------------------------------

export const UPGRADE_FITTED_STRAPS = defineUpgrade({
  id: 'upgrade.fitted_straps',
  name: 'Fitted Straps',
  description: 'The saddler cuts every pack to its wearer. Each adventurer can carry more before the load slows them.',
  tags: ['party', 'numeric'],
  building,
  tier: 1,
  column: 0,
  cost: { trophies: 25 },
  requires: [],
  ranks: { max: 3, costGrowth: 1.5 },
  grants: [{ kind: 'bundle', scope: 'party', bundle: { modifiers: [{ stat: 'carry', op: 'add', value: 2 }] } }],
});

export const UPGRADE_MAKERS_MARKS = defineUpgrade({
  id: 'upgrade.makers_marks',
  name: 'Maker’s Marks',
  description:
    'The smiths teach the party to read a maker’s stamp and the wear on an edge. Each rank adds 8% to the chance an adventurer ' +
    'works out what an unknown item is when picking it up. Every item gets one try, and one that stays unknown still has to ' +
    'be identified another way.',
  tags: ['identify', 'numeric'],
  building,
  tier: 1,
  column: 1,
  cost: { trophies: 35 },
  requires: [],
  ranks: { max: 3, costGrowth: 1.5 },
  grants: [{ kind: 'bundle', scope: 'party', bundle: { modifiers: [{ stat: 'identify', op: 'add', value: 8 }] } }],
});

export const UPGRADE_APPRAISERS_EYE = defineUpgrade({
  id: 'upgrade.appraisers_eye',
  name: 'Appraiser’s Eye',
  description:
    'The smiths teach the party to read the colour and smell of every draught. All potion kinds are known from the first ' +
    'turn. Which copies are blessed, cursed or otherwise special still has to be found out.',
  tags: ['identify', 'capability'],
  building,
  tier: 2,
  column: 2,
  cost: { trophies: 150 },
  requires: [UPGRADE_FITTED_STRAPS.id],
  grants: [{ kind: 'start', start: { perk: 'know', category: 'potion' } }],
});

export const UPGRADE_ARTISAN_IMPLEMENTS = defineUpgrade({
  id: 'upgrade.artisan_implements',
  name: 'Artisan Implements',
  description:
    'The smiths forge each trade its proper tool. Every adventurer’s starting main-hand item is replaced by their class’s own ' +
    'Tier-1 piece: a mace becomes a flanged mace, a skinning knife a trail dirk, a staff an ironshod staff, a hatchet a bearded axe. ' +
    'Kit pieces are never sold.',
  tags: ['kit', 'capability'],
  building,
  tier: 2,
  column: 0,
  cost: { trophies: 120 },
  requires: [UPGRADE_FITTED_STRAPS.id],
  exclusiveGroup: 'smithy.tier2',
  grants: [{ kind: 'start', start: { perk: 'tier', piece: 'weapon' } }],
});

export const UPGRADE_TAILORED_ATTIRE = defineUpgrade({
  id: 'upgrade.tailored_attire',
  name: 'Tailored Attire',
  description:
    'Fitted by the guild tailors. Every adventurer’s starting defensive piece is replaced by their class’s own Tier-1 piece: ' +
    'a banded shield, ridge boots, a scribe’s coat or a brow helm. Kit pieces are never sold.',
  tags: ['kit', 'capability'],
  building,
  tier: 2,
  column: 1,
  cost: { trophies: 120 },
  requires: [UPGRADE_FITTED_STRAPS.id],
  exclusiveGroup: 'smithy.tier2',
  grants: [{ kind: 'start', start: { perk: 'tier', piece: 'defense' } }],
});

export const UPGRADE_REINFORCED_WAGON = defineUpgrade({
  id: 'upgrade.reinforced_wagon',
  name: 'Reinforced Wagon',
  description: 'Iron bands and a deeper bed. The expedition wagon has room for one more adventurer, the third berth.',
  tags: ['party'],
  building,
  tier: 3,
  column: 0,
  cost: { trophies: 300 },
  requires: [],
  grants: [{ kind: 'capacity', key: 'partySize', amount: 1 }],
});

export const UPGRADE_REAVER_TRAINING = defineUpgrade({
  id: 'upgrade.reaver_training',
  name: 'Ironmonger Contract',
  description: 'The smiths take on a hard-handed pupil and a heavy axe. Reavers can be recruited, and a random recruit may be one.',
  tags: ['roster', 'class'],
  building,
  tier: 3,
  column: 1,
  cost: { trophies: 200 },
  requires: [],
  reveal: { kind: 'metInRun', requirement: { cond: 'cond.run_kills', params: { min: 40 } } },
  grants: [{ kind: 'unlock', id: 'class.reaver' }],
});

// --- Tier II (opened by Star-Iron) -----------------------------------------------------------

export const UPGRADE_STONEKIN_RECRUITMENT = defineUpgrade({
  id: 'upgrade.stonekin_recruitment',
  name: 'Quarry Pact',
  description: 'A bargain struck over the forge with the folk of the deep stone. Stonekin can be recruited, and a random recruit may be one.',
  tags: ['roster', 'race'],
  building,
  tier: 4,
  column: 0,
  cost: { trophies: 200 },
  requires: [],
  reveal: { kind: 'winRuns', count: 1 },
  grants: [{ kind: 'unlock', id: 'race.stonekin' }],
});

export const UPGRADE_SMELTING_PIT = defineUpgrade({
  id: 'upgrade.smelting_pit',
  name: 'Smelting Pit',
  description:
    'Scrap and spare coin go into the pit and come out as ingots. Each rank adds 15% to the Trophies the party gets from ' +
    'leftover gold and carried items when it leaves the dungeon. Omens do not multiply it, and a wipe still loses it all.',
  tags: ['economy', 'numeric'],
  building,
  tier: 4,
  column: 1,
  cost: { trophies: 120 },
  requires: [UPGRADE_REINFORCED_WAGON.id],
  ranks: { max: 3, costGrowth: 1.6 },
  grants: [{ kind: 'capacity', key: 'tradeBonus', amount: 15 }],
});

export const UPGRADE_RUNED_IMPLEMENTS = defineUpgrade({
  id: 'upgrade.runed_implements',
  name: 'Runed Implements',
  description:
    'Every adventurer’s starting main-hand item is worked at +1, using its own kind of enchantment: a weapon hits harder, ' +
    'a staff holds more mana. Kit pieces are never sold.',
  tags: ['kit', 'numeric'],
  building,
  tier: 5,
  column: 0,
  cost: { trophies: 400 },
  requires: [UPGRADE_SMELTING_PIT.id],
  exclusiveGroup: 'smithy.tier5',
  grants: [{ kind: 'start', start: { perk: 'enchant', piece: 'weapon' } }],
});

export const UPGRADE_WARDED_ATTIRE = defineUpgrade({
  id: 'upgrade.warded_attire',
  name: 'Warded Attire',
  description: 'Every adventurer’s starting defensive piece is worked at +1: shield, cap, jerkin or boots, each gains armor. Kit pieces are never sold.',
  tags: ['kit', 'numeric'],
  building,
  tier: 5,
  column: 1,
  cost: { trophies: 400 },
  requires: [UPGRADE_SMELTING_PIT.id],
  exclusiveGroup: 'smithy.tier5',
  grants: [{ kind: 'start', start: { perk: 'enchant', piece: 'defense' } }],
});

export const UPGRADE_SCROLL_CASE = defineUpgrade({
  id: 'upgrade.scroll_case',
  name: 'Scroll Case',
  description:
    'A waxed leather tube with two pockets. The party sets out with one Scroll of identify and one Scroll of uncursing, ' +
    'carried by its first member. They are never sold.',
  tags: ['kit', 'capability'],
  building,
  tier: 5,
  column: 2,
  cost: { trophies: 350 },
  requires: [UPGRADE_SMELTING_PIT.id],
  grants: [
    { kind: 'start', start: { perk: 'stock', item: ITEM_SCROLL_OF_IDENTIFY.id, qty: 1 } },
    { kind: 'start', start: { perk: 'stock', item: ITEM_SCROLL_OF_UNCURSING.id, qty: 1 } },
  ],
});

export const UPGRADE_ASSAYERS_LEDGER = defineUpgrade({
  id: 'upgrade.assayers_ledger',
  name: 'Assayer’s Ledger',
  description:
    'Page after page of stamps and assay marks. All ring and amulet kinds are known from the first turn. Which pieces are ' +
    'enchanted or cursed still has to be found out.',
  tags: ['identify', 'capability'],
  building,
  tier: 6,
  column: 2,
  cost: { trophies: 500 },
  requires: [UPGRADE_SCROLL_CASE.id],
  grants: [{ kind: 'start', start: { perk: 'know', category: 'jewelry' } }],
});

export const UPGRADE_FORGE_STAMPS = defineUpgrade({
  id: 'upgrade.forge_stamps',
  name: 'Forge Stamps',
  description:
    'Three stamps for the smiths’ irons: Keen, Warding and Nimble. On the Prepare screen each adventurer gets one worked into their ' +
    'starting kit. Keen (+1 Accuracy) goes on the main-hand item; Warding (+10% Status Resistance) and Nimble (+1 Evasion) on the ' +
    'first piece of armor. Each class has a default, and random recruits use it. Kit pieces are never sold.',
  tags: ['kit', 'capability', 'prepare'],
  building,
  tier: 6,
  column: 0,
  cost: { trophies: 550 },
  requires: [UPGRADE_SCROLL_CASE.id],
  exclusiveGroup: 'smithy.tier6',
  grants: [{ kind: 'start', start: { perk: 'stamps' } }],
});

export const UPGRADE_APPRENTICE_TRINKET = defineUpgrade({
  id: 'upgrade.apprentice_trinket',
  name: 'Apprentice Trinket',
  description:
    'A piece of the apprentices’ work for every adventurer: a ring or amulet matched to their class (a copper band, a knotwork ' +
    'pendant, a hearthstone amulet or a garnet signet), worn from the first turn. Kit pieces are never sold.',
  tags: ['kit', 'capability'],
  building,
  tier: 6,
  column: 1,
  cost: { trophies: 550 },
  requires: [UPGRADE_SCROLL_CASE.id],
  exclusiveGroup: 'smithy.tier6',
  grants: [{ kind: 'start', start: { perk: 'trinket' } }],
});
