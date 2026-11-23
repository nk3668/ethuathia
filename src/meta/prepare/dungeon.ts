/**
 * The dungeon section (CLAUDE.md §2, step 6): which dungeon variant the run descends into
 * (`src/content/dungeons.ts`). It sets the run's `dungeonId`; a variant the profile can't use
 * falls back to the first available one.
 */
import { z } from 'zod';
import { DUNGEON_OLD_DELVE } from '../../content';
import type { DungeonDef } from '../../content';
import { idSchema } from '../../content/schema';
import type { Profile } from '../profile';
import { availableDungeons } from './available';
import { defineRunChoice } from './choice';

export interface DungeonChoice {
  /** A dungeon variant id (`dungeon.old_delve`). */
  readonly dungeonId: string;
}

/** The variant a run with this choice uses: the chosen one if available, else the first available. */
export function chosenDungeon(profile: Profile, choice: DungeonChoice): DungeonDef {
  const open = availableDungeons(profile);
  const chosen = open.find((d) => d.id === choice.dungeonId) ?? open[0];
  if (chosen === undefined) throw new RangeError('No dungeon is available');
  return chosen;
}

export const DUNGEON_CHOICE = defineRunChoice<DungeonChoice>({
  schema: z.object({ dungeonId: idSchema('dungeon') }),
  init: () => ({ dungeonId: DUNGEON_OLD_DELVE.id }),
  apply: ({ profile, config }, choice) => {
    config.dungeonId = chosenDungeon(profile, choice).id;
  },
});
