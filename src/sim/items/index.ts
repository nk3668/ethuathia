/**
 * The items domain: items on the floor, inventory, the party's gold, and later equipment,
 * enchantment and identification. Built by ETH-061 (items and inventory), ETH-043 (equipment) and
 * ETH-044 (enchantment and identification).
 *
 * - `instance.ts`: `ItemInstance`, the plain-data item, and stacking.
 * - `value.ts`: `itemValue` / `unitValue`, the one scoring function, extended by `ITEM_VALUE_HOOKS`.
 * - `inventory.ts`: floor items, packs, `carryWeight`, `wantsItem` and the party's item memory.
 * - `equipment.ts`: worn gear (ETH-043), its bundle source and the clear-upgrade comparison.
 * - `actions.ts`: `pickup`, `drop`, `use`, `equip`, `unequip`.
 * - `loot.ts`: the `gen.loot` generation step.
 * - `rules.ts`: the conditions, rule actions and baseline rules.
 * - Here: events, state and snapshot slices, the carry provider, invariants and discoveries.
 *
 * Never import `domains.ts` or `index.ts` from this folder.
 */
import { Grid } from '../../core';
import type { Pos } from '../../core';
import { gearSlots, isEquipSlot, isUsable, ITEMS } from '../../content';
import type { EquipSlot } from '../../content';
import type { CommandRecord } from '../commands';
import type { SimDomain, SnapshotCtx, TurnCtx } from '../domain';
import { getFloor } from '../entities';
import { registerInvariant } from '../invariants';
import { partyVisible } from '../perception';
import type { EntityId, FloorId, RunConfig } from '../state';
import { ITEMS_ACTIONS } from './actions';
import type { ItemsRequest } from './actions';
import { SOURCE_EQUIPPED, wornItems } from './equipment';
import { instanceProblem, itemDef, itemWeight } from './instance';
import type { InventoryPart, ItemInstance } from './instance';
import { carryLimit, carryWeight, floorItems, inventoryOf, noticeItems } from './inventory';
import type { KnownItems } from './inventory';
import { GEN_LOOT } from './loot';
import { ITEMS_CONDITIONS, ITEMS_RULE_ACTIONS } from './rules';
import { itemValue } from './value';

export * from './instance';
export * from './equipment';
export * from './value';
export * from './inventory';
export * from './actions';
export * from './loot';
export * from './rules';

/** A picked-up item worth at least this much is a highlight. */
export const NOTABLE_ITEM_VALUE = 50;

/** The events this domain emits (bodies, without `turn`). Each has wording in `ui/shell/logText/items.ts`. */
export type ItemsEvent =
  /** A party member saw `qty` of item `item` lying at `pos` for the first time there. */
  | { type: 'itemSighted'; actor: EntityId; item: string; qty: number; floor: FloorId; pos: Pos }
  /** `actor` picked up `qty` of `item`, worth `value` in all (`itemValue`). */
  | { type: 'pickedUp'; actor: EntityId; item: string; qty: number; value: number; floor: FloorId; pos: Pos }
  /** `actor` picked up a pile of gold (item `item`), adding `amount` to the party's purse. */
  | { type: 'goldPickedUp'; actor: EntityId; item: string; amount: number; floor: FloorId; pos: Pos }
  /** `actor` dropped `qty` of `item` at `pos`. */
  | { type: 'dropped'; actor: EntityId; item: string; qty: number; floor: FloorId; pos: Pos }
  /** `actor` used one `item` (quaffed, read, ate). Its effects' events follow. */
  | { type: 'used'; actor: EntityId; item: string; floor: FloorId; pos: Pos }
  /** `actor` put on `item` in `slot`; `replaced` is the item it took off there (now in its pack), if any. */
  | { type: 'equipped'; actor: EntityId; item: string; slot: EquipSlot; replaced: string | null; floor: FloorId; pos: Pos }
  /** `actor` took off `item` from `slot` and put it in its pack. */
  | { type: 'unequipped'; actor: EntityId; item: string; slot: EquipSlot; floor: FloorId; pos: Pos };

/** The commands this domain accepts. */
export type ItemsCommand = never;

/** This domain's slice of the run state, at `state.domains.items`. Plain data. */
export interface ItemsState {
  /** The party's gold this run, for merchants (ETH-049). */
  gold: number;
  /** The items the party remembers seeing, per floor and tile. */
  known: KnownItems;
}

