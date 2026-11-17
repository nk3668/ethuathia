/**
 * The `upgrades` slice: which upgrade nodes the player owns (docs/ARCHITECTURE.md §6.2), in the
 * order they were bought. Everything else (unlocks, capacities, bundles) is derived from this
 * list by `src/meta/upgrades.ts`, so nothing else tracks upgrade state.
 *
 * Ids of nodes that no longer exist in content are kept but ignored, so a save survives content
 * being renamed or removed.
 */
import { z } from 'zod';
import { idSchema } from '../../content/schema';
import { defineSlice } from '../slice';

export interface Upgrades {
  /** Owned node ids, oldest purchase first. No repeats. */
  readonly owned: readonly string[];
}

export const upgradesSlice = defineSlice<Upgrades>({
  version: 1,
  schema: z.object({
    owned: z.array(idSchema('upgrade')).refine((ids) => new Set(ids).size === ids.length, 'must not list a node twice'),
  }),
  init: () => ({ owned: [] }),
});
