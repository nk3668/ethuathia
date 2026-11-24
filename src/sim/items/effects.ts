/**
 * Item identification & uncursing flows + domain `EffectHandler`s (ETH-044).
 *
 * - `tryIdentifyOnPickup`: rolls the actor's Wits-based `identify` stat (ETH-081) on `state.rng.loot`
 *   when picking up an unidentified item.
 * - `identifyTargetItem`: identifies a single item instance, consolidates matching plain stacks in
 *   packs if a consumable type was newly learned, and emits `itemIdentified`.
 * - `EFFECT_IDENTIFY` / `EFFECT_UNCURSE`: registered in `ITEMS_DOMAIN.effectHandlers` so `runEffect`
 *   executes `identify` and `uncurse` effects cleanly without circular imports.
 */
import { Rng } from '../../core';
import { ITEMS } from '../../content';
import type { EquipSlot } from '../../content';
import type { Emit } from '../events';
import type { ActorEntity, Entity, RunState } from '../state';
import { statValue } from '../stats/getStat';
import type { EffectHandler } from '../stats/types';
import { isCursed, itemEnchantmentIds } from './enchant';
import { wornItems } from './equipment';
import { hasHiddenProperties, identifyInstance, isGearDef, isItemIdentified } from './identify';
import { hiddenCounts, isSecretConsumable, setHiddenCounts } from './mix';
import { addToStacks } from './instance';
import type { ItemInstance } from './instance';
import { addToInventory, inventoryOf } from './inventory';
import { itemName } from './name';

/** Re-merges stacks in `entity`'s pack after identification makes previously distinct stacks equal. */
export function consolidatePack(entity: Entity): void {
  const inv = entity.inventory;
  if (inv === undefined || inv.items.length < 2) return;
  const merged: ItemInstance[] = [];
  for (const item of inv.items) addToStacks(merged, item);
  inv.items = merged;
}

/** True if `defId` is a potion or scroll, whose blessing stays hidden until identified (ETH-147). */
function isConsumableDef(defId: string): boolean {
  return ITEMS.has(defId) && (ITEMS.get(defId).category === 'potion' || ITEMS.get(defId).category === 'scroll');
}

/** Emits `itemIdentified` after identifying `item` (with `was` captured before identification). */
export function emitIdentified(
  state: RunState,
  actor: Entity,
  item: ItemInstance,
  was: string,
  method: 'wits' | 'use' | 'equip' | 'effect',
  emit: Emit,
): void {
  const name = itemName(state, item, actor);
  const enchantments = itemEnchantmentIds(item);
  emit({
    type: 'itemIdentified',
    actor: actor.id,
    item: item.def,
    name,
    was,
    method,
    ...(enchantments.length > 0 ? { enchantments } : {}),
    ...(isCursed(item) ? { cursed: true } : {}),
    ...((isGearDef(item.def) || isConsumableDef(item.def)) && !hasHiddenProperties(item) ? { plain: true as const } : {}),
    floor: actor.floor,
    pos: { x: actor.pos.x, y: actor.pos.y },
  });
}

/**
 * Identifies `item` for `actor` via `method` and emits `itemIdentified` if anything was unknown.
 * A mixed stack of potions or scrolls splits by blessing: each group is identified and reported
 * on its own, and the groups beyond the first go into `actor`'s pack (ETH-147).
 */
export function identifyItemFor(
  state: RunState,
  actor: Entity,
  item: ItemInstance,
  method: 'wits' | 'use' | 'equip' | 'effect',
  emit: Emit,
  consolidate = true,
): boolean {
  if (isItemIdentified(state, item)) return false;
  const was = itemName(state, item, actor);
  const { changed, extras } = identifyInstance(state, item);
  if (!changed) return false;
  emitIdentified(state, actor, item, was, method, emit);
  for (const extra of extras) {
    emitIdentified(state, actor, extra, was, method, emit);
    addToInventory(actor, extra);
  }
  if (consolidate) consolidatePack(actor);
  return true;
}

/**
 * Rolls `actor`'s Wits-based `identify` skill (ETH-081) on `state.rng.loot` when picking up an
 * unidentified item. Returns true if the item was identified.
 */
