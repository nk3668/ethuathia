/**
 * The items domain's rule conditions and rule actions (docs/ARCHITECTURE.md §4, CLAUDE.md §5.3):
 * quaffing healing when hurt, dropping the least valuable thing when overloaded, and picking up
 * what is worth having when it is close. The baseline uses them through `ITEMS_BASELINE_URGENT`
 * and `ITEMS_BASELINE_LOOT` (spliced into `BASELINE_RULES` in `ai/engine.ts`), and the Library can
 * hand each one to the player's own rules.
 */
import type { Pos } from '../../core';
import { EQUIP_SLOT_INFO, gearSlots, hasEffectKind, healAmount, ITEMS } from '../../content';
import { aiPathGrid, followMap } from '../ai/navigate';
import { defineCondition, defineRuleAction, noParams } from '../ai/types';
import type { AiCtx, ConditionDef, ParamParser, Resolved, Rule, RuleActionDef } from '../ai/types';
import { getFloor } from '../entities';
import { buildGoalMap, UNREACHABLE } from '../goalMap';
import { statValue } from '../stats/getStat';
import type { Entity, RunState } from '../state';
import { isCursed } from './enchant';
import { avoidThreats, visibleThreats } from '../combat/threat';
import { knownStairs } from '../floors/rules';
import { bestUpgrade, gearStatsText, wornItems } from './equipment';
import { appearanceName, isInstanceTypeKnown, isItemIdentified, isTypeIdentified } from './identify';
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

/** The pack index of the first scroll whose type is still unknown, or `null`. */
function unknownScrollIndex(state: RunState, actor: Entity): number | null {
  const index = inventoryOf(actor).findIndex((item) => itemDef(item).category === 'scroll' && !isInstanceTypeKnown(state, item));
  return index < 0 ? null : index;
}

/**
 * True while the actor carries a scroll it can't identify yet and can test it without risk: no
 * enemy in sight, healthy, a known way out. The engine checks a rule's condition before its action
 * resolves, so the cheap test (is there anything to test?) comes first and the goal maps behind
 * "a known way out" are built only for an adventurer that holds an unknown scroll.
 */
export const COND_SAFE_TO_TEST = defineCondition({
  id: 'cond.safe_to_test',
  name: 'Safe to test a scroll',
  description:
    'True while the adventurer carries a scroll of unknown type, no threat is in sight, HP is above the healing threshold and stairs it remembers can be reached: a calm moment to try something unknown.',
  parse: noParams,
  evaluate(ctx) {
    const { state, actor } = ctx;
    if (unknownScrollIndex(state, actor) === null) return { ok: false, detail: '' };
    if (visibleThreats(state, actor).length > 0) return { ok: false, detail: '' };
    const max = statValue(state, actor, 'hp');
    if (actor.actor.hp * 100 < max * HEAL_BELOW_PERCENT) return { ok: false, detail: '' };
    const paths = aiPathGrid(ctx);
    for (const dir of ['down', 'up'] as const) {
      const stairs = knownStairs(state, actor.floor, dir);
      if (stairs === null) continue;
      if (buildGoalMap(paths, [stairs]).get(actor.pos.x, actor.pos.y) !== UNREACHABLE) {
        return { ok: true, detail: `no enemy in sight, healthy, stairs ${dir} in reach` };
      }
    }
    return { ok: false, detail: '' };
  },
  describe: () => 'safe to test an unknown scroll',
});

/** True while the actor is wearing at least one cursed item (ETH-044). */
export const COND_WEARING_CURSED = defineCondition({
  id: 'cond.wearing_cursed',
  name: 'Wearing cursed gear',
  description: 'True while the adventurer is wearing a cursed piece of gear that cannot be removed until uncursed.',
  parse: noParams,
  evaluate({ actor }) {
    const cursed = wornItems(actor).find(({ item }) => isCursed(item));
    return cursed === undefined ? { ok: false, detail: '' } : { ok: true, detail: `cursed gear in ${EQUIP_SLOT_INFO[cursed.slot].label.toLowerCase()}` };
  },
  describe: () => 'wearing cursed gear',
});

// ---------------------------------------------------------------------------------------------
// Rule actions

/**
 * The healing potion to quaff: the weakest known healing potion that still covers the missing HP,
 * else the strongest known healing potion; if none is known, an unidentified potion so the
 * adventurer tries one in an emergency (ETH-044). `null` if the pack has none.
 */
