/**
 * The `upgrades` slice: which upgrade nodes the player owns (docs/ARCHITECTURE.md §6.2), in the
 * order they were bought, and the rank of each ranked one (ETH-172). Everything else (unlocks,
 * capacities, bundles) is derived from these by `src/meta/upgrades.ts`, so nothing else tracks
 * upgrade state.
 *
 * Ids of nodes that no longer exist in content are kept but ignored, so a save survives content
 * being renamed or removed.
 */
import { z } from 'zod';
import { idSchema } from '../../content/schema';
import { defineSlice } from '../slice';

export interface Upgrades {
  /** Owned node ids, oldest purchase first. No repeats. A ranked node is listed once, at rank 1 or more. */
  readonly owned: readonly string[];
  /**
   * The rank of every owned node bought past rank 1. A node absent here owned at rank 1. Every
   * key is in `owned`; values are whole numbers from 2.
   */
  readonly ranks: Readonly<Record<string, number>>;
}

export const upgradesSlice = defineSlice<Upgrades>({
  version: 2,
  schema: z
    .object({
      owned: z.array(idSchema('upgrade')).refine((ids) => new Set(ids).size === ids.length, 'must not list a node twice'),
      ranks: z.record(idSchema('upgrade'), z.number().int('must be a whole number').min(2, 'must be 2 or more (rank 1 is not stored)')),
    })
    .refine((u) => Object.keys(u.ranks).every((id) => u.owned.includes(id)), { path: ['ranks'], message: 'must only list owned nodes' }),
  init: () => ({ owned: [], ranks: {} }),
  migrations: {
    // v2 (ETH-172): adds the ranks of ranked nodes; every node already owned is at rank 1.
    2: (old) => ({ ...(old as object), ranks: {} }),
  },
});
