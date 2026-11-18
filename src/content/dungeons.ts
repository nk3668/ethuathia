/**
 * Dungeon variants (CLAUDE.md §2, "Starting a run", step 6): which dungeon a run descends into,
 * picked on the Prepare screen once more than one is available. A variant sets the dungeon's
 * depth and the floor type its floors are built from (floor variety and route forks arrive in
 * M6; for now every generated floor uses the sim's default floor type, and `floorType` is what
 * the Prepare screen and the Codex show).
 *
 * A variant that an upgrade unlocks (`{ kind: 'unlock', id: 'dungeon.x' }`, e.g. from the
 * Cartographer) is offered only once that upgrade is owned; the others are open from the start.
 */
import { z } from 'zod';
import { Registry } from '../core';
import type { Def } from '../core';
import type { ContentKind } from './kind';
import { defShape, idSchema, positiveInt } from './schema';

export interface DungeonDef extends Def {
  /** How many floors deep it goes (the sim's `RunConfig.depth`). */
  readonly depth: number;
  /** The floor type its floors are built from (`floor.halls`). */
  readonly floorType: string;
}

export const DUNGEONS = new Registry<DungeonDef>('dungeon');

export const DUNGEON_KIND: ContentKind<DungeonDef> = {
  registry: DUNGEONS,
  schema: z.strictObject({ ...defShape('dungeon'), depth: positiveInt.max(99, 'must be at most 99'), floorType: idSchema('floor') }),
  refs: (def) => [{ path: 'floorType', kind: 'floor type', id: def.floorType }],
};

/** Registers a dungeon variant and returns it. Its shape is checked by `validateContent`. */
export function defineDungeon(def: DungeonDef): DungeonDef {
  return DUNGEONS.register(def);
}

/** The first dungeon, open from the start. */
export const DUNGEON_OLD_DELVE = defineDungeon({
  id: 'dungeon.old_delve',
  name: 'The Old Delve',
  description:
    'A worked-out mine below the town, ten levels of cut halls that something has moved back into. ' +
    'Every new company starts here.',
  tags: ['dungeon'],
  depth: 10,
  floorType: 'floor.halls',
});
