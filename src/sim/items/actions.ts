/**
 * The item actions: `pickup`, `drop` and `use` (ETH-061), `equip` and `unequip` (ETH-043). The AI, behavior rules and a possessed
 * adventurer all go through these, like every other action (docs/ARCHITECTURE.md §2.3).
 */
import { EQUIP_SLOTS, gearSlots, isEquipSlot, isUsable } from '../../content';
import type { EquipSlot } from '../../content';
import type { ActionRecord } from '../actions';
import { removeEntity } from '../entities';
import type { EntityId } from '../state';
import { runEffects } from '../stats/effects';
import { clampVitals } from '../stats/getStat';
import { equippedIn, slotFor } from './equipment';
import { itemDef } from './instance';
import { nameField } from './name';
import { addToInventory, ensureInventory, inventoryOf, itemsAt, placeItem, rememberTile, takeFromInventory } from './inventory';
import { itemValue } from './value';

/** Pick up an item lying on your tile: `item` (an entity id), or the one on top. Gold goes to the purse. */
export interface PickupRequest {
  id: 'pickup';
  item?: EntityId;
}

/** Drop `qty` (default all) of the pack entry at `index` onto your tile. */
export interface DropRequest {
  id: 'drop';
  index: number;
  qty?: number;
}

/** Use one of the pack entry at `index`: quaff a potion, read a scroll, eat food. */
export interface UseRequest {
  id: 'use';
  index: number;
}

/**
 * Put on the pack entry at `index` (ETH-043), in `slot` if given (a ring fits either ring slot,
 * ETH-111), else the first empty slot it fits, else its first slot. Whatever was worn there goes
 * into the pack.
 */
export interface EquipRequest {
  id: 'equip';
  index: number;
  slot?: EquipSlot;
}

/** Take off what is worn in `slot` and put it in the pack (ETH-043). */
export interface UnequipRequest {
  id: 'unequip';
  slot: EquipSlot;
}

export type ItemsRequest = PickupRequest | DropRequest | UseRequest | EquipRequest | UnequipRequest;

const isIndex = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 1;

