/**
 * Building quests (ETH-093, CLAUDE.md §4): the contract that opens each Town building. A building
 * quest is an ordinary contract with `opens` (`contracts.ts`), taken in a contract slot, paid like
 * any contract (in the building's own currency where it has one) and limited to one per run. The
 * building's `unlock` names it with an `objectiveDone` milestone (`exited: true`), so it counts
 * only when the party walks out with the objective done.
 *
 * Quests that open later buildings (the Library, Temple and so on) come with those buildings.
 * Original names and text throughout.
 */
import { defineContract } from './contracts';
import { defineItem } from './items';

/** The anvil the Smithy's quest asks for. Placed only by that quest, never by loot. */
export const ITEM_GUILD_ANVIL = defineItem({
  id: 'item.guild_anvil',
  name: 'Guild anvil',
  description:
    'A squat black anvil, its face worn into a shallow dish by a century of hammers. The guild lost it on the ' +
    'third floor and has wanted it back ever since. It is far too heavy to carry well, and it is never dropped.',
  hint: 'A squat black anvil lying on the third floor.',
  tags: ['relic', 'contract'],
  glyph: { ch: '&', color: '#8d99a6', bold: true },
  category: 'relic',
  weight: 15,
  value: 0,
});

/** The Smithy's quest: bring the guild's lost anvil back from floor 3. Offered from the first run. */
export const CONTRACT_COLD_ANVIL = defineContract({
  id: 'contract.cold_anvil',
  name: 'The Cold Anvil',
  description:
    'The guild forge went cold the day its anvil was lost on the third floor. Find it, carry it, and walk back out of ' +
    'the dungeon with it, and the Smithy will open its doors. If its bearer falls, the contract is no longer complete.',
  hint: 'A guild writ to bring a lost anvil back from the third floor and open the Smithy.',
  tags: ['contract', 'building'],
  objective: { kind: 'recover', item: ITEM_GUILD_ANVIL.id, depth: 3 },
  reward: { trophies: 100 },
  opens: 'building.smithy',
  offerAt: 0,
  openedText: 'you brought the anvil home',
});
