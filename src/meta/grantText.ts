/** Wording for upgrade grants, for tooltips and the Codex. */
import { CAPACITY_INFO, findDef, START_PERK_INFO } from '../content';
import type { StartPerk, UpgradeGrant } from '../content';

/**
 * A grant in words: "Party size +1", "Unlocks Vanguard". `times` is how many ranks of its node
 * are counted (ETH-172): "Party size +3" at rank 3, and a bundle's modifiers stacked that often.
 */
export function describeGrant(grant: UpgradeGrant, times = 1): string {
  switch (grant.kind) {
    case 'capacity':
      return `${CAPACITY_INFO[grant.key].name} +${grant.amount * times}`;
    case 'unlock':
      return `Unlocks ${findDef(grant.id)?.name ?? grant.id}`;
    case 'start':
      return describeStartPerk(grant.start);
    case 'bundle': {
      const who = grant.scope === 'party' ? 'each adventurer' : 'the run';
      const parts = (grant.bundle.modifiers ?? []).map((m) => {
        if (m.op === 'add') {
          const value = m.value * times;
          return `${value > 0 ? '+' : ''}${value} ${statName(m.stat)}`;
        }
        return `×${Number((m.value ** times).toFixed(4))} ${statName(m.stat)}`;
      });
      const triggers = (grant.bundle.triggers?.length ?? 0) * times;
      if (triggers > 0) parts.push(`${triggers} triggered effect${triggers === 1 ? '' : 's'}`);
      return `${parts.join(', ')} for ${who}`;
    }
  }
}

/** A start perk in words (ETH-159): "Knows every potion kind from the first turn". */
export function describeStartPerk(perk: StartPerk): string {
  switch (perk.perk) {
    case 'know':
      return `Knows every ${START_PERK_INFO[perk.category].name} kind from the first turn`;
    case 'enchant':
      return `Starts with the ${START_PERK_INFO[perk.piece].name} of each adventurer's kit at +1`;
    case 'tier':
      return `Swaps the ${START_PERK_INFO[perk.piece].name} of each adventurer's kit for their class's own Tier-1 piece`;
    case 'trinket':
      return "Each adventurer wears their class's ring or amulet from the first turn";
    case 'stamps':
      return 'Each adventurer\'s kit carries a Forge Stamp (Keen, Warding or Nimble), chosen on the Prepare screen';
    case 'stock':
      return `${perk.each === true ? 'Each adventurer starts' : 'The party starts'} with ${perk.qty} ${findDef(perk.item)?.name ?? perk.item}`;
  }
}

/** Display names for stat ids in grant text. */
const STAT_NAMES: Readonly<Record<string, string>> = {
  hp: 'max HP',
  mp: 'max MP',
  accuracy: 'accuracy',
  evasion: 'evasion',
  damage: 'damage',
  armor: 'armor',
  speed: 'speed',
  sight: 'sight',
  carry: 'carry',
  identify: 'identify chance (%)',
};

function statName(stat: string): string {
  return STAT_NAMES[stat] ?? stat;
}