export const ITEMS_ACTIONS: ActionRecord<ItemsRequest> = {
  pickup: {
    id: 'pickup',
    name: 'Pick up',
    description:
      'Pick up an item from the tile you stand on and put it in your pack. Gold goes into the party’s purse instead and weighs nothing.',
    tags: [],
    cost: 100,
    parse: (raw) => {
      if (raw.item === undefined) return { id: 'pickup' };
      return typeof raw.item === 'number' && Number.isSafeInteger(raw.item) && raw.item > 0
        ? { id: 'pickup', item: raw.item }
        : 'The item must be an entity id';
    },
    validate: ({ state, actor }, { item }) => {
      const here = itemsAt(state, actor.floor, actor.pos);
      if (here.length === 0) return 'There is nothing here to pick up';
      if (item !== undefined && !here.some((e) => e.id === item)) return 'That item is not here';
      return null;
    },
    execute: ({ state, actor, emit }, { item }) => {
      const here = itemsAt(state, actor.floor, actor.pos);
      const target = item === undefined ? here[here.length - 1] : here.find((e) => e.id === item);
      if (target === undefined) return;
      const instance = target.item;
      const def = itemDef(instance);
      const floor = actor.floor;
      const pos = { x: actor.pos.x, y: actor.pos.y };
      removeEntity(state, target.id);
      if (def.category === 'gold') {
        state.domains.items.gold += instance.qty;
        emit({ type: 'goldPickedUp', actor: actor.id, item: def.id, amount: instance.qty, floor, pos });
      } else {
        const value = itemValue(state, instance);
        addToInventory(actor, instance);
        emit({ type: 'pickedUp', actor: actor.id, item: def.id, ...nameField(state, instance, actor), qty: instance.qty, value, floor, pos });
      }
      rememberTile(state, floor, pos);
    },
  },
  drop: {
    id: 'drop',
    name: 'Drop',
    description: 'Put an item from your pack down on the tile you stand on, to lighten the load.',
    tags: [],
    cost: 100,
    parse: (raw) => {
      if (!isIndex(raw.index)) return 'The pack index must be a whole number from 0';
      if (raw.qty === undefined) return { id: 'drop', index: raw.index };
      return isCount(raw.qty) ? { id: 'drop', index: raw.index, qty: raw.qty } : 'The quantity must be a whole number from 1';
    },
    validate: ({ actor }, { index, qty }) => {
      const entry = inventoryOf(actor)[index];
      if (entry === undefined) return 'There is no such item in the pack';
      if (qty !== undefined && qty > entry.qty) return `There are only ${entry.qty} to drop`;
      return null;
    },
    execute: ({ state, actor, emit }, { index, qty }) => {
      const entry = inventoryOf(actor)[index];
      if (entry === undefined) return;
      const taken = takeFromInventory(actor, index, qty ?? entry.qty);
      const pos = { x: actor.pos.x, y: actor.pos.y };
      placeItem(state, actor.floor, pos, taken);
      rememberTile(state, actor.floor, pos);
      emit({ type: 'dropped', actor: actor.id, item: taken.def, ...nameField(state, taken, actor), qty: taken.qty, floor: actor.floor, pos });
    },
  },
  use: {
    id: 'use',
    name: 'Use',
    description: 'Use one item from your pack: quaff a potion, read a scroll or eat some food. It is used up.',
    tags: [],
    cost: 100,
    parse: (raw) => (isIndex(raw.index) ? { id: 'use', index: raw.index } : 'The pack index must be a whole number from 0'),
    validate: ({ actor }, { index }) => {
      const entry = inventoryOf(actor)[index];
      if (entry === undefined) return 'There is no such item in the pack';
      return isUsable(itemDef(entry)) ? null : `${itemDef(entry).name} can't be used`;
    },
    execute: ({ state, actor, emit }, { index }) => {
      const entry = inventoryOf(actor)[index];
      if (entry === undefined) return;
      const def = itemDef(entry);
      const named = nameField(state, entry, actor);
      takeFromInventory(actor, index, 1);
      emit({ type: 'used', actor: actor.id, item: def.id, ...named, floor: actor.floor, pos: { x: actor.pos.x, y: actor.pos.y } });
      runEffects({ state, emit, self: actor.id, source: def.id, potency: 1 }, def.bundle?.effects ?? []);
    },
  },
  equip: {
    id: 'equip',
    name: 'Equip',
    description:
      'Put on a weapon or piece of armor from your pack. Its stats count while it is worn. Whatever was worn in the same slot goes back into the pack.',
    tags: [],
    cost: 100,
    parse: (raw) => {
      if (!isIndex(raw.index)) return 'The pack index must be a whole number from 0';
      if (raw.slot === undefined) return { id: 'equip', index: raw.index };
      return isEquipSlot(raw.slot) ? { id: 'equip', index: raw.index, slot: raw.slot } : `The slot must be one of ${EQUIP_SLOTS.join(', ')}`;
    },
    validate: ({ actor }, { index, slot }) => {
      const entry = inventoryOf(actor)[index];
      if (entry === undefined) return 'There is no such item in the pack';
      const def = itemDef(entry);
      const slots = gearSlots(def);
      if (slots.length === 0) return `${def.name} can't be worn`;
      return slot === undefined || slots.includes(slot) ? null : `${def.name} can't be worn there`;
    },
    execute: ({ state, actor, emit }, { index, slot: asked }) => {
      const entry = inventoryOf(actor)[index];
      const slot = entry === undefined ? null : (asked ?? slotFor(actor, entry));
      if (entry === undefined || slot === null) return;
      const item = takeFromInventory(actor, index, 1);
      const equipped = (ensureInventory(actor).equipped ??= {});
      const old = equipped[slot];
      equipped[slot] = item;
      if (old !== undefined) addToInventory(actor, old);
      clampVitals(state, actor);
      const pos = { x: actor.pos.x, y: actor.pos.y };
      const replacedName = old === undefined ? {} : nameField(state, old, actor);
      emit({
        type: 'equipped',
        actor: actor.id,
        item: item.def,
        ...nameField(state, item, actor),
        slot,
        replaced: old?.def ?? null,
        ...(replacedName.name === undefined ? {} : { replacedName: replacedName.name }),
        floor: actor.floor,
        pos,
      });
    },
  },
  unequip: {
    id: 'unequip',
    name: 'Unequip',
    description: 'Take off a worn weapon or piece of armor and put it in your pack. Its stats stop counting.',
    tags: [],
    cost: 100,
    parse: (raw) => (isEquipSlot(raw.slot) ? { id: 'unequip', slot: raw.slot } : `The slot must be one of ${EQUIP_SLOTS.join(', ')}`),
    validate: ({ actor }, { slot }) => (equippedIn(actor, slot) === null ? 'Nothing is worn there' : null),
    execute: ({ state, actor, emit }, { slot }) => {
      const equipped = actor.inventory?.equipped;
      const item = equipped?.[slot];
      if (equipped === undefined || item === undefined) return;
      Reflect.deleteProperty(equipped, slot);
      if (Object.keys(equipped).length === 0) Reflect.deleteProperty(ensureInventory(actor), 'equipped');
      addToInventory(actor, item);
      clampVitals(state, actor);
      emit({ type: 'unequipped', actor: actor.id, item: item.def, ...nameField(state, item, actor), slot, floor: actor.floor, pos: { x: actor.pos.x, y: actor.pos.y } });
    },
  },
};