export function bestHealing(ctx: AiCtx): { index: number; heal: number } | null {
  const { state, actor } = ctx;
  const missing = statValue(state, actor, 'hp') - actor.actor.hp;
  let cover: { index: number; heal: number } | null = null;
  let strongest: { index: number; heal: number } | null = null;
  let unknownPotion: number | null = null;
  for (const [index, item] of inventoryOf(actor).entries()) {
    const def = itemDef(item);
    if (def.category !== 'potion') continue;
    if (!isInstanceTypeKnown(state, item)) {
      if (unknownPotion === null) unknownPotion = index;
      continue;
    }
    const heal = healAmount(def);
    if (heal <= 0) continue;
    if (heal >= missing && (cover === null || heal < cover.heal)) cover = { index, heal };
    if (strongest === null || heal > strongest.heal) strongest = { index, heal };
  }
  if (cover !== null) return cover;
  if (strongest !== null) return strongest;
  return unknownPotion === null ? null : { index: unknownPotion, heal: 0 };
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
      const wanted = list.find(
        (k) =>
          ITEMS.has(k.def) &&
          wantsItem(state, actor, {
            def: k.def,
            qty: k.qty,
            ...(k.unidentified ? { identified: false } : {}),
            ...(k.cursed ? { blessing: 'cursed' as const } : {}),
            ...(k.enchant !== undefined ? { enchant: k.enchant } : {}),
          }),
      );
      if (wanted !== undefined) {
        const label = wanted.unidentified === true && !isTypeIdentified(state, wanted.def) ? appearanceName(state.seed, wanted.def) : ITEMS.get(wanted.def).name;
        goals.push({ pos: { x: i % width, y: Math.floor(i / width) }, name: label });
      }
    }
    if (goals.length === 0) return null;
    const paths = aiPathGrid(ctx);
    // Wounded with no healing: steer clear of where the last threat was seen (ETH-148).
    const avoiding = avoidThreats(ctx, paths);
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
    const step = followMap(ctx, paths, map, `going for a ${target.name}, ${turns(cost)} away`);
    return step === null || avoiding === null ? step : { ...step, skipped: avoiding };
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
    const stats = gearStatsText(state, actor, up.item, true);
    const what = stats === null ? `the ${name}` : `the ${name} (${stats})`;
    const risk = up.gate === undefined ? '' : `; ${up.gate}`;
    const instead = up.replaces === null ? `, nothing worn there yet` : ` in place of the ${itemName(state, up.replaces, actor)}`;
    const where = gearSlotsCount(up.item) > 1 ? ` (${EQUIP_SLOT_INFO[up.slot].label.toLowerCase()})` : '';
    return { request: { id: 'equip', index: up.index, slot: up.slot }, detail: `equipping ${what}${where}${instead}${risk}` };
  },
  describe: () => 'equip clear upgrades',
});

/** Read a known Scroll of Uncursing to break curses on worn gear (ETH-044). */
export const ACT_USE_UNCURSE = defineRuleAction({
  id: 'act.use_uncurse',
  name: 'Uncurse gear',
  description: 'Read a known Scroll of Uncursing to free cursed worn gear.',
  parse: noParams,
  resolve({ state, actor }): Resolved | null {
    if (!wornItems(actor).some(({ item }) => isCursed(item))) return null;
    const index = inventoryOf(actor).findIndex((item) => isInstanceTypeKnown(state, item) && hasEffectKind(itemDef(item), 'uncurse'));
    if (index < 0) return null;
    const entry = inventoryOf(actor)[index] as ItemInstance;
    return { request: { id: 'use', index }, detail: `reading a ${itemName(state, entry, actor)}` };
  },
  describe: () => 'read a scroll of uncursing',
});

