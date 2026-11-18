/**
 * Where items are (ETH-061): lying on floors, in packs, and in the party's memory of each floor.
 *
 * - Floor items are entities with an `item` part (their `def` is the item's id). `itemsAt`,
 *   `floorItems` and `placeItem` read and add them; `placeItem` merges onto a matching stack.
 * - Packs are `inventory` parts on actors: `inventoryOf`, `carryWeight`, `carryLimit`.
 * - The party remembers the items it has seen per floor (`ItemsState.known`), like features in
 *   `RunState.memory`: `noticeItems` records what a member sees, `rememberTile` refreshes one tile.
 *   The AI plans on that memory, never on items it hasn't seen.
 */
import { Grid } from '../../core';
import type { Pos } from '../../core';
import { isJunk } from '../../content';
import { addEntity, getEntity, getFloor } from '../entities';
import type { Emit } from '../events';
import { fieldOfView } from '../perception';
import type { ActorEntity, Entity, FloorId, RunState } from '../state';
import { statValue } from '../stats/getStat';
import { addToStacks, canStack, itemDef, itemWeight, stackSize } from './instance';
import type { InventoryPart, ItemInstance } from './instance';
import { unitValue } from './value';

/** An item as the party last saw it on a tile. A copy, so it goes stale when the real one changes. */
export interface KnownItem {
  def: string;
  qty: number;
}

/** The party's memory of items, per floor, keyed by tile index (`y * width + x`). */
export type KnownItems = Record<FloorId, Record<number, KnownItem[]>>;

/** An entity known to be a floor item. */
export type ItemEntity = Entity & { item: ItemInstance };

// ---------------------------------------------------------------------------------------------
// Floor items

/** The items on `floorId`, in the order they arrived there. */
export function floorItems(state: RunState, floorId: FloorId): ItemEntity[] {
  const out: ItemEntity[] = [];
  for (const id of getFloor(state, floorId).entities) {
    const e = getEntity(state, id);
    if (e.item !== undefined) out.push(e as ItemEntity);
  }
  return out;
}

/** The items lying at `pos` on `floorId`, bottom first (the last one is on top). */
export function itemsAt(state: RunState, floorId: FloorId, pos: Pos): ItemEntity[] {
  return floorItems(state, floorId).filter((e) => e.pos.x === pos.x && e.pos.y === pos.y);
}

/**
 * Puts `item` on the floor at `pos`, topping up a matching stack lying there first (`canStack`)
 * and adding new item entities for the rest. Doesn't update the party's memory (`rememberTile`).
 * Returns the entities that now hold it.
 */
export function placeItem(state: RunState, floorId: FloorId, pos: Pos, item: ItemInstance): ItemEntity[] {
  const size = stackSize(itemDef(item));
  const touched: ItemEntity[] = [];
  let left = item.qty;
  for (const e of itemsAt(state, floorId, pos)) {
    if (left === 0) break;
    if (!canStack(e.item, item) || e.item.qty >= size) continue;
    const moved = Math.min(left, size - e.item.qty);
    e.item.qty += moved;
    left -= moved;
    touched.push(e);
  }
  while (left > 0) {
    const qty = Math.min(left, size);
    touched.push(addEntity(state, { def: item.def, floor: floorId, pos: { x: pos.x, y: pos.y }, item: { ...item, qty } }) as ItemEntity);
    left -= qty;
  }
  return touched;
}

// ---------------------------------------------------------------------------------------------
// Packs

/** `entity`'s inventory, giving it an empty one first if it has none. */
export function ensureInventory(entity: Entity): InventoryPart {
  entity.inventory ??= { items: [] };
  return entity.inventory;
}

/** What `entity` carries (an empty list if it has no inventory). Don't change the result. */
export function inventoryOf(entity: Entity): readonly ItemInstance[] {
  return entity.inventory?.items ?? [];
}

/** Total weight `entity` carries. */
export function carryWeight(_state: RunState, entity: Entity): number {
  let total = 0;
  for (const item of inventoryOf(entity)) total += itemWeight(item);
  return total;
}

/** How much `entity` can carry before it is overloaded: its `carry` stat. */
export function carryLimit(state: RunState, entity: Entity): number {
  return statValue(state, entity, 'carry');
}

/** True if `entity` carries more than its `carry` stat allows. */
export function isOverloaded(state: RunState, entity: Entity): boolean {
  return carryWeight(state, entity) > carryLimit(state, entity);
}

/** Adds `item` to `entity`'s pack, merging into matching stacks. */
export function addToInventory(entity: Entity, item: ItemInstance): void {
  addToStacks(ensureInventory(entity).items, item);
}

/**
 * Takes `qty` of the pack entry at `index` out of `entity`'s pack and returns them as a new
 * instance. Throws if there is no such entry or not that many.
 */
export function takeFromInventory(entity: Entity, index: number, qty: number): ItemInstance {
  const items = entity.inventory?.items;
  const entry = items?.[index];
  if (items === undefined || entry === undefined) throw new Error(`Entity ${entity.id} has no pack entry ${index}`);
  if (!Number.isSafeInteger(qty) || qty < 1 || qty > entry.qty) throw new RangeError(`Can't take ${qty} of ${entry.qty} "${entry.def}"`);
  const taken = { ...entry, qty };
  entry.qty -= qty;
  if (entry.qty === 0) items.splice(index, 1);
  return taken;
}

/**
 * Pack entries that can be dropped to lighten the load: anything with weight that isn't a relic.
 * Returned as indices into the pack.
 */
