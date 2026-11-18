/** Log wording for the floors domain's events (`src/sim/floors/`). One entry per event type. */
import { FEATURE_FOUNTAIN, findDef } from '../../../content';
import type { FloorsEvent } from '../../../sim';
import { mention } from './types';
import type { LogTextRecord } from './types';

export const FLOORS_LOG_TEXT: LogTextRecord<FloorsEvent> = {
  tookStairs: {
    category: 'discovery',
    text: (e, nameOf) =>
      e.dir === 'down' ? `${nameOf(e.actor)} goes down the stairs to floor ${e.depth}.` : `${nameOf(e.actor)} climbs the stairs to floor ${e.depth}.`,
  },
  // `tookStairs` already says it; this is the hook other systems react to.
  floorEntered: {
    category: 'discovery',
    quiet: true,
    text: (e, nameOf) => `${nameOf(e.actor)} ${e.firstVisit ? 'discovers' : 'returns to'} floor ${e.depth}.`,
  },
  leftDungeon: {
    category: 'discovery',
    text: (e, nameOf) =>
      e.party.length > 1 ? `${nameOf(e.actor)} leads the party up the stairs and out of the dungeon.` : `${nameOf(e.actor)} climbs the stairs and walks out of the dungeon.`,
  },
  drankFountain: {
    category: 'discovery',
    text: (e, nameOf) => [
      `${nameOf(e.actor)} drinks from the `,
      mention(FEATURE_FOUNTAIN.id, 'fountain'),
      ': ',
      mention(e.draught, (findDef(e.draught)?.name ?? e.draught).toLowerCase()),
      e.left === 0 ? '.' : ` (${e.left} ${e.left === 1 ? 'draught' : 'draughts'} left).`,
    ],
  },
  fountainRanDry: {
    category: 'discovery',
    text: () => ['The ', mention(FEATURE_FOUNTAIN.id, 'fountain'), ' runs dry.'],
  },
};
