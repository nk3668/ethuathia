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
import { hasHiddenProperties, identifyInstance, isItemIdentified } from './identify';
import { addToStacks } from './instance';
import type { ItemInstance } from './instance';
import { inventoryOf } from './inventory';
import { itemName } from './name';

/** Re-merges stacks in `entity`'s pack after identification makes previously distinct stacks equal. */
export function consolidatePack(entity: Entity): void {
  const inv = entity.inventory;
  if (inv === undefined || inv.items.length < 2) return;
  const merged: ItemInstance[] = [];
  for (const item of inv.items) addToStacks(merged, item);
  inv.items = merged;
}

/** Clears `identified: false` on plain uncursed pack items of `defId` across the party once its type is known. */
export function clearPlainTypeFlags(state: RunState, defId: string, consolidate = true): void {
  for (const id of state.party) {
    const member = state.entities[id];
    if (member?.inventory === undefined) continue;
    let touched = false;
    for (const entry of member.inventory.items) {
      if (entry.def === defId && entry.identified === false && !hasHiddenProperties(entry)) {
        Reflect.deleteProperty(entry, 'identified');
        touched = true;
      }
    }
    if (touched && consolidate) consolidatePack(member);
  }
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
    floor: actor.floor,
    pos: { x: actor.pos.x, y: actor.pos.y },
  });
}

/**
 * Identifies `item` for `actor` via `method` and emits `itemIdentified` if anything was unknown.
 * Also consolidates plain stacks if a consumable/jewelry type was newly learned (unless deferred).
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
  const { changed, typeNewlyKnown } = identifyInstance(state, item);
  if (!changed) return false;
  if (typeNewlyKnown) clearPlainTypeFlags(state, item.def, consolidate);
  if (consolidate) consolidatePack(actor);
  emitIdentified(state, actor, item, was, method, emit);
  return true;
}

/**
 * Rolls `actor`'s Wits-based `identify` skill (ETH-081) on `state.rng.loot` when picking up an
 * unidentified item. Returns true if the item was identified.
 */
export function tryIdentifyOnPickup(state: RunState, actor: ActorEntity, item: ItemInstance, emit: Emit): boolean {
  if (isItemIdentified(state, item)) return false;
  const chance = statValue(state, actor, 'identify') / 100;
  if (chance <= 0) return false;
  const rng = new Rng(state.rng.loot);
  if (!rng.chance(chance)) return false;
  return identifyItemFor(state, actor, item, 'wits', emit);
}

/** Uncurses `item` in place (if cursed) and emits `itemUncursed`. Returns true if a curse was lifted. */
export function uncurseItem(state: RunState, actor: Entity, item: ItemInstance, slot: EquipSlot | null, emit: Emit): boolean {
  if (!isCursed(item)) return false;
  Reflect.deleteProperty(item, 'blessing');
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