export function tryIdentifyOnPickup(state: RunState, actor: ActorEntity, item: ItemInstance, emit: Emit): boolean {
  if (isItemIdentified(state, item) || item.identifyTried === true) return false;
  // One roll per item instance: picking it up again can't farm identification (ETH-142).
  item.identifyTried = true;
  const chance = statValue(state, actor, 'identify') / 100;
  if (chance <= 0) return false;
  const rng = new Rng(state.rng.loot);
  if (!rng.chance(chance)) return false;
  return identifyItemFor(state, actor, item, 'wits', emit);
}

/** Uncurses `item` in place (if cursed) and emits `itemUncursed`. Returns true if a curse was lifted. */
export function uncurseItem(state: RunState, actor: Entity, item: ItemInstance, slot: EquipSlot | null, emit: Emit): boolean {
  const mixedCurse = isSecretConsumable(item) && (item.mix?.cursed ?? 0) > 0;
  if (!isCursed(item) && !mixedCurse) return false;
  if (mixedCurse) {
    // Cursed copies in a hidden mix turn plain; the stack stays unidentified (ETH-147).
    const c = hiddenCounts(item);
    setHiddenCounts(item, { plain: c.plain + c.cursed, blessed: c.blessed, cursed: 0 });
  } else {
    Reflect.deleteProperty(item, 'blessing');
  }
  const name = itemName(state, item, actor);
  emit({
    type: 'itemUncursed',
    actor: actor.id,
    item: item.def,
    name,
    slot,
    floor: actor.floor,
    pos: { x: actor.pos.x, y: actor.pos.y },
  });
  return true;
}

/** `EffectHandler` for `{ kind: 'identify' }`: identifies one unidentified item, or all when `scope: 'all'` or blessed (`potency >= 1.5`). */
export const EFFECT_IDENTIFY: EffectHandler<'identify'> = {
  kind: 'identify',
  run(ctx, target, effect) {
    const all = effect.scope === 'all' || ctx.potency >= 1.5;
    const candidates: ItemInstance[] = [];
    // Prioritize unidentified worn gear, then pack items (gear/jewelry first, then consumables).
    for (const { item } of wornItems(target)) {
      if (!isItemIdentified(ctx.state, item)) candidates.push(item);
    }
    const pack = inventoryOf(target);
    for (const item of pack) {
      if (!isItemIdentified(ctx.state, item) && ITEMS.has(item.def) && ITEMS.get(item.def).gear !== undefined) candidates.push(item);
    }
    for (const item of pack) {
      if (!isItemIdentified(ctx.state, item) && (!ITEMS.has(item.def) || ITEMS.get(item.def).gear === undefined)) candidates.push(item);
    }
    let any = false;
    for (const item of candidates) {
      if (isItemIdentified(ctx.state, item)) continue;
      if (identifyItemFor(ctx.state, target, item, 'effect', ctx.emit, false)) any = true;
      if (!all) break;
    }
    if (any) {
      for (const id of ctx.state.party) {
        const member = ctx.state.entities[id];
        if (member !== undefined) consolidatePack(member);
      }
    }
  },
};

/** `EffectHandler` for `{ kind: 'uncurse' }`: lifts curses from worn gear (and pack items when `scope: 'all'` or blessed `potency >= 1.5`). */
export const EFFECT_UNCURSE: EffectHandler<'uncurse'> = {
  kind: 'uncurse',
  run(ctx, target, effect) {
    const all = effect.scope === 'all' || ctx.potency >= 1.5;
    for (const { slot, item } of wornItems(target)) {
      uncurseItem(ctx.state, target, item, slot, ctx.emit);
    }
    if (all) {
      for (const item of inventoryOf(target)) {
        uncurseItem(ctx.state, target, item, null, ctx.emit);
      }
      consolidatePack(target);
    }
  },
};

/** Domain effect handlers registered by `ITEMS_DOMAIN.effectHandlers`. */
export const ITEMS_EFFECT_HANDLERS: readonly EffectHandler[] = [
  EFFECT_IDENTIFY as EffectHandler,
  EFFECT_UNCURSE as EffectHandler,
];
