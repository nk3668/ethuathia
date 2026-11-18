/** Log wording for the stats domain's events (`src/sim/stats/`). One entry per event type. */
import { findDef } from '../../../content';
import type { StatsEvent } from '../../../sim';
import type { LogTextRecord } from './types';

/** A content id's display name, or the id itself. */
function nameOfDef(id: string): string {
  return findDef(id)?.name ?? id;
}

/** ` (×1.5)` for a potency other than 1, else nothing. */
function potencyText(potency: number): string {
  return potency === 1 ? '' : ` ×${Math.round(potency * 100) / 100}`;
}

function turnsText(turns: number): string {
  return `${turns} turn${turns === 1 ? '' : 's'}`;
}

/** How each way of applying reads after the status name. */
const APPLIED_TAIL = {
  new: '',
  refreshed: ' again, refreshed',
  extended: ' for longer',
  stacked: ' again, stacking',
} as const;

export const STATS_LOG_TEXT: LogTextRecord<StatsEvent> = {
  statusApplied: {
    category: 'combat',
    text: (e, nameOf) =>
      `${nameOf(e.actor)} is ${nameOfDef(e.status)}${potencyText(e.potency)}${APPLIED_TAIL[e.mode]} (${turnsText(e.turns)}).`,
  },
  statusExpired: { category: 'combat', text: (e, nameOf) => `${nameOf(e.actor)} is no longer ${nameOfDef(e.status)}.` },
  statusRemoved: { category: 'combat', text: (e, nameOf) => `${nameOf(e.actor)} is cured of ${nameOfDef(e.status)}.` },
  healed: { category: 'combat', text: (e, nameOf) => `${nameOf(e.actor)} heals ${e.amount} HP (${nameOfDef(e.source)}).` },
  damaged: { category: 'combat', text: (e, nameOf) => `${nameOf(e.actor)} loses ${e.amount} HP (${nameOfDef(e.source)}).` },
};
