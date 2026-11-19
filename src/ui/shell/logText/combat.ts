/** Log wording for the combat domain's events (`src/sim/combat/`). One entry per event type. */
import { findDef, MONSTERS } from '../../../content';
import { isNearDeathBlow } from '../../../sim';
import type { CombatEvent, DroppedLoot, EntityId, EventNames } from '../../../sim';
import { defineHighlight, mention } from './types';
import { onFloor } from './types';
import type { LogPart, LogTextRecord, MomentTextRecord, NameOf } from './types';

/** A blow left an adventurer under a quarter of their HP. */
export const HIGHLIGHT_NEAR_DEATH = defineHighlight({
  id: 'nearDeath',
  label: 'An adventurer is near death',
  description: 'A blow left a party member with less than a quarter of their HP.',
});

/**
 * Who an event is about: a monster as a mention of its kind ("the gloam rat", an Explain link),
 * with its templates when the event names it ("the venomous gloam rat", ETH-117) or by its own
 * name ("Vell the Unbowed"); anyone else by name. `capital` starts the sentence with a capital letter.
 */
function who(id: EntityId, def: string, nameOf: NameOf, capital = false, names?: EventNames): LogPart[] {
  if (!MONSTERS.has(def)) return [nameOf(id)];
  const shown = names?.[id];
  if (shown?.proper === true) return [mention(def, shown.name)];
  const name = (shown?.name ?? MONSTERS.get(def).name).toLowerCase();
  return [capital ? 'The ' : 'the ', mention(def, name)];
}

/** What a dying monster dropped (ETH-117), as the items log names items: ", dropping Ember blade and Mending draught ×2". */
function dropsText(drops: readonly DroppedLoot[] | undefined): LogPart[] {
  if (drops === undefined || drops.length === 0) return [];
  const parts: LogPart[] = [', dropping '];
  drops.forEach((d, i) => {
    if (i > 0) parts.push(i === drops.length - 1 ? ' and ' : ', ');
    parts.push(mention(d.item, d.name), d.qty > 1 ? ` ×${d.qty}` : '');
  });
  return parts.filter((p) => p !== '');
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
    // The same test as the sim's chronicle rule, so the log and the chronicle agree (ETH-120).
    highlightWhen: isNearDeathBlow,
    text: (e, nameOf) => [
      ...who(e.actor, e.actorDef, nameOf, true, e.names),
      ' hits ',
      ...who(e.target, e.targetDef, nameOf, false, e.names),
      e.ranged === true ? ` with a ${boltName(e.actorDef)}` : '',
      ` for ${e.damage} (${e.hp}/${e.maxHp} HP left).`,
    ],
  },
  missed: {
    category: 'combat',
    text: (e, nameOf) => [
      ...who(e.actor, e.actorDef, nameOf, true, e.names),
      ' misses ',
      ...who(e.target, e.targetDef, nameOf, false, e.names),
      e.ranged === true ? ` with a ${boltName(e.actorDef)}` : '',
      '.',
    ],
  },
  aided: {
    category: 'combat',
    text: (e, nameOf) => [
      ...who(e.actor, e.actorDef, nameOf, true, e.names),
      e.power === 'mend' ? ' tends the wounds of ' : ' spurs on ',
      ...who(e.target, e.targetDef, nameOf, false, e.names),
      '.',
    ],
  },
  // A monster's death. A party member's is the run domain's `fell` line.
  died: {
    category: 'combat',
    // "The venomous gloam rat dies, dropping an Ember blade." / "Vell the Unbowed dies." (ETH-117)
    text: (e) => [
      ...(e.proper === true ? [mention(e.def, e.name)] : ['The ', mention(e.def, e.name.toLowerCase())]),
      ' dies',
      ...(e.killer === null ? [', ', ...causeText(e.cause)] : []),
      ...dropsText(e.drops),
      '.',
    ],
  },
  killed: {
    category: 'combat',
    // Already said by `died` (a monster) or by the killing blow's `attacked` line and the run
    // domain's `fell` (an adventurer). This event is for trackers (kills, Trophies) and the Codex.
    quiet: true,
    text: (e, nameOf) => [...who(e.killer, e.killerDef, nameOf, true, e.names), ' kills ', ...who(e.victim, e.victimDef, nameOf, false, e.names), '.'],
  },
  monsterSighted: {
    category: 'discovery',
    text: (e, nameOf) => [`${nameOf(e.actor)} spots `, ...who(e.monster, e.def, nameOf, false, e.names), '.'],
  },
  recovered: { category: 'combat', quiet: true, text: (e, nameOf) => `${nameOf(e.actor)} catches their breath (+${e.amount} HP).` },
  fleeFailed: {
    category: 'combat',
    text: (e, nameOf) => [`${nameOf(e.actor)} tries to break away, but `, ...who(e.enemy, e.enemyDef, nameOf, false, e.names), ` holds them back (Flee ${e.chance}%).`],
  },
};

/** How the combat domain's chronicle moments read (ETH-120). */
export const COMBAT_MOMENT_TEXT: MomentTextRecord = {
  nearDeath: {
    kind: HIGHLIGHT_NEAR_DEATH,
    category: 'combat',
    // "Mira was left with 2 HP by the gloam rat on floor 3."
    text: (m, nameOf) => [
      `${nameOf(m.actors[0] ?? 0)} was left with ${m.amount ?? 0} HP by `,
      ...who(m.actors[1] ?? 0, m.ids[0] ?? '', nameOf),
      `${onFloor(m.depth)}.`,
    ],
  },
};