/** One carried item, for the UI. */
export interface ItemView {
  def: string;
  qty: number;
  /** Weight of the whole stack. */
  weight: number;
  /** `itemValue` of the whole stack. */
  value: number;
  usable: boolean;
}

/** One worn item, for the UI (ETH-043). */
export interface WornView {
  slot: EquipSlot;
  def: string;
  weight: number;
  value: number;
}

/** A party member's pack and worn gear, for the UI. */
export interface InventoryView {
  items: ItemView[];
  /** What it wears, in `EQUIP_SLOTS` order. */
  equipped: WornView[];
  /** Weight in the pack (worn gear doesn't count) and the `carry` stat. */
  weight: number;
  carry: number;
}

/** An item on the shown floor as the party knows it. */
export interface FloorItemView {
  pos: Pos;
  def: string;
  qty: number;
  /** In view now; otherwise remembered and maybe gone. */
  visible: boolean;
}

/** This domain's slice of the snapshot, at `snapshot.domains.items`. Plain data. */
export interface ItemsSnapshot {
  gold: number;
  /** Each party member's pack, keyed by entity id. */
  members: Record<EntityId, InventoryView>;
  /** Items on the shown floor: in view now, or remembered; in tile order, bottom first on a tile. */
  floor: FloorItemView[];
}

/** Optional parts this domain adds to `Entity`. */
export interface ItemsParts {
  /** An item lying on the floor. The entity's `def` is the item's def id. */
  item?: ItemInstance;
  /** What an actor carries. */
  inventory?: InventoryPart;
}

/** Fields this domain adds to `RunConfig`. */
export interface ItemsConfig {}

/** This domain's row in `DomainTypes` (`src/sim/domain.ts`). */
export interface ItemsTypes {
  event: ItemsEvent;
  request: ItemsRequest;
  command: ItemsCommand;
  state: ItemsState;
  snapshot: ItemsSnapshot;
}

export const ITEMS_COMMANDS: CommandRecord<ItemsCommand> = {};

/** The state slice for a new run: an empty purse and no items seen. */
export function initItems(_config: RunConfig): ItemsState {
  return { gold: 0, known: {} };
}

/** The snapshot slice. Shares nothing with the state. */
export function itemsSnapshot({ state, floor }: SnapshotCtx): ItemsSnapshot {
  const members: Record<EntityId, InventoryView> = {};
  for (const id of state.party) {
    const e = state.entities[id];
    if (e?.actor === undefined) continue;
    members[id] = {
      items: inventoryOf(e).map((item) => ({
        def: item.def,
        qty: item.qty,
        weight: itemWeight(item),
        value: itemValue(state, item),
        usable: isUsable(itemDef(item)),
      })),
      equipped: wornItems(e).map(({ slot, item }) => ({ slot, def: item.def, weight: itemWeight(item), value: itemValue(state, item) })),
      weight: carryWeight(state, e),
      carry: carryLimit(state, e),
    };
  }

  const { width } = getFloor(state, floor).terrain;
  const visible = partyVisible(state, floor);
  const views: { i: number; view: FloorItemView }[] = [];
  for (const [key, list] of Object.entries(state.domains.items.known[floor] ?? {})) {
    const i = Number(key);
    if (visible.cells[i] === 1) continue;
    for (const k of list) views.push({ i, view: { pos: { x: i % width, y: Math.floor(i / width) }, def: k.def, qty: k.qty, visible: false } });
  }
  for (const e of floorItems(state, floor)) {
    const i = e.pos.y * width + e.pos.x;
    if (visible.cells[i] !== 1) continue;
    views.push({ i, view: { pos: { x: e.pos.x, y: e.pos.y }, def: e.item.def, qty: e.item.qty, visible: true } });
  }
  // A stable sort keeps each tile's items bottom first.
  views.sort((a, b) => a.i - b.i);
  return { gold: state.domains.items.gold, members, floor: views.map((v) => v.view) };
}

/** Turn start: a party member notes the items it can see, before it decides. */
function itemsTurnStart({ state, actor, emit }: TurnCtx): void {
  if (state.party.includes(actor.id)) noticeItems(state, actor, emit);
}

// ---------------------------------------------------------------------------------------------
// Invariants (docs/ARCHITECTURE.md §11.1)

