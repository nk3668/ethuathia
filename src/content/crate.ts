/**
 * The Quartermaster's Mystery Crate (ETH-187): what the Guild Hall's opt-in crate can hold. Once
 * a run, the first adventurer's pack gets one unidentified curiosity rolled from this table with
 * the run's seed (`giveCrate` in `src/sim/items/crate.ts`): a blessed potion, a scroll, a ring or
 * an amulet ... or a cursed dud. Nothing in it says which until the item is identified (ETH-142,
 * ETH-147), so opening the crate is a gamble the player chose to take.
 *
 * `crateTableProblems` is part of start-up validation (`checkGame`): every entry names an item that
 * exists, a blessing or enchantment the item can actually carry, and the table has both gifts and
 * duds. Its items count as issued at the start of a run for the reachability check (`issued.ts`).
 */
import { baseEnchantmentFor } from './enchantments';
import type { ItemBlessing } from './enchantments';
import { registerIssuedItems } from './issued';
import {
  ITEM_COPPER_BAND,
  ITEM_GARNET_SIGNET,
  ITEM_HEARTHSTONE_AMULET,
  ITEM_KNOTWORK_PENDANT,
  ITEM_MENDING_DRAUGHT,
  ITEM_OWL_EYE_RING,
  ITEM_QUICKSTEP_TONIC,
  ITEM_SCROLL_OF_IDENTIFY,
  ITEM_SCROLL_OF_RENEWAL,
  ITEM_SCROLL_OF_UNCURSING,
  ITEMS,
} from './items';

/** One thing the crate may hold. Every copy starts unidentified, whatever it is. */
export interface CrateEntry {
  /** An item def id. */
  readonly item: string;
  /** Relative chance, above 0. */
  readonly weight: number;
  readonly blessing?: ItemBlessing;
  /** The `+N` or `-N` of a piece of gear (its base enchantment); left out for none. Only gear takes one. */
  readonly enchant?: number;
}

/** The contents, with the gifts first and the duds after. About one crate in five is a dud. */
export const CRATE_TABLE: readonly CrateEntry[] = [
  { item: ITEM_MENDING_DRAUGHT.id, weight: 4, blessing: 'blessed' },
  { item: ITEM_QUICKSTEP_TONIC.id, weight: 3, blessing: 'blessed' },
  { item: ITEM_SCROLL_OF_RENEWAL.id, weight: 3, blessing: 'blessed' },
  { item: ITEM_SCROLL_OF_IDENTIFY.id, weight: 3, blessing: 'blessed' },
  { item: ITEM_COPPER_BAND.id, weight: 2, blessing: 'blessed', enchant: 1 },
  { item: ITEM_OWL_EYE_RING.id, weight: 2, blessing: 'blessed', enchant: 1 },
  { item: ITEM_HEARTHSTONE_AMULET.id, weight: 1, blessing: 'blessed', enchant: 1 },
  // The duds: cursed, so a cursed ring stays on until uncursed, and a cursed draught or scroll is weak.
  { item: ITEM_GARNET_SIGNET.id, weight: 2, blessing: 'cursed', enchant: -1 },
  { item: ITEM_KNOTWORK_PENDANT.id, weight: 1, blessing: 'cursed', enchant: -2 },
  { item: ITEM_SCROLL_OF_UNCURSING.id, weight: 1, blessing: 'cursed' },
  { item: ITEM_QUICKSTEP_TONIC.id, weight: 1, blessing: 'cursed' },
];

registerIssuedItems('the Mystery Crate', () => CRATE_TABLE.map((e) => e.item));

/** Whether an entry is a dud: cursed. */
export function isCrateDud(entry: CrateEntry): boolean {
  return entry.blessing === 'cursed';
}

/** What is wrong with a crate table, one line each; empty when it is sound. */
export function crateTableProblems(table: readonly CrateEntry[] = CRATE_TABLE): string[] {
  const problems: string[] = [];
  table.forEach((entry, i) => {
    const at = `crate entry ${i} ("${entry.item}")`;
    if (!ITEMS.has(entry.item)) {
      problems.push(`${at}: unknown item`);
      return;
    }
    if (!(entry.weight > 0) || !Number.isFinite(entry.weight)) problems.push(`${at}: weight must be above 0`);
    const def = ITEMS.get(entry.item);
    if (entry.enchant !== undefined) {
      const base = baseEnchantmentFor(def);
      if (base === undefined) problems.push(`${at}: only gear takes an enchantment`);
      else if (!Number.isInteger(entry.enchant) || entry.enchant < base.minLevel || entry.enchant > base.maxLevel) {
        problems.push(`${at}: enchantment ${entry.enchant} is outside ${base.minLevel}..${base.maxLevel}`);
      }
      if (entry.blessing === 'cursed' && (entry.enchant ?? 0) > 0) problems.push(`${at}: a cursed piece cannot carry a positive enchantment`);
    }
    if (def.category === 'gold' || def.category === 'junk' || def.category === 'relic' || def.category === 'food') {
      problems.push(`${at}: a ${def.category} item cannot sit in the crate`);
    }
  });
  if (!table.some(isCrateDud)) problems.push('the crate table has no cursed entry: a mystery crate must be a gamble');
  if (!table.some((e) => !isCrateDud(e))) problems.push('the crate table has nothing but duds');
  return problems;
}
