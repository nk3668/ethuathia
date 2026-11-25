/**
 * The Quartermaster's Mystery Crate (ETH-187): one unidentified curiosity in the first
 * adventurer's pack, rolled from `CRATE_TABLE` (`src/content/crate.ts`).
 *
 * The roll draws from a stream derived from the run's seed (`CRATE_STREAM`), never from one of
 * the sim's four, so switching the crate on or off leaves every dungeon, monster and loot roll
 * exactly as it was. The item is marked kit (never sold: a crate can't be a Trophy farm) and
 * starts `identified: false` whatever it is, so a gift and a dud look alike (ETH-142, ETH-147).
 * Its kind is not learned: that waits for an identify.
 */
import { CRATE_TABLE } from '../../content';
import type { CrateEntry } from '../../content';
import { Rng } from '../../core';
import type { Entity, RunState } from '../state';
import { addToInventory } from './inventory';
import { newKitItem } from './kit';
import type { ItemInstance } from './instance';

/** The named stream the crate's roll uses, seeded from the run's seed. */
export const CRATE_STREAM = 'crate';

/** The entry the run's seed rolls: one draw, by weight. */
export function rollCrate(seed: number, table: readonly CrateEntry[] = CRATE_TABLE): CrateEntry {
  const total = table.reduce((n, e) => n + e.weight, 0);
  let roll = Rng.seeded(seed, CRATE_STREAM).float() * total;
  for (const entry of table) {
    roll -= entry.weight;
    if (roll < 0) return entry;
  }
  return table[table.length - 1] as CrateEntry;
}

/** The crate's item for `entry`: kit, unidentified, with its blessing and enchantment. */
export function crateItem(entry: CrateEntry): ItemInstance {
  return {
    ...newKitItem(entry.item),
    ...(entry.blessing === undefined ? {} : { blessing: entry.blessing }),
    ...(entry.enchant === undefined ? {} : { enchant: entry.enchant }),
    identified: false,
  };
}

/** Puts the run's crate item in `entity`'s pack. Returns the entry rolled, for tests. */
export function giveCrate(state: RunState, entity: Entity): CrateEntry {
  const entry = rollCrate(state.seed);
  addToInventory(entity, crateItem(entry));
  return entry;
}
