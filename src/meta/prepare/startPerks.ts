/**
 * Start perks in the run config (ETH-159): the Smithy's `start` grants and trade bonus, read from
 * the owned upgrades and written into the `RunConfig` fields the sim reads in `createRun` and
 * when the party leaves. `buildRunConfig` merges the result; a profile with none adds nothing.
 */
import { START_ENCHANT_PIECES, START_KNOWN_CATEGORIES } from '../../content';
import type { StartEnchantPiece, StartKnownCategory } from '../../content';
import type { RunConfig, StartStock } from '../../sim';
import type { Profile } from '../profile';
import { capacity, profileGrants } from '../upgrades';

/** The run config fields the owned upgrades' start perks and trade bonus set, with unset ones left out. */
export function upgradeStartConfig(profile: Profile): Pick<RunConfig, 'startKnown' | 'kitEnchant' | 'startStock' | 'tradeBonus'> {
  const known = new Set<StartKnownCategory>();
  const enchant = new Set<StartEnchantPiece>();
  const stock: StartStock[] = [];
  for (const { grant } of profileGrants(profile)) {
    if (grant.kind !== 'start') continue;
    const perk = grant.start;
    if (perk.perk === 'know') known.add(perk.category);
    else if (perk.perk === 'enchant') enchant.add(perk.piece);
    else stock.push({ item: perk.item, qty: perk.qty });
  }
  const bonus = capacity(profile, 'tradeBonus', 0);
  return {
    // Fixed orders keep a config the same however the nodes were bought.
    ...(known.size > 0 ? { startKnown: START_KNOWN_CATEGORIES.filter((c) => known.has(c)) } : {}),
    ...(enchant.size > 0 ? { kitEnchant: START_ENCHANT_PIECES.filter((p) => enchant.has(p)) } : {}),
    ...(stock.length > 0 ? { startStock: mergeStock(stock) } : {}),
    ...(bonus > 0 ? { tradeBonus: bonus } : {}),
  };
}

/** The same item listed twice becomes one entry with the summed quantity, in first-seen order. */
function mergeStock(stock: readonly StartStock[]): StartStock[] {
  const totals = new Map<string, number>();
  for (const { item, qty } of stock) totals.set(item, (totals.get(item) ?? 0) + qty);
  return [...totals].map(([item, qty]) => ({ item, qty }));
}
