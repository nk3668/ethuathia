/**
 * The Smithy (CLAUDE.md §4): starting gear kits, starting enchantment and identification
 * knowledge, paid in Trophies.
 *
 * PLACEHOLDER (ETH-074): only the building def exists, so the Town tab has a locked building to
 * show. Its tree arrives with the Smithy's own item. It opens with its building quest, *The Cold
 * Anvil* (ETH-093, `buildingQuests.ts`): bring the guild's anvil back from floor 3 and walk out.
 */
import { CONTRACT_COLD_ANVIL } from '../buildingQuests';
import { defineBuilding } from '../upgrades';

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
