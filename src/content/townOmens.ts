/**
 * The first four Omens (ETH-186), each unlocked by a town node: Stalker's Ledger and Deep Surge in
 * the Guild Hall, Cursed Hoards and Armed Warbands in the Smithy (`town/guildHall.ts`, `town/smithy.ts`).
 *
 * Every rank switches on one named flag, `omen.<name>.<rank>`, and the sim reads the highest one
 * (`src/sim/stats/omenEffects.ts` holds the numbers per rank). The text here must say what the
 * numbers there do. `reward` is the total reward bonus at that rank, not an increment, and every
 * number is a starting shape for the pacing work (ETH-161).
 */
import { defineOmen } from './omens';

/** The flag a rank of an Omen sets: `omenRankFlag('omen.deep_surge', 2)` is `omen.deep_surge.2`. */
export function omenRankFlag(id: string, rank: number): string {
  return `${id}.${rank}`;
}

export const OMEN_STALKERS_LEDGER = defineOmen({
  id: 'omen.stalkers_ledger',
  name: "Stalker's Ledger",
  description:
    'Something in the dungeon keeps a tally of who has come down. Stronger variants (Venomous, Swift and the rest) turn up ' +
    'on shallower floors and more often, and more creatures from deeper down wander up. Few of either carry anything worth taking.',
  hint: 'A ledger of names, kept by a hand that is not yours.',
  tags: ['monsters', 'spawns'],
  ranks: [
    {
      reward: 0.1,
      text: 'Variant and wandering deep monsters draw as if 1 floor deeper (wanderers 8 points likelier), and either carries a find 10% of the time.',
      flags: [omenRankFlag('omen.stalkers_ledger', 1)],
    },
    {
      reward: 0.2,
      text: 'Variant and wandering deep monsters draw as if 2 floors deeper (wanderers 20 points likelier), and either carries a find 10% of the time.',
      flags: [omenRankFlag('omen.stalkers_ledger', 2)],
    },
    {
      reward: 0.3,
      text: 'Variant and wandering deep monsters draw as if 2 floors deeper (wanderers 30 points likelier), and either carries a find 10% of the time.',
      flags: [omenRankFlag('omen.stalkers_ledger', 3)],
    },
  ],
});

export const OMEN_DEEP_SURGE = defineOmen({
  id: 'omen.deep_surge',
  name: 'Deep Surge',
  description:
    'When the contracts are done and the party turns for the surface, the dungeon answers harder. The surge that fills each ' +
    'floor on the way up is larger, has more variants and sends more hunting patrols, and the pursuers carry spoils.',
  hint: 'The way out is not the way you came.',
  tags: ['monsters', 'return'],
  ranks: [
    {
      reward: 0.1,
      text: 'The return-trip surge is a quarter larger, rolls variants 10 points more often, sends 1 more hunting patrol, and each pursuer carries a find 30% of the time.',
      flags: [omenRankFlag('omen.deep_surge', 1)],
    },
    {
      reward: 0.2,
      text: 'The return-trip surge is half again as large, rolls variants 20 points more often, sends 2 more hunting patrols, and each pursuer carries a find half the time.',
      flags: [omenRankFlag('omen.deep_surge', 2)],
    },
    {
      reward: 0.3,
      text: 'The return-trip surge is twice as large, rolls variants 30 points more often, sends 3 more hunting patrols, and each pursuer carries a find 70% of the time.',
      flags: [omenRankFlag('omen.deep_surge', 3)],
    },
  ],
});

export const OMEN_CURSED_HOARDS = defineOmen({
  id: 'omen.cursed_hoards',
  name: 'Cursed Hoards',
  description:
    'The dungeon’s hoards are thinner and fouler. Each floor holds fewer items, and more of the gear and the draughts and ' +
    'scrolls left on them is cursed. Nothing says which is which until it is identified.',
  hint: 'Treasure that wants to be found.',
  tags: ['loot', 'curses'],
  ranks: [
    {
      reward: 0.1,
      scope: 'all',
      text: 'Each floor holds 1 fewer item, and floor gear is cursed 35 points more often (potions and scrolls 15 points).',
      flags: [omenRankFlag('omen.cursed_hoards', 1)],
    },
    {
      reward: 0.2,
      scope: 'all',
      text: 'Each floor holds 2 fewer items, and floor gear is cursed 40 points more often (potions and scrolls 20 points).',
      flags: [omenRankFlag('omen.cursed_hoards', 2)],
    },
    {
      reward: 0.3,
      scope: 'all',
      text: 'Each floor holds 3 fewer items, and floor gear is cursed 50 points more often (potions and scrolls 25 points).',
      flags: [omenRankFlag('omen.cursed_hoards', 3)],
    },
  ],
});

export const OMEN_ARMED_WARBANDS = defineOmen({
  id: 'omen.armed_warbands',
  name: 'Armed Warbands',
  description:
    'The dungeon’s tougher creatures have taken up arms. Some spawn armored and hitting harder, carrying a weapon or ' +
    'armor they drop where they fall. The gear is as unidentified as anything else on the floor.',
  hint: 'Things down there have taken to wearing what they killed.',
  tags: ['monsters', 'loot'],
  ranks: [
    {
      reward: 0.12,
      text: '20% of the tougher monsters (threat 3 or more) are Armed: 1 more damage, and a plain weapon or armor piece dropped when slain.',
      flags: [omenRankFlag('omen.armed_warbands', 1)],
    },
    {
      reward: 0.24,
      text: '35% of the tougher monsters (threat 3 or more) are Armed: 1 more damage, and a plain weapon or armor piece dropped when slain.',
      flags: [omenRankFlag('omen.armed_warbands', 2)],
    },
    {
      reward: 0.36,
      text: '55% of the tougher monsters (threat 3 or more) are Armed: 1 more damage, and a plain weapon or armor piece dropped when slain.',
      flags: [omenRankFlag('omen.armed_warbands', 3)],
    },
  ],
});
