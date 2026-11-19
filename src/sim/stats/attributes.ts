/**
 * Attributes and the stats derived from them (ETH-033, docs/ARCHITECTURE.md Contracts, "Stats").
 *
 * An actor's attribute = its class's value + its race's adjustment + its class's growth for its
 * level (ETH-034) + its own points (`stats.attributes`; for an actor without a class, its whole
 * value).
 * The `stats.attributes` provider turns attributes into stat parts through `ATTRIBUTE_FORMULAS`,
 * the one table of derivation constants: tune balance there.
 */
import { ATTRIBUTE_IDS, attributeDef, attributeDefId, CLASSES, RACES, UNARMED_ATTRIBUTE } from '../../content';
import type { AttributeId } from '../../content';
import type { Entity } from '../state';
import { growthOf, levelOf } from './leveling';
import type { StatId } from './statIds';
import type { StatProvider } from './types';

/**
 * One derivation: `stat` gains `(attribute − from) × perPoint`. With `from` 0 the attribute
 * builds the stat from nothing (Grit → max HP); with `from` at `ATTRIBUTE_NEUTRAL` an average
 * attribute adds nothing and only the points above or below it count (Finesse → accuracy).
 */
export interface AttributeFormula {
  readonly stat: StatId;
  readonly attribute: AttributeId;
  readonly perPoint: number;
  readonly from: number;
}

/** An unremarkable attribute value: formulas measured from it add nothing at exactly this value. */
export const ATTRIBUTE_NEUTRAL = 10;

/**
 * Damage from an attribute: half a point per point above 10, from `UNARMED_ATTRIBUTE` (Brawn).
 * A wielded weapon whose type `scalesWith` another attribute swaps that attribute in (ETH-082):
 * the weapon scaling item property (`src/sim/items/scaling.ts`) takes this row back off and adds
 * the same formula for the weapon's attribute, so stats, tooltips and gear comparison agree.
 */
export const DAMAGE_FORMULA: AttributeFormula = { stat: 'damage', attribute: UNARMED_ATTRIBUTE, perPoint: 0.5, from: ATTRIBUTE_NEUTRAL };

/**
 * Every stat each attribute derives, in tooltip order. A starting Human Vanguard (Brawn 12,
 * Finesse 10, Wits 5, Grit 14) gets 20 max HP, 5 MP, 0 accuracy and evasion, 1 damage, 24 carry.
 */
export const ATTRIBUTE_FORMULAS: readonly AttributeFormula[] = [
  { stat: 'hp', attribute: 'grit', perPoint: 1, from: 0 },
  { stat: 'hp', attribute: 'brawn', perPoint: 0.5, from: 0 },
  { stat: 'mp', attribute: 'wits', perPoint: 1, from: 0 },
  { stat: 'accuracy', attribute: 'finesse', perPoint: 1, from: ATTRIBUTE_NEUTRAL },
  { stat: 'evasion', attribute: 'finesse', perPoint: 1, from: ATTRIBUTE_NEUTRAL },
  DAMAGE_FORMULA,
  { stat: 'carry', attribute: 'brawn', perPoint: 2, from: 0 },
  // Second jobs (ETH-081): the skill chances, in percent, on top of their `STAT_INFO` bases. The
  // same Vanguard has Identify 15%, Trap spotting 25%, Status resistance 28%, Disarm 50%,
  // Flee 70% and Force doors 48%.
  { stat: 'identify', attribute: 'wits', perPoint: 3, from: 0 },
  { stat: 'trapSpot', attribute: 'wits', perPoint: 3, from: 0 },
  { stat: 'statusResist', attribute: 'grit', perPoint: 2, from: 0 },
  { stat: 'disarm', attribute: 'finesse', perPoint: 3, from: 0 },
  { stat: 'flee', attribute: 'finesse', perPoint: 3, from: 0 },
  { stat: 'forceDoor', attribute: 'brawn', perPoint: 4, from: 0 },
];

/** One contribution to an attribute, for its tooltip: a class, a race, or the actor's own points. */
export interface AttributePart {
  value: number;
  source: { id: string; label: string };
}

/** An attribute's value and what makes it up. */
export interface AttributeResult {
  attribute: AttributeId;
  value: number;
  parts: AttributePart[];
}

/** True if `entity` has attributes at all: an adventurer, or an actor given its own points. */
export function hasAttributes(entity: Entity): boolean {
  return entity.adventurer !== undefined || entity.stats?.attributes !== undefined;
}

function collectAttribute(entity: Entity, attribute: AttributeId, sink: (value: number, id: string, label: string) => void): void {
  const a = entity.adventurer;
  if (a !== undefined) {
    const cls = CLASSES.get(a.classId);
    sink(cls.attributes[attribute], cls.id, cls.name);
    const race = RACES.get(a.raceId);
    sink(race.attributes[attribute] ?? 0, race.id, race.name);
    // Class growth rolled at each level-up (ETH-034, ETH-110), credited to the class: "Level 3".
    const level = levelOf(entity);
    if (level > 1) sink(growthOf(entity, attribute), cls.id, `Level ${level}`);
  }
  const own = entity.stats?.attributes?.[attribute];
  if (own !== undefined) sink(own, entity.def, a === undefined ? 'Base' : 'Trained');
}

/** The value of `attribute` on `entity`: class + race + its own points. 0 for an entity without attributes. */
export function attributeValue(entity: Entity, attribute: AttributeId): number {
  let total = 0;
  collectAttribute(entity, attribute, (v) => (total += v));
  return total;
}

/** The value of `attribute` on `entity` with each part that isn't 0, labeled for a tooltip. */
export function getAttribute(entity: Entity, attribute: AttributeId): AttributeResult {
  const parts: AttributePart[] = [];
  let value = 0;
  collectAttribute(entity, attribute, (v, id, label) => {
    value += v;
    if (v !== 0) parts.push({ value: v, source: { id, label } });
  });
  return { attribute, value, parts };
}

/** Every attribute of `entity`, keyed by id, with parts. */
export function getAttributes(entity: Entity): Record<AttributeId, AttributeResult> {
  const out = {} as Record<AttributeId, AttributeResult>;
  for (const attribute of ATTRIBUTE_IDS) out[attribute] = getAttribute(entity, attribute);
  return out;
}

/** The formulas that derive `stat`, cached per stat (the table never changes). */
const FORMULAS_BY_STAT = new Map<StatId, AttributeFormula[]>();
for (const f of ATTRIBUTE_FORMULAS) {
  const list = FORMULAS_BY_STAT.get(f.stat) ?? [];
  list.push(f);
  FORMULAS_BY_STAT.set(f.stat, list);
}

/** The formulas that derive from `attribute`, in table order: for Codex and tooltip text. */
export function formulasFor(attribute: AttributeId): AttributeFormula[] {
  return ATTRIBUTE_FORMULAS.filter((f) => f.attribute === attribute);
}

/**
 * Stat parts from attributes, one per formula row, credited to the attribute
 * (`attribute.grit`) and labeled with its name and value, e.g. "Grit 14".
 */
export const PROVIDER_ATTRIBUTES: StatProvider = {
  id: 'stats.attributes',
  contribute(_state, entity, stat, sink) {
    const formulas = FORMULAS_BY_STAT.get(stat);
    if (formulas === undefined || !hasAttributes(entity)) return;
    for (const f of formulas) {
      const value = attributeValue(entity, f.attribute);
      sink('add', (value - f.from) * f.perPoint, attributeDefId(f.attribute), `${attributeDef(f.attribute).name} ${value}`);
    }
  },
};
