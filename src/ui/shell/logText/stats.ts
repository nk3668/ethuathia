/** Log wording for the stats domain's events (`src/sim/stats/`). One entry per event type. */
import { ATTRIBUTE_IDS, attributeDef, findDef } from '../../../content';
import type { AttributeId } from '../../../content';
import { rewardBonusText, scopeWords } from '../../../sim';
import type { StatsEvent } from '../../../sim';
import { defineHighlight } from './types';
import { onFloor } from './types';
import type { LogTextRecord, MomentTextRecord } from './types';

/** An adventurer gains a level (ETH-034). */
export const HIGHLIGHT_LEVEL_UP = defineHighlight({
  id: 'leveledUp',
  label: 'An adventurer levels up',
  description: 'A party member earns enough XP for a new level, and their class’s attributes grow.',
});

/** `: Brawn +1, Grit +2` for the attributes a level raised, in display order; nothing if none. */
function gainsText(gains: Partial<Record<AttributeId, number>>): string {
  const parts = ATTRIBUTE_IDS.flatMap((a) => {
    const n = gains[a] ?? 0;
    return n === 0 ? [] : [`${attributeDef(a).name} +${n}`];
  });
  return parts.length === 0 ? '' : `: ${parts.join(', ')}`;
}

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
      `${nameOf(e.actor)} is ${nameOfDef(e.status)}${potencyText(e.potency)}${APPLIED_TAIL[e.mode]} (${turnsText(e.turns)}` +
      `${e.resisted === undefined ? '' : `; shrugged off ${turnsText(e.resisted)}`}).`,
  },
  statusExpired: { category: 'combat', text: (e, nameOf) => `${nameOf(e.actor)} is no longer ${nameOfDef(e.status)}.` },
  statusRemoved: { category: 'combat', text: (e, nameOf) => `${nameOf(e.actor)} is cured of ${nameOfDef(e.status)}.` },
  healed: { category: 'combat', text: (e, nameOf) => `${nameOf(e.actor)} heals ${e.amount} HP (${nameOfDef(e.source)}).` },
  damaged: { category: 'combat', text: (e, nameOf) => `${nameOf(e.actor)} loses ${e.amount} HP (${nameOfDef(e.source)}).` },
  // Every kill and new floor earns XP: too frequent for the log, so only level-ups show.
  xpGained: {
    category: 'combat',
    quiet: true,
    text: (e, nameOf) =>
      `${nameOf(e.actor)} earns ${e.amount} XP (${e.reason === 'kill' ? nameOfDef(e.source) : 'a new depth'}).`,
  },
  leveledUp: {
    category: 'combat',
    highlight: HIGHLIGHT_LEVEL_UP,
    text: (e) => `${e.name} reaches level ${e.level}${gainsText(e.gains)}.`,
  },
  // Run-wide modifiers (ETH-115): an Omen, a blessing, a curse or a dungeon event takes hold or ends.
  runModifierAdded: {
    category: 'system',
    text: (e) =>
      `${e.atStart === true ? 'This run is under' : e.replaced === true ? 'Renewed:' : 'Now in force:'} ${e.source.label}, ` +
      `affecting ${scopeWords(e.scope)}${e.rewardBonus === undefined || e.rewardBonus === 0 ? '' : ` (rewards ${rewardBonusText(e.rewardBonus)})`}.`,
  },
  runModifierRemoved: {
    category: 'system',
    text: (e) => `${e.source.label} ${e.reason === 'expired' ? 'has run its course' : 'no longer holds'}.`,
  },
};

/** How the stats domain's chronicle moments read (ETH-120). */
export const STATS_MOMENT_TEXT: MomentTextRecord = {
  leveledUp: {
    kind: HIGHLIGHT_LEVEL_UP,
    category: 'combat',
    text: (m, nameOf) => `${nameOf(m.actors[0] ?? 0)} reached level ${m.amount ?? '?'}${onFloor(m.depth)}.`,
  },
};
