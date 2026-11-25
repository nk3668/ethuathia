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
    'on shallower floors and more often, and more creatures from deeper down wander up. Both carry something worth taking.',
  hint: 'A ledger of names, kept by a hand that is not yours.',
  tags: ['monsters', 'spawns'],
  ranks: [
    {
      reward: 0.1,
      text: 'Variant and wandering deep monsters draw as if 1 floor deeper (wanderers 5 points likelier), and either carries a find 30% of the time.',
      flags: [omenRankFlag('omen.stalkers_ledger', 1)],
    },
    {
      reward: 0.2,
      text: 'Variant and wandering deep monsters draw as if 2 floors deeper (wanderers 10 points likelier), and either carries a find half the time.',
      flags: [omenRankFlag('omen.stalkers_ledger', 2)],
    },
    {
      reward: 0.3,
      text: 'Variant and wandering deep monsters draw as if 3 floors deeper (wanderers 15 points likelier), and either carries a find 70% of the time.',
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
    'The dungeon’s hoards are richer and fouler. More of the gear and the draughts and scrolls on the floors is cursed, and the ' +
    'gear that is not cursed is likelier to be enchanted, and to a higher level. Nothing says which is which until it is identified.',
  hint: 'Treasure that wants to be found.',
  tags: ['loot', 'curses'],
  ranks: [
    {
      reward: 0.1,
      scope: 'all',
      text: 'Floor gear is cursed 10 points more often (potions and scrolls 4 points) and un-cursed gear is enchanted 15 points more often.',
      flags: [omenRankFlag('omen.cursed_hoards', 1)],
    },
    {
      reward: 0.2,
      scope: 'all',
      text: 'Floor gear is cursed 20 points more often (potions and scrolls 8 points), un-cursed gear is enchanted 30 points more often, and its enchantments can reach one level higher.',
      flags: [omenRankFlag('omen.cursed_hoards', 2)],
    },
    {
      reward: 0.3,
      scope: 'all',
      text: 'Floor gear is cursed 30 points more often (potions and scrolls 12 points), un-cursed gear is enchanted 45 points more often, and its enchantments can reach two levels higher.',
      flags: [omenRankFlag('omen.cursed_hoards', 3)],
    },
  ],
});

export const OMEN_ARMED_WARBANDS = defineOmen({
  id: 'omen.armed_warbands',
  name: 'Armed Warbands',
  description:
    'The dungeon’s tougher creatures have taken up arms. Some spawn armored and carrying an enchanted weapon or armor, ' +
    'which they drop where they fall. The gear is as unidentified as anything else on the floor.',
  hint: 'Things down there have taken to wearing what they killed.',
  tags: ['monsters', 'loot'],
  ranks: [
    {
      reward: 0.12,
      text: 'A quarter of the tougher monsters (threat 3 or more) are Armed: 1 more armor, and a +1 piece of gear dropped when slain.',
      flags: [omenRankFlag('omen.armed_warbands', 1)],
    },
    {
      reward: 0.24,
      text: '45% of the tougher monsters (threat 3 or more) are Armed: 2 more armor, and a +2 piece of gear dropped when slain.',
      flags: [omenRankFlag('omen.armed_warbands', 2)],
    },
    {
      reward: 0.36,
      text: '65% of the tougher monsters (threat 3 or more) are Armed: 3 more armor, and a +3 piece of gear dropped when slain.',
      flags: [omenRankFlag('omen.armed_warbands', 3)],
    },
  ],
});