/** Floor items and packs hold valid instances; floor items are nothing else; gold never sits in a pack. */
registerInvariant('items.parts', (state) => {
  const problems: string[] = [];
  for (const e of Object.values(state.entities)) {
    if (e.item !== undefined) {
      const problem = instanceProblem(e.item);
      if (problem !== null) problems.push(`floor item ${e.id}: ${problem}`);
      if (e.def !== e.item.def) problems.push(`floor item ${e.id} has def "${e.def}" but holds "${e.item.def}"`);
      if (e.actor !== undefined || e.feature !== undefined || e.inventory !== undefined) problems.push(`floor item ${e.id} has other parts`);
      const floor = state.floors[e.floor];
      if (floor !== undefined && Grid.wrap(floor.terrain).get(e.pos.x, e.pos.y) === 0) problems.push(`floor item ${e.id} is inside a wall`);
    }
    if (e.inventory !== undefined) {
      if (e.actor === undefined) problems.push(`entity ${e.id} has a pack but is not an actor`);
      e.inventory.items.forEach((item, i) => {
        const problem = instanceProblem(item);
        if (problem !== null) problems.push(`entity ${e.id} pack entry ${i}: ${problem}`);
        else if (ITEMS.get(item.def).category === 'gold') problems.push(`entity ${e.id} carries gold in its pack`);
      });
      for (const [slot, item] of Object.entries(e.inventory.equipped ?? {})) {
        if (!isEquipSlot(slot)) problems.push(`entity ${e.id} wears something in unknown slot "${slot}"`);
        const problem = instanceProblem(item);
        if (problem !== null) problems.push(`entity ${e.id} worn in ${slot}: ${problem}`);
        else if (item.qty !== 1) problems.push(`entity ${e.id} wears ${item.qty} "${item.def}" in ${slot}`);
        else if (!(gearSlots(ITEMS.get(item.def)) as readonly string[]).includes(slot)) {
          problems.push(`entity ${e.id} wears "${item.def}" in ${slot}, not one of its slots`);
        }
      }
    }
  }
  return problems;
});

/** The purse is a whole number of 0 or more; remembered items are on built floors' tiles and valid. */
registerInvariant('items.state', (state) => {
  const problems: string[] = [];
  const { gold, known } = state.domains.items;
  if (!Number.isSafeInteger(gold) || gold < 0) problems.push(`gold is ${gold}`);
  for (const [floorId, tiles] of Object.entries(known)) {
    const floor = state.floors[floorId];
    if (floor === undefined) {
      problems.push(`items remembered on unbuilt floor "${floorId}"`);
      continue;
    }
    const size = floor.terrain.width * floor.terrain.height;
    for (const [key, list] of Object.entries(tiles)) {
      const i = Number(key);
      if (!Number.isInteger(i) || i < 0 || i >= size) problems.push(`items remembered at tile ${key} outside "${floorId}"`);
      if (list.length === 0) problems.push(`an empty item memory at tile ${key} of "${floorId}"`);
      for (const k of list) {
        const problem = instanceProblem({ def: k.def, qty: k.qty });
        if (problem !== null) problems.push(`remembered item at tile ${key} of "${floorId}": ${problem}`);
      }
    }
  }
  return problems;
});

/** What this domain registers with the shared code, in this order. */
export const ITEMS_DOMAIN: SimDomain<ItemsTypes> = {
  actions: ITEMS_ACTIONS,
  commands: ITEMS_COMMANDS,
  init: initItems,
  snapshot: itemsSnapshot,
  conditions: ITEMS_CONDITIONS,
  ruleActions: ITEMS_RULE_ACTIONS,
  genSteps: [GEN_LOOT],
  bundleSources: [SOURCE_EQUIPPED],
  turnStart: itemsTurnStart,
  discoveries: {
    itemSighted: (e) => (ITEMS.has(e.item) ? [{ id: e.item, mark: 'seen' }] : []),
    pickedUp: (e) => (ITEMS.has(e.item) ? [{ id: e.item, mark: 'seen' }] : []),
    goldPickedUp: (e) => (ITEMS.has(e.item) ? [{ id: e.item, mark: 'seen' }] : []),
    used: (e) => (ITEMS.has(e.item) ? [{ id: e.item, mark: 'used' }] : []),
    equipped: (e) => (ITEMS.has(e.item) ? [{ id: e.item, mark: 'used' }] : []),
  },
};