export function droppableIndices(entity: Entity): number[] {
  const out: number[] = [];
  inventoryOf(entity).forEach((item, i) => {
    const def = itemDef(item);
    if (def.weight > 0 && def.category !== 'relic') out.push(i);
  });
  return out;
}

/** One pack entry as the drop order sees it. */
interface DropCandidate {
  value: number;
  weight: number;
  qty: number;
}

/** The candidate dropped first: the lowest unit value, the latest on a tie. `null` if none is left. */
function firstToDrop(entries: readonly DropCandidate[]): number | null {
  let best: number | null = null;
  entries.forEach((e, i) => {
    if (e.qty > 0 && e.weight > 0 && (best === null || e.value <= (entries[best] as DropCandidate).value)) best = i;
  });
  return best;
}

function candidates(state: RunState, entity: Entity): DropCandidate[] {
  return inventoryOf(entity).map((item) => {
    const def = itemDef(item);
    const droppable = def.weight > 0 && def.category !== 'relic';
    return { value: unitValue(state, item), weight: droppable ? def.weight : 0, qty: item.qty };
  });
}

/**
 * The pack entry to drop first when overloaded: the droppable entry (`droppableIndices`) whose
 * one item is worth least (`unitValue`), the latest on a tie, so something just picked up goes
 * before an equal one carried longer. `null` if nothing can be dropped.
 */
export function lowestValueIndex(state: RunState, entity: Entity): number | null {
  return firstToDrop(candidates(state, entity));
}

/**
 * Whether `actor` wants `item` in its pack (CLAUDE.md §5.3): never junk or corpses; always gold
 * (it goes to the purse) and relics; anything else if it would stay in the pack once the actor
 * dropped its least valuable things one by one (`lowestValueIndex`) until it is within `carry`
 * again. So an adventurer never picks up what it would drop straight away, and never drops
 * something it would pick up again.
 */
export function wantsItem(state: RunState, actor: Entity, item: ItemInstance): boolean {
  const def = itemDef(item);
  if (isJunk(def)) return false;
  if (def.category === 'gold' || def.category === 'relic') return true;
  const limit = carryLimit(state, actor);
  let weight = carryWeight(state, actor) + itemWeight(item);
  if (weight <= limit) return true;
  const entries = [...candidates(state, actor), { value: unitValue(state, item), weight: def.weight, qty: item.qty }];
  const mine = entries.length - 1;
  while (weight > limit) {
    const i = firstToDrop(entries);
    if (i === null) return false;
    if (i === mine) return false;
    const e = entries[i] as DropCandidate;
    e.qty--;
    weight -= e.weight;
  }
  return true;
}

// ---------------------------------------------------------------------------------------------
// The party's memory of items

/** The items the party remembers on `floorId`, by tile index. Don't change the result. */
export function knownItems(state: RunState, floorId: FloorId): Readonly<Record<number, readonly KnownItem[]>> {
  return state.domains.items.known[floorId] ?? {};
}

function knownList(e: ItemEntity): KnownItem {
  return { def: e.item.def, qty: e.item.qty };
}

/**
 * Sets the party's memory of tile `pos` on `floorId` to what lies there now. For actions that
 * change a tile the actor stands on (pickup, drop): the actor sees its own tile.
 */
export function rememberTile(state: RunState, floorId: FloorId, pos: Pos): void {
  const i = pos.y * getFloor(state, floorId).terrain.width + pos.x;
  const here = itemsAt(state, floorId, pos).map(knownList);
  const known = state.domains.items.known;
  if (here.length > 0) {
    known[floorId] ??= {};
    known[floorId][i] = here;
  } else if (known[floorId] !== undefined) {
    Reflect.deleteProperty(known[floorId], i);
  }
}

/**
 * Records the items `actor` (a party member) can see now in the party's memory of its floor, and
 * forgets remembered items on tiles in view that are gone. Emits `itemSighted` for each item
 * newly seen on a tile. Cheap when the floor has no items and none are remembered.
 */
export function noticeItems(state: RunState, actor: ActorEntity, emit: Emit): void {
  const floorId = actor.floor;
  const items = floorItems(state, floorId);
  const known = state.domains.items.known;
  const remembered = known[floorId];
  if (items.length === 0 && (remembered === undefined || Object.keys(remembered).length === 0)) return;

  const { width, height } = getFloor(state, floorId).terrain;
  const inView = new Grid(width, height, 'u8');
  for (const p of fieldOfView(state, actor)) inView.cells[p.y * width + p.x] = 1;

  const now = new Map<number, KnownItem[]>();
  for (const e of items) {
    const i = e.pos.y * width + e.pos.x;
    if (inView.cells[i] !== 1) continue;
    const list = now.get(i);
    if (list === undefined) now.set(i, [knownList(e)]);
    else list.push(knownList(e));
  }
  if (remembered !== undefined) {
    for (const key of Object.keys(remembered)) {
      const i = Number(key);
      if (inView.cells[i] === 1 && !now.has(i)) Reflect.deleteProperty(remembered, i);
    }
  }
  if (now.size === 0) return;
  const memory = (known[floorId] ??= {});
  for (const [i, list] of [...now].sort((a, b) => a[0] - b[0])) {
    const before = new Set((memory[i] ?? []).map((k) => k.def));
    for (const k of list) {
      if (before.has(k.def)) continue;
      before.add(k.def);
      emit({ type: 'itemSighted', actor: actor.id, item: k.def, qty: k.qty, floor: floorId, pos: { x: i % width, y: Math.floor(i / width) } });
    }
    memory[i] = list;
  }
}