/** Read a known Scroll of Identify when carrying any unidentified item (ETH-044). */
export const ACT_USE_IDENTIFY = defineRuleAction({
  id: 'act.use_identify',
  name: 'Identify items',
  description: 'Read a known Scroll of Identify when carrying an unidentified item.',
  parse: noParams,
  resolve({ state, actor }): Resolved | null {
    const pack = inventoryOf(actor);
    const scrollIdx = pack.findIndex((item) => isInstanceTypeKnown(state, item) && hasEffectKind(itemDef(item), 'identify'));
    if (scrollIdx < 0) return null;
    const hasTarget =
      wornItems(actor).some(({ item }) => !isItemIdentified(state, item)) ||
      pack.some((item, i) => i !== scrollIdx && !isItemIdentified(state, item));
    if (!hasTarget) return null;
    const entry = pack[scrollIdx] as ItemInstance;
    return { request: { id: 'use', index: scrollIdx }, detail: `reading a ${itemName(state, entry, actor)}` };
  },
  describe: () => 'read a scroll of identify',
});

/**
 * Read a scroll whose type is still unknown, at a safe moment (ETH-142). Every scroll is harmless
 * to read today, so this is how Identify and Uncursing get learned; the effect is as seeded and
 * logged as any other reading. Nothing here weighs risk: `test/sim/identifySecrecy.test.ts`
 * ("every scroll is harmless to read") fails when a harmful scroll is added, and this action must
 * then learn to weigh it.
 */
export const ACT_READ_UNKNOWN_SCROLL = defineRuleAction({
  id: 'act.read_unknown_scroll',
  name: 'Test an unknown scroll',
  description:
    'Read a scroll whose type is still unknown while it is safe (no enemy in sight, healthy, stairs within reach), so Identify and Uncursing scrolls are learned instead of carried unread.',
  parse: noParams,
  resolve({ state, actor }): Resolved | null {
    const pack = inventoryOf(actor);
    const index = unknownScrollIndex(state, actor);
    if (index === null) return null;
    return { request: { id: 'use', index }, detail: `reading the unknown ${itemName(state, pack[index] as ItemInstance, actor)} to learn what it does` };
  },
  describe: () => 'read an unknown scroll when safe',
});

function gearSlotsCount(item: ItemInstance): number {
  return gearSlots(itemDef(item)).length;
}

/** The items domain's conditions, in registration order. */
export const ITEMS_CONDITIONS: readonly ConditionDef[] = [COND_WOUNDED, COND_OVERLOADED, COND_WEARING_CURSED, COND_SAFE_TO_TEST];

/** The items domain's rule actions, in registration order. */
export const ITEMS_RULE_ACTIONS: readonly RuleActionDef[] = [
  ACT_QUAFF_HEALING,
  ACT_DROP_LOWEST,
  ACT_PICK_UP,
  ACT_EQUIP_UPGRADE,
  ACT_USE_UNCURSE,
  ACT_USE_IDENTIFY,
  ACT_READ_UNKNOWN_SCROLL,
];

/**
 * The baseline's urgent item rules, checked first: quaff healing below `HEAL_BELOW_PERCENT` HP;
 * uncurse cursed worn gear if carrying a Scroll of Uncursing; while overloaded, first put on a
 * clear upgrade from the pack (worn gear doesn't count against Carry, so that may be enough), then
 * drop the least valuable thing.
 */
export const ITEMS_BASELINE_URGENT: readonly Rule[] = [
  { condition: { id: 'cond.wounded', params: { percent: HEAL_BELOW_PERCENT } }, action: { id: 'act.quaff_healing' }, enabled: true },
  { condition: { id: 'cond.wearing_cursed' }, action: { id: 'act.use_uncurse' }, enabled: true },
  { condition: { id: 'cond.overloaded' }, action: { id: 'act.equip_upgrade' }, enabled: true },
  { condition: { id: 'cond.overloaded' }, action: { id: 'act.drop_lowest' }, enabled: true },
];

/**
 * The baseline's gear and looting rules, checked just before exploring (so never next to an
 * enemy): identify carried items with a known Scroll of Identify, put on clear upgrades (ETH-043),
 * then pick up wanted items within `PICKUP_DETOUR` steps.
 */
export const ITEMS_BASELINE_LOOT: readonly Rule[] = [
  { condition: { id: 'cond.always' }, action: { id: 'act.use_identify' }, enabled: true },
  { condition: { id: 'cond.safe_to_test' }, action: { id: 'act.read_unknown_scroll' }, enabled: true },
  { condition: { id: 'cond.always' }, action: { id: 'act.equip_upgrade' }, enabled: true },
  { condition: { id: 'cond.always' }, action: { id: 'act.pick_up', params: { maxDetour: PICKUP_DETOUR } }, enabled: true },
];
