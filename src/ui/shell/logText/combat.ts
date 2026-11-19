/** Log wording for the combat domain's events (`src/sim/combat/`). One entry per event type. */
import { findDef, MONSTERS } from '../../../content';
import type { CombatEvent, EntityId } from '../../../sim';
import { defineHighlight, mention } from './types';
import type { LogPart, LogTextRecord, NameOf } from './types';

/** A blow left an adventurer under a quarter of their HP. */
export const HIGHLIGHT_NEAR_DEATH = defineHighlight({
  id: 'nearDeath',
  label: 'An adventurer is near death',
  description: 'A blow left a party member with less than a quarter of their HP.',
});

/** The share of max HP under which a blow on an adventurer is a near-death highlight. */
export const NEAR_DEATH_FRACTION = 0.25;

/**
 * Who an event is about: a monster as a mention of its kind ("the gloam rat", an Explain link),
 * anyone else by name. `capital` starts the sentence with a capital letter.
 */
function who(id: EntityId, def: string, nameOf: NameOf, capital = false): LogPart[] {
  if (!MONSTERS.has(def)) return [nameOf(id)];
  const name = MONSTERS.get(def).name.toLowerCase();
  return [capital ? 'The ' : 'the ', mention(def, name)];
}

/** A cause of death as a phrase: a monster, a status, or something unknown. */
function causeText(cause: string): LogPart[] {
  if (MONSTERS.has(cause)) return ['killed by a ', mention(cause, MONSTERS.get(cause).name.toLowerCase())];
  const def = findDef(cause);
  if (def !== undefined) return ['killed by ', mention(cause, def.name.toLowerCase())];
  return ['dead of their wounds'];
}

/** What a monster's bolt is called ("gob of bog-slime"), or "bolt". */
function boltName(def: string): string {
  return (MONSTERS.has(def) ? MONSTERS.get(def).bolt?.name : undefined) ?? 'bolt';
}

export const COMBAT_LOG_TEXT: LogTextRecord<CombatEvent> = {
  attacked: {
    category: 'combat',
    highlight: HIGHLIGHT_NEAR_DEATH,
    highlightWhen: (e) => !MONSTERS.has(e.targetDef) && e.hp > 0 && e.hp < e.maxHp * NEAR_DEATH_FRACTION,
    text: (e, nameOf) => [
      ...who(e.actor, e.actorDef, nameOf, true),
      ' hits ',
      ...who(e.target, e.targetDef, nameOf),
      e.ranged === true ? ` with a ${boltName(e.actorDef)}` : '',
      ` for ${e.damage} (${e.hp}/${e.maxHp} HP left).`,
    ],
  },
  missed: {
    category: 'combat',
    text: (e, nameOf) => [
      ...who(e.actor, e.actorDef, nameOf, true),
      ' misses ',
      ...who(e.target, e.targetDef, nameOf),
      e.ranged === true ? ` with a ${boltName(e.actorDef)}` : '',
      '.',
    ],
  },
  aided: {
    category: 'combat',
    text: (e, nameOf) => [
      ...who(e.actor, e.actorDef, nameOf, true),
      e.power === 'mend' ? ' tends the wounds of ' : ' spurs on ',
      ...who(e.target, e.targetDef, nameOf),
      '.',
    ],
  },
  // A monster's death. A party member's is the run domain's `fell` line.
  died: {
    category: 'combat',
    text: (e) => ['The ', mention(e.def, e.name.toLowerCase()), ' dies', ...(e.killer === null ? [', ', ...causeText(e.cause)] : []), '.'],
  },
  killed: {
    category: 'combat',
    // Already said by `died` (a monster) or by the killing blow's `attacked` line and the run
    // domain's `fell` (an adventurer). This event is for trackers (kills, Trophies) and the Codex.
    quiet: true,
    text: (e, nameOf) => [...who(e.killer, e.killerDef, nameOf, true), ' kills ', ...who(e.victim, e.victimDef, nameOf), '.'],
  },
  monsterSighted: {
    category: 'discovery',
    text: (e, nameOf) => [`${nameOf(e.actor)} spots `, ...who(e.monster, e.def, nameOf), '.'],
  },
  recovered: { category: 'combat', quiet: true, text: (e, nameOf) => `${nameOf(e.actor)} catches their breath (+${e.amount} HP).` },
  fleeFailed: {
    category: 'combat',
    text: (e, nameOf) => [`${nameOf(e.actor)} tries to break away, but `, ...who(e.enemy, e.enemyDef, nameOf), ` holds them back (Flee ${e.chance}%).`],
  },
};
