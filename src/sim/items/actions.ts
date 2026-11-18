/**
 * The item actions (ETH-061): `pickup`, `drop` and `use`. The AI, behavior rules and a possessed
 * adventurer all go through these, like every other action (docs/ARCHITECTURE.md §2.3).
 */
import { isUsable } from '../../content';
import type { ActionRecord } from '../actions';
import { removeEntity } from '../entities';
import type { EntityId } from '../state';
import { runEffects } from '../stats/effects';
import { itemDef } from './instance';
import { addToInventory, inventoryOf, itemsAt, placeItem, rememberTile, takeFromInventory } from './inventory';
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

export type ItemsRequest = PickupRequest | DropRequest | UseRequest;

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
        emit({ type: 'pickedUp', actor: actor.id, item: def.id, qty: instance.qty, value, floor, pos });
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
      emit({ type: 'dropped', actor: actor.id, item: taken.def, qty: taken.qty, floor: actor.floor, pos });
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
      takeFromInventory(actor, index, 1);
      emit({ type: 'used', actor: actor.id, item: def.id, floor: actor.floor, pos: { x: actor.pos.x, y: actor.pos.y } });
      runEffects({ state, emit, self: actor.id, source: def.id, potency: 1 }, def.bundle?.effects ?? []);
    },
  },
};
