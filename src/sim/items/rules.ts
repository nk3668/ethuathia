/**
 * The items domain's rule conditions and rule actions (docs/ARCHITECTURE.md §4, CLAUDE.md §5.3):
 * quaffing healing when hurt, dropping the least valuable thing when overloaded, and picking up
 * what is worth having when it is close. The baseline uses them through `ITEMS_BASELINE_URGENT`
 * and `ITEMS_BASELINE_LOOT` (spliced into `BASELINE_RULES` in `ai/engine.ts`), and the Library can
 * hand each one to the player's own rules.
 */
import type { Pos } from '../../core';
import { EQUIP_SLOT_INFO, gearSlots, healAmount, ITEMS } from '../../content';
import { aiPathGrid, followMap } from '../ai/navigate';
import { defineCondition, defineRuleAction, noParams } from '../ai/types';
import type { AiCtx, ConditionDef, ParamParser, Resolved, Rule, RuleActionDef } from '../ai/types';
import { getFloor } from '../entities';
import { buildGoalMap, UNREACHABLE } from '../goalMap';
import { statValue } from '../stats/getStat';
import { bestUpgrade, gearStatsText } from './equipment';
import { itemDef } from './instance';
import type { ItemInstance } from './instance';
import { itemName } from './name';
import { carryLimit, carryWeight, inventoryOf, isOverloaded, itemsAt, knownItems, lowestValueIndex, wantsItem } from './inventory';
import { itemValue } from './value';

/** How far (in steps) the baseline goes out of its way for an item it wants. */
export const PICKUP_DETOUR = 8;

/** The baseline quaffs healing below this share of max HP, in percent. */
export const HEAL_BELOW_PERCENT = 35;

const turns = (n: number) => `${n} ${n === 1 ? 'turn' : 'turns'}`;

/** Reads `{ [key]: whole number from min to max }`, with a default when left out. */
function numberParam<K extends string>(key: K, fallback: number, min: number, max: number): ParamParser<Record<K, number>> {
  return (raw) => {
    if (raw === undefined || raw === null) return { [key]: fallback } as Record<K, number>;
    if (typeof raw !== 'object' || Array.isArray(raw)) return 'Params must be an object';
    const { [key]: value, ...rest } = raw as Record<string, unknown>;
    if (Object.keys(rest).length > 0) return `Unknown parameter "${Object.keys(rest)[0] as string}"`;
    if (value === undefined) return { [key]: fallback } as Record<K, number>;
    if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
      return `"${key}" must be a whole number from ${min} to ${max}`;
    }
    return { [key]: value } as Record<K, number>;
  };
}

// ---------------------------------------------------------------------------------------------
// Conditions

/** True while the actor's HP is below `percent` of its maximum. */
export const COND_WOUNDED = defineCondition({
  id: 'cond.wounded',
  name: 'Wounded',
  description: 'True while the adventurer’s HP is below a share of its maximum.',
  parse: numberParam('percent', HEAL_BELOW_PERCENT, 1, 99),
  evaluate({ state, actor }, { percent }) {
    const max = statValue(state, actor, 'hp');
    const hp = actor.actor.hp;
    return hp > 0 && hp * 100 < max * percent ? { ok: true, detail: `HP ${hp}/${max}, below ${percent}%` } : { ok: false, detail: '' };
  },
  describe: ({ percent }) => `HP below ${percent}%`,
});

/** True while the actor carries more than its `carry` stat allows. */
export const COND_OVERLOADED = defineCondition({
  id: 'cond.overloaded',
  name: 'Overloaded',
  description: 'True while the adventurer carries more weight than it can manage (its Carry stat).',
  parse: noParams,
  evaluate({ state, actor }) {
    if (!isOverloaded(state, actor)) return { ok: false, detail: '' };
    return { ok: true, detail: `carrying ${carryWeight(state, actor)} of ${carryLimit(state, actor)}` };
  },
  describe: () => 'overloaded',
});

// ---------------------------------------------------------------------------------------------
// Rule actions

/**
 * The healing potion to quaff: the weakest one that still covers the missing HP, else the
 * strongest. `null` if the pack has none.
 */
