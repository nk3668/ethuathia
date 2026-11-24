/**
 * The Smithy (CLAUDE.md §4): starting gear kits, starting enchantment and identification
 * knowledge, paid in Trophies.
 *
 * PLACEHOLDER (ETH-074): the tree so far holds only the two recruit unlocks of ETH-036 in its first
 * row; the rest arrives with the Smithy's own item. It opens with its building quest, *The Cold
 * Anvil* (ETH-093, `buildingQuests.ts`): bring the guild's anvil back from floor 3 and walk out.
 */
import { CONTRACT_COLD_ANVIL } from '../buildingQuests';
import { defineBuilding, defineUpgrade } from '../upgrades';

export const BUILDING_SMITHY = defineBuilding({
  id: 'building.smithy',
  name: 'Smithy',
  description:
    'A forge at the edge of town that works what the dungeon gives up. Its upgrades send ' +
    'adventurers down with better gear and teach them what they carry.',
  tags: ['town', 'placeholder'],
  kind: 'foundations',
  unlock: { kind: 'objectiveDone', owner: { kind: 'contract', id: CONTRACT_COLD_ANVIL.id }, exited: true },
});

const building = BUILDING_SMITHY.id;

export const UPGRADE_REAVER_TRAINING = defineUpgrade({
  id: 'upgrade.reaver_training',
  name: 'Reaver Training',
  description: 'The smiths take on a hard-handed pupil and a heavy axe. Reavers can be recruited, and a random recruit may be one.',
  tags: ['roster', 'class'],
  building,
  tier: 1,
  column: 0,
  cost: { trophies: 200 },
  requires: [],
  reveal: { kind: 'reachDepth', depth: 5 },
  grants: [{ kind: 'unlock', id: 'class.reaver' }],
});

export const UPGRADE_STONEKIN_RECRUITMENT = defineUpgrade({
  id: 'upgrade.stonekin_recruitment',
  name: 'Stonekin Recruitment',
  description: 'A bargain struck over the forge with the folk of the deep stone. Stonekin can be recruited, and a random recruit may be one.',
  tags: ['roster', 'race'],
  building,
  tier: 1,
  column: 1,
  cost: { trophies: 200 },
  requires: [],
  reveal: { kind: 'winRuns', count: 1 },
  grants: [{ kind: 'unlock', id: 'race.stonekin' }],
});
