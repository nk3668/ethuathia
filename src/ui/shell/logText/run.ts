/** Log wording for the run domain's events (`src/sim/run/`). One entry per event type. */
import { formatNumber } from '../../../core';
import { ITEMS, MONSTERS, START_PERK_INFO, STATUSES } from '../../../content';
import { deathLine } from '../../../sim';
import type { RunDomainEvent } from '../../../sim';
import { currencyName } from '../runSummaryText';
import { defineHighlight, mention } from './types';
import { onFloor } from './types';
import type { LogPart, LogTextRecord, MomentTextRecord, NameOf } from './types';

/** An adventurer falls (HP reaches 0). */
export const HIGHLIGHT_FELL = defineHighlight({
  id: 'adventurerFell',
  label: 'An adventurer falls',
  description: 'A party member’s HP reaches 0. Their run is over; the rest of the party carries on.',
});

/**
 * A wipe cost part of the run's earnings (ETH-120). A chronicle moment only: it is not a log
 * highlight (the run is over, so there is nothing to pause), so it is not in the Options list.
 */
export const MOMENT_EARNINGS_LOST = defineHighlight({
  id: 'earningsLost',
  label: 'A wipe costs earnings',
  description: 'The whole party fell, and the wipe took its share of the run’s earnings.',
});

const OUTCOME_TEXT = { victory: 'Victory!', retreat: 'The party is out: a retreat.', wipe: 'The party is lost.' } as const;

/** ", with the Smelting Pit's +15%" when the Smithy's trade bonus applied (ETH-159). */
function tradeBonusNote(bonus: number | undefined): string {
  return bonus === undefined ? '' : `, with the Smithy’s +${bonus}%`;
}

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
  // A proper name ("Vell the Unbowed", ETH-117) keeps its capitals in the sentence.
  if (k !== null && k.kind !== 'adventurer') refs.push([k.def, k.proper === true ? k.name : k.name.toLowerCase()]);
  if (k?.source?.kind === 'monster') refs.push([k.source.def, k.source.proper === true ? k.source.name : k.source.name.toLowerCase()]);
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
    text: (e) => {
      const lead = `${list(e.party.map((m) => m.name))} ${e.party.length === 1 ? 'enters' : 'enter'} the dungeon`;
      if (e.depth === null) {
        return e.floorType === null ? `${lead}.` : [`${lead} (`, mention(e.floorType), ').'];
      }
      const floors = `${e.depth} ${e.depth === 1 ? 'floor' : 'floors'} deep`;
      return e.floorType === null ? `${lead}, ${floors}.` : [`${lead} (`, mention(e.floorType), `, ${floors}).`];
    },
  },
  // "Mira shoulders an oak cudgel and a round shield." Each item links to its Codex entry.
  kitIssued: {
    category: 'system',
    text: (e) => {
      const parts: LogPart[] = [`${e.name} shoulders `];
      e.items.forEach((id, i) => {
        const name = ITEMS.has(id) ? ITEMS.get(id).name.toLowerCase() : 'an item';
        // A piece a Smithy upgrade made +1 (ETH-159) says so: "a +1 oak cudgel".
        const plus = e.enchanted?.includes(id) === true;
        // A Forge Stamp (ETH-188) says so: "a keen iron hatchet", "a round shield of warding".
        const stamp = e.stamped?.find((s) => s.item === id)?.stamp;
        const prefix = stamp === 'keen' || stamp === 'nimble' ? `${stamp} ` : '';
        const first = prefix === '' ? name : prefix;
        if (i > 0) parts.push(i === e.items.length - 1 ? ' and ' : ', ');
        parts.push(`${plus ? 'a +1' : /^[aeiou]/.test(first) ? 'an' : 'a'} ${prefix}`, mention(id, name));
        if (stamp === 'warding') parts.push(' of warding');
      });
      parts.push('.');
      return parts;
    },
  },
  // "The party sets out knowing every kind of potion on sight." (ETH-159)
  startKnown: {
    category: 'discovery',
    text: (e) => `The party sets out knowing every kind of ${e.categories.map((c) => START_PERK_INFO[c].plural).join(', ')} on sight.`,
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
  goldSettled: {
    category: 'system',
    text: (e) =>
      e.lost
        ? `All ${formatNumber(e.gold)} leftover gold is lost in the wipe.`
        : `${formatNumber(e.gold)} leftover gold converts to ${formatNumber(e.trophies)} ${e.trophies === 1 ? 'Trophy' : 'Trophies'}${tradeBonusNote(e.bonus)}.`,
  },
  itemsSettled: {
    category: 'system',
    text: (e) => {
      const things = `${formatNumber(e.items)} carried ${e.items === 1 ? 'item' : 'items'}`;
      return e.lost
        ? `${things} (worth ${formatNumber(e.value)}) ${e.items === 1 ? 'is' : 'are'} lost in the wipe.`
        : `${things} ${e.items === 1 ? 'sells' : 'sell'} for ${formatNumber(e.trophies)} ${e.trophies === 1 ? 'Trophy' : 'Trophies'} (value ${formatNumber(e.value)}${tradeBonusNote(e.bonus)}).`;
    },
  },
  runEnded: {
    category: 'system',
    text: (e) => `${OUTCOME_TEXT[e.outcome]} ${e.cause}`,
  },
};

/** What struck a fallen adventurer down, from their chronicle entry: "slain by a slate hound". */
function fellBy(m: { actors: readonly number[]; ids: readonly string[] }, nameOf: NameOf): LogPart[] {
  const def = m.ids[0];
  if (def === undefined) return [];
  if (MONSTERS.has(def)) return [', slain by a ', mention(def, MONSTERS.get(def).name.toLowerCase())];
  if (STATUSES.has(def)) return [', worn down while ', mention(def, STATUSES.get(def).name.toLowerCase())];
  const killer = m.actors[1];
  return killer === undefined ? [] : [`, slain by ${nameOf(killer)}`];
}

/** How the run domain's chronicle moments read (ETH-120). */
export const RUN_DOMAIN_MOMENT_TEXT: MomentTextRecord = {
  adventurerFell: {
    kind: HIGHLIGHT_FELL,
    category: 'combat',
    // "Mira fell on floor 4, slain by a slate hound."
    text: (m, nameOf) => [`${nameOf(m.actors[0] ?? 0)} fell${onFloor(m.depth)}`, ...fellBy(m, nameOf), '.'],
  },
  earningsLost: {
    kind: MOMENT_EARNINGS_LOST,
    category: 'system',
    text: (m) => `The wipe cost ${m.amount ?? 0}% of the run’s earnings.`,
  },
};
