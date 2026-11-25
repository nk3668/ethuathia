/**
 * Save migration for the Guild Hall rebuild (ETH-132): nodes that left the tree are refunded.
 *
 * Their defs are gone, so their prices are listed here, as they were when the nodes shipped. A
 * node that kept its id keeps its purchase, whatever its new price. The migration runs on the
 * whole save envelope (`save.ts`, version 2) because it moves Renown from `upgrades` to `currencies`.
 */

/** Removed node ids and the Renown each cost. Third and Fourth Berth moved out of the Guild Hall (the Smithy and the Library). */
export const REMOVED_GUILD_HALL_NODES: Readonly<Record<string, number>> = {
  'upgrade.roster_ledger': 80,
  'upgrade.third_berth': 250,
  'upgrade.fourth_berth': 600,
  'upgrade.drill_yard': 400,
  'upgrade.open_muster': 400,
};

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Takes the removed nodes out of `slices.upgrades.data.owned` and adds their prices to
 * `slices.currencies.data.renown`. A save without those slices, or with none of the nodes, is
 * returned as it was.
 */
export function refundRemovedNodes(envelope: Obj): Obj {
  const slices = envelope.slices;
  if (!isObj(slices)) return envelope;
  const upgrades = slices.upgrades;
  const currencies = slices.currencies;
  if (!isObj(upgrades) || !isObj(upgrades.data) || !Array.isArray(upgrades.data.owned)) return envelope;
  const owned = upgrades.data.owned as unknown[];
  const gone = owned.filter((id): id is string => typeof id === 'string' && Object.hasOwn(REMOVED_GUILD_HALL_NODES, id));
  if (gone.length === 0) return envelope;
  const refund = gone.reduce((sum, id) => sum + (REMOVED_GUILD_HALL_NODES[id] ?? 0), 0);

  const nextRanks = isObj(upgrades.data.ranks)
    ? Object.fromEntries(Object.entries(upgrades.data.ranks).filter(([id]) => !gone.includes(id)))
    : upgrades.data.ranks;
  const nextUpgrades = {
    ...upgrades,
    data: {
      ...upgrades.data,
      owned: owned.filter((id) => !gone.includes(id as string)),
      ...(upgrades.data.ranks !== undefined ? { ranks: nextRanks } : {}),
    },
  };
  const nextSlices: Obj = { ...slices, upgrades: nextUpgrades };
  if (isObj(currencies) && isObj(currencies.data) && typeof currencies.data.renown === 'number') {
    nextSlices.currencies = { ...currencies, data: { ...currencies.data, renown: currencies.data.renown + refund } };
  } else if (currencies === undefined && refund > 0) {
    nextSlices.currencies = { version: 1, data: { renown: refund, trophies: 0, favor: {} } };
  }
  return { ...envelope, slices: nextSlices };
}