export function bestHealing(ctx: AiCtx): { index: number; heal: number } | null {
  const { state, actor } = ctx;
  const missing = statValue(state, actor, 'hp') - actor.actor.hp;
  let cover: { index: number; heal: number } | null = null;
  let strongest: { index: number; heal: number } | null = null;
  for (const [index, item] of inventoryOf(actor).entries()) {
    const def = itemDef(item);
    const heal = healAmount(def);
    if (def.category !== 'potion' || heal <= 0) continue;
    if (heal >= missing && (cover === null || heal < cover.heal)) cover = { index, heal };
    if (strongest === null || heal > strongest.heal) strongest = { index, heal };
  }
  return cover ?? strongest;
}

/** Quaff the healing potion that best fits the missing HP. */
export const ACT_QUAFF_HEALING = defineRuleAction({
  id: 'act.quaff_healing',
  name: 'Quaff healing',
  description:
    'Drink a healing potion from the pack: the weakest one that still heals all the missing HP, or the strongest if none does. ' +
    'Can’t be done without one.',
  parse: noParams,
  resolve(ctx): Resolved | null {
    const best = bestHealing(ctx);
    if (best === null) return null;
    const name = itemName(ctx.state, inventoryOf(ctx.actor)[best.index] as ItemInstance, ctx.actor);
    return { request: { id: 'use', index: best.index }, detail: `quaffing a ${name}` };
  },
  describe: () => 'quaff the best healing potion',
});

/** Drop the least valuable droppable thing carried: as many of that stack as needed to get within carry. */
export const ACT_DROP_LOWEST = defineRuleAction({
  id: 'act.drop_lowest',
  name: 'Drop the least valuable',
  description:
    'Put down the least valuable thing in the pack (never a relic, nor something that weighs nothing), as many of a stack as it takes to get within the carry limit.',
  parse: noParams,
  resolve({ state, actor }): Resolved | null {
    const index = lowestValueIndex(state, actor);
    if (index === null) return null;
    const entry = inventoryOf(actor)[index] as ItemInstance;
    const def = itemDef(entry);
    // As many as it takes to get within carry, at most the whole stack: the same as dropping them
    // one by one, since the rest of that stack stays the least valuable thing carried.
    const excess = carryWeight(state, actor) - carryLimit(state, actor);
    const qty = Math.max(1, Math.min(entry.qty, Math.ceil(excess / def.weight)));
    const name = itemName(state, entry, actor);
    const what = qty === 1 ? `a ${name}` : `${qty} × ${name}`;
    return { request: { id: 'drop', index, qty }, detail: `dropping ${what}, the least valuable thing carried` };
  },
  describe: () => 'drop the least valuable item',
});

/** The tile index of `pos` on the actor's floor. */
function tileIndex(ctx: AiCtx, pos: Pos): number {
  return pos.y * getFloor(ctx.state, ctx.actor.floor).terrain.width + pos.x;
}

/**
 * Pick up items worth having: one on the actor's tile now (the most valuable it wants), or else
 * walk to the nearest remembered one it wants, if it is at most `maxDetour` steps away. Junk and
 * corpses are never picked up (`wantsItem`).
 */
export const ACT_PICK_UP = defineRuleAction({
  id: 'act.pick_up',
  name: 'Pick up items',
  description:
    'Pick up items worth having that the party has seen nearby, walking over to them if they are close. Junk is left ' +
    'where it lies, and nothing is taken that would only have to be dropped again.',
  parse: numberParam('maxDetour', PICKUP_DETOUR, 0, 200),
  resolve(ctx, { maxDetour }): Resolved | null {
    const { state, actor } = ctx;
    let best: { id: number; value: number; name: string } | null = null;
    for (const e of itemsAt(state, actor.floor, actor.pos)) {
      if (!wantsItem(state, actor, e.item)) continue;
      const value = itemValue(state, e.item);
      if (best === null || value > best.value) best = { id: e.id, value, name: itemName(state, e.item, actor) };
    }
    if (best !== null) return { request: { id: 'pickup', item: best.id }, detail: `picking up the ${best.name}` };

    const width = getFloor(state, actor.floor).terrain.width;
    const here = tileIndex(ctx, actor.pos);
    const goals: { pos: Pos; name: string }[] = [];
    for (const [key, list] of Object.entries(knownItems(state, actor.floor))) {
      const i = Number(key);
      if (i === here) continue;
      const wanted = list.find((k) => ITEMS.has(k.def) && wantsItem(state, actor, { def: k.def, qty: k.qty }));
      if (wanted !== undefined) goals.push({ pos: { x: i % width, y: Math.floor(i / width) }, name: ITEMS.get(wanted.def).name });
    }
    if (goals.length === 0) return null;
    const paths = aiPathGrid(ctx);
    // The nearest goal, measured from the actor; then the route to just that one.
    const fromActor = buildGoalMap(paths, [actor.pos]);
    let target: { pos: Pos; name: string; cost: number } | null = null;
    for (const g of goals) {
      const cost = fromActor.get(g.pos.x, g.pos.y);
      if (cost !== UNREACHABLE && cost <= maxDetour && (target === null || cost < target.cost)) target = { ...g, cost };
    }
    if (target === null) return null;
    const map = buildGoalMap(paths, [target.pos]);
    const cost = map.get(actor.pos.x, actor.pos.y);
    if (cost === UNREACHABLE) return null;
    return followMap(ctx, paths, map, `going for a ${target.name}, ${turns(cost)} away`);
  },
  describe: ({ maxDetour }) => `pick up items within ${maxDetour} steps`,
});

