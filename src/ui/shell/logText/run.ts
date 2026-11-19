/** Log wording for the run domain's events (`src/sim/run/`). One entry per event type. */
import { formatNumber } from '../../../core';
import type { RunDomainEvent } from '../../../sim';
import { currencyName } from '../runSummaryText';
import { defineHighlight } from './types';
import type { LogTextRecord } from './types';

/** An adventurer falls (HP reaches 0). */
export const HIGHLIGHT_FELL = defineHighlight({
  id: 'adventurerFell',
  label: 'An adventurer falls',
  description: 'A party member’s HP reaches 0. Their run is over; the rest of the party carries on.',
});

const OUTCOME_TEXT = { victory: 'Victory!', retreat: 'The party is out: a retreat.', wipe: 'The party is lost.' } as const;

function list(names: readonly string[]): string {
  return names.length <= 1 ? (names[0] ?? 'Nobody') : `${names.slice(0, -1).join(', ')} and ${names.at(-1) as string}`;
}

export const RUN_DOMAIN_LOG_TEXT: LogTextRecord<RunDomainEvent> = {
  runStarted: {
    category: 'system',
    text: (e) => `${list(e.party.map((m) => m.name))} ${e.party.length === 1 ? 'enters' : 'enter'} the dungeon, ${e.depth} floors deep.`,
  },
  turnedBack: {
    category: 'ai',
    text: (e, nameOf) =>
      e.actor === null ? 'Retreat ordered: the party turns back for the surface.' : `${nameOf(e.actor)} leads the party back toward the surface.`,
  },
  fell: {
    category: 'combat',
    highlight: HIGHLIGHT_FELL,
    text: (e) => `${e.name} falls on floor ${e.depth}.`,
  },
  earningsLost: {
    category: 'system',
    text: (e) =>
      `The wipe costs ${Math.round(e.share * 100)}% of this run’s earnings: ${list(
        Object.entries(e.lost).map(([key, n]) => `${formatNumber(n)} ${currencyName(key)}`),
      )} lost. The rest is banked.`,
  },
  runEnded: {
    category: 'system',
    text: (e) => `${OUTCOME_TEXT[e.outcome]} ${e.cause}`,
  },
};
