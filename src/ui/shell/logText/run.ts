/** Log wording for the run domain's events (`src/sim/run/`). One entry per event type. */
import { formatNumber } from '../../../core';
import { deathLine } from '../../../sim';
import type { RunDomainEvent } from '../../../sim';
import { currencyName } from '../runSummaryText';
import { defineHighlight, mention } from './types';
import type { LogPart, LogTextRecord } from './types';

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

/**
 * "Mira is slain by a slate hound on floor 4." (ETH-075), worded by the sim's `deathLine`, with
 * the killer's monster or status (and a status's inflicter) as Codex mentions.
 */
function fellText(e: Extract<RunDomainEvent, { type: 'fell' }>): LogPart[] {
  const sentence = `${deathLine(e.name, e.killer, e.depth, 'present')}.`;
  const k = e.killer;
  const refs: [string, string][] = [];
  if (k !== null && k.kind !== 'adventurer') refs.push([k.def, k.name.toLowerCase()]);
  if (k?.source?.kind === 'monster') refs.push([k.source.def, k.source.name.toLowerCase()]);
  const parts: LogPart[] = [];
  let rest = sentence.slice(e.name.length);
  for (const [ref, label] of refs) {
    const at = rest.indexOf(label);
    if (at < 0) continue;
    parts.push(rest.slice(0, at), mention(ref, label));
    rest = rest.slice(at + label.length);
  }
  return [e.name, ...parts, rest].filter((p) => p !== '');
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
    // "Mira is slain by a slate hound on floor 4." The killer's kind links to its Codex entry.
    text: (e) => fellText(e),
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