/**
 * Put on a clear upgrade from the pack (ETH-043, `bestUpgrade`): gear at least as good as what is
 * worn in its slot in every stat and better in one. Gear with a tradeoff is left alone.
 */
export const ACT_EQUIP_UPGRADE = defineRuleAction({
  id: 'act.equip_upgrade',
  name: 'Equip upgrades',
  description:
    'Put on a weapon or piece of armor from the pack that is clearly better than what is worn in its slot: at least as good in every ' +
    'stat and better in one. Gear with a tradeoff (more damage but less accuracy, say) is left for the player to decide.',
  parse: noParams,
  resolve({ state, actor }): Resolved | null {
    const up = bestUpgrade(state, actor);
    if (up === null) return null;
    const name = itemName(state, up.item, actor);
    const stats = gearStatsText(state, actor, up.item);
    const what = stats === null ? `the ${name}` : `the ${name} (${stats})`;
    const instead = up.replaces === null ? `, nothing worn there yet` : ` in place of the ${itemName(state, up.replaces, actor)}`;
    const where = gearSlotsCount(up.item) > 1 ? ` (${EQUIP_SLOT_INFO[up.slot].label.toLowerCase()})` : '';
    return { request: { id: 'equip', index: up.index, slot: up.slot }, detail: `equipping ${what}${where}${instead}` };
  },
  describe: () => 'equip clear upgrades',
});

function gearSlotsCount(item: ItemInstance): number {
  return gearSlots(itemDef(item)).length;
}

/** The items domain's conditions, in registration order. */
export const ITEMS_CONDITIONS: readonly ConditionDef[] = [COND_WOUNDED, COND_OVERLOADED];

/** The items domain's rule actions, in registration order. */
export const ITEMS_RULE_ACTIONS: readonly RuleActionDef[] = [ACT_QUAFF_HEALING, ACT_DROP_LOWEST, ACT_PICK_UP, ACT_EQUIP_UPGRADE];

/**
 * The baseline's urgent item rules, checked first: quaff healing below `HEAL_BELOW_PERCENT` HP;
 * while overloaded, first put on a clear upgrade from the pack (worn gear doesn't count against
 * Carry, so that may be enough), then drop the least valuable thing. Putting the upgrade on first
 * keeps the AI from dropping things it would pick up again once the upgrade is worn.
 */
export const ITEMS_BASELINE_URGENT: readonly Rule[] = [
  { condition: { id: 'cond.wounded', params: { percent: HEAL_BELOW_PERCENT } }, action: { id: 'act.quaff_healing' }, enabled: true },
  { condition: { id: 'cond.overloaded' }, action: { id: 'act.equip_upgrade' }, enabled: true },
  { condition: { id: 'cond.overloaded' }, action: { id: 'act.drop_lowest' }, enabled: true },
];

/**
 * The baseline's gear and looting rules, checked just before exploring (so never next to an
 * enemy): put on clear upgrades (ETH-043), then pick up wanted items within `PICKUP_DETOUR` steps.
 */
export const ITEMS_BASELINE_LOOT: readonly Rule[] = [
  { condition: { id: 'cond.always' }, action: { id: 'act.equip_upgrade' }, enabled: true },
  { condition: { id: 'cond.always' }, action: { id: 'act.pick_up', params: { maxDetour: PICKUP_DETOUR } }, enabled: true },
];
