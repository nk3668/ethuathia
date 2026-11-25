/**
 * The items domain: items on the floor, inventory, the party's gold, and later equipment,
 * enchantment and identification. Built by ETH-061 (items and inventory), ETH-043 (equipment) and
 * ETH-044 (enchantment and identification).
 *
 * - `instance.ts`: `ItemInstance`, the plain-data item, and stacking.
 * - `properties.ts`: item properties (ETH-118), the per-instance fields and their kinds.
 * - `scaling.ts`: weapon scaling (ETH-082), the derived property that swaps a weapon's attribute into damage.
 * - `name.ts`: `itemName`, an item's display name with its properties' parts.
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
import { ENCHANTMENTS, gearSlots, isEquipSlot, isUsable, ITEMS } from '../../content';
import type { EquipSlot, StartEnchantPiece, StartKnownCategory } from '../../content';
import type { CommandRecord } from '../commands';
import type { RunTracker, SimDomain, SnapshotCtx, TurnCtx } from '../domain';
import type { Emit } from '../events';
import { getFloor } from '../entities';
import { registerInvariant } from '../invariants';
import { defineChronicleKind, momentAt } from '../run/chronicle';
import type { ChronicleRules } from '../run/chronicle';
import { partyVisible } from '../perception';
import type { ActorEntity, Entity, EntityId, FloorId, RunConfig, RunState } from '../state';
import { ITEMS_ACTIONS } from './actions';
import type { ItemsRequest } from './actions';
import { CURSED_GEAR_TRACKER, lockedReason } from './cursedGear';
import { ITEMS_EFFECT_HANDLERS } from './effects';
import { isCursed, itemStateNote } from './enchant';
import { heldUpgradeNotes, SOURCE_EQUIPPED, wornItems } from './equipment';
import {
  appearanceName,
  IDENTIFIED_TRACKER,
  IDENTIFIED_TRACKER_ID,
  isInstanceTypeKnown,
  isItemIdentified,
  isTypeIdentified,
} from './identify';
import type { IdentifiedTrackerState } from './identify';
import { instanceProblem, itemDef, itemWeight } from './instance';
import type { StartStock } from './kit';
import { itemName } from './name';
import { propertyProblems } from './properties';
import { weaponScalingText } from './scaling';
import type { InventoryPart, ItemInstance } from './instance';
import { carryLimit, carryWeight, floorItems, inventoryOf, noticeItems } from './inventory';
import type { KnownItems } from './inventory';
import { GEN_LOOT } from './loot';
import { ITEMS_CONDITIONS, ITEMS_RULE_ACTIONS } from './rules';
import { itemValue } from './value';

export * from './instance';
export * from './identify';
export * from './mix';
export * from './enchant';
export * from './properties';
export * from './crate';
export * from './kit';
export * from './sale';
export * from './scaling';
export * from './name';
export * from './equipment';
export * from './value';
export * from './inventory';
export * from './effects';
export * from './actions';
export * from './loot';
export * from './hiddenValue';
export * from './cursedGear';
export * from './rules';

/** A picked-up item worth at least this much is a highlight. */
export const NOTABLE_ITEM_VALUE = 50;

/** The events this domain emits (bodies, without `turn`). Each has wording in `ui/shell/logText/items.ts`. */
export type ItemsEvent =
  /** A party member saw `qty` of item `item` lying at `pos` for the first time there. */
  | { type: 'itemSighted'; actor: EntityId; item: string; name?: string; identified?: false; qty: number; floor: FloorId; pos: Pos }
  /**
   * `actor` picked up `qty` of `item`, worth `value` in all (`itemValue`). `name` (on this and
   * the events below) is the item's `itemName` as the actor sees it, present only when it differs
   * from the def's name (an item with properties, ETH-118). `identified: false` when the item's
   * base type was unknown at pickup (ETH-044).
   */
  | { type: 'pickedUp'; actor: EntityId; item: string; name?: string; identified?: false; qty: number; value: number; floor: FloorId; pos: Pos }
  /** `actor` picked up a pile of gold (item `item`), adding `amount` to the party's purse. */
  | { type: 'goldPickedUp'; actor: EntityId; item: string; amount: number; floor: FloorId; pos: Pos }
  /** `actor` dropped `qty` of `item` at `pos`. `identified: false` when its base type is still unknown (ETH-044). */
  | { type: 'dropped'; actor: EntityId; item: string; name?: string; identified?: false; qty: number; floor: FloorId; pos: Pos }
  /** `actor` used one `item` (quaffed, read, ate). Its effects' events follow. */
  | { type: 'used'; actor: EntityId; item: string; name?: string; floor: FloorId; pos: Pos }
  /** `actor` put on `item` in `slot`; `replaced` is the item it took off there (now in its pack), if any, and `replacedName` its name when it differs from the def's. */
  | {
      type: 'equipped';
      actor: EntityId;
      item: string;
      name?: string;
      slot: EquipSlot;
      replaced: string | null;
      replacedName?: string;
      enchantments?: string[];
      floor: FloorId;
      pos: Pos;
    }
  /** `actor` took off `item` from `slot` and put it in its pack. */
  | { type: 'unequipped'; actor: EntityId; item: string; name?: string; slot: EquipSlot; floor: FloorId; pos: Pos }
  /** `actor` identified an item (ETH-044) via Wits on pickup, using, wearing, or an `identify` effect. */
  | {
      type: 'itemIdentified';
      actor: EntityId;
      item: string;
      name: string;
      was: string;
      method: 'wits' | 'use' | 'equip' | 'effect';
      enchantments?: string[];
      cursed?: true;
      /** Gear that turned out to carry no enchantment, blessing or curse (ETH-142). */
      plain?: true;
      floor: FloorId;
      pos: Pos;
    }
  /**
   * The baseline is holding back gear that looks like an upgrade (ETH-142): an unidentified piece
   * not worth the risk, one waiting for a Scroll of Identify, or a slot locked by cursed gear.
   * Emitted once when the set of reasons changes, not every turn.
   */
  | { type: 'gearHeld'; actor: EntityId; note: string; floor: FloorId; pos: Pos }
  /** A curse was lifted from `item` (ETH-044); `slot` is set when it was worn. */
  | { type: 'itemUncursed'; actor: EntityId; item: string; name: string; slot: EquipSlot | null; floor: FloorId; pos: Pos };

/** The commands this domain accepts. */
export type ItemsCommand = never;

/** This domain's slice of the run state, at `state.domains.items`. Plain data. */
export interface ItemsState {
  /** The party's gold this run, for merchants (ETH-049). */
  gold: number;
  /** The items the party remembers seeing, per floor and tile. */
  known: KnownItems;
  /** Item def ids whose true identity has been learned this run (potions, scrolls, jewelry; ETH-044). Sorted, unique. */
  identifiedTypes: string[];
  /** The reasons last announced (`gearHeld`) for each party member's held-back gear, joined, so they are said once (ETH-142). */
  heldNotes: Record<EntityId, string>;
}

/** One carried item, for the UI. */
export interface ItemView {
  def: string;
  /** `itemName` as the member sees it: the def's name (or generic appearance) with visible properties' parts (ETH-118, ETH-044). */
  name: string;
  qty: number;
  /** Weight of the whole stack. */
  weight: number;
  /** `itemValue` of the whole stack. */
  value: number;
  usable: boolean;
  /** For a weapon, how its attribute changes this member's damage (`weaponScalingText`, ETH-082); absent when it changes nothing. */
  scaling?: string;
  /** Present when this item's hidden properties are not yet known (ETH-044). */
  unidentified?: true;
  /** Present when this item's base type is still unknown (potions/scrolls/jewelry; ETH-044). */
  typeUnknown?: true;
  /** Tooltip note explaining this item's enchantment, blessing/curse or unidentified state (ETH-044). */
  stateNote?: string;
}

/** One worn item, for the UI (ETH-043). */
export interface WornView {
  slot: EquipSlot;
  def: string;
  /** `itemName` as the wearer sees it (ETH-118). */
  name: string;
  weight: number;
  value: number;
  /** For a weapon, how its attribute changes the wearer's damage (`weaponScalingText`, ETH-082); absent when it changes nothing. */
  scaling?: string;
  /** Present when the worn item is cursed and cannot be unequipped until uncursed (ETH-044). */
  cursed?: true;
  /** Why the slot is locked, when it is (ETH-142). */
  locked?: string;
  /** Tooltip note explaining this item's enchantment or blessing/curse state (ETH-044). */
  stateNote?: string;
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
  /** Display name when it differs from the def's (an unidentified appearance or identified enchanted item, ETH-044). */
  name?: string;
  /** Present when the item's base type is unknown, so map hover won't spoil the Codex card (ETH-044). */
  typeUnknown?: true;
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
export interface ItemsConfig {
  /** Item kinds the party knows from the first turn (Smithy `know` perks, ETH-159). Leave out for none. */
  startKnown?: StartKnownCategory[];
  /** Kit pieces worn at +1 (Smithy `enchant` perks, ETH-159). Leave out for none. */
  kitEnchant?: StartEnchantPiece[];
  /** Extra starting items, never sold: carried by the first party member, or by every member when `each` (Smithy `stock` perks, ETH-159, and the Guild Hall's Medic's Satchel, ETH-132). Leave out for none. */
  startStock?: StartStock[];
  /** The first party member carries one unidentified item rolled from the crate table, never sold (the Mystery Crate, ETH-187). Leave out for none. */
  startCrate?: true;
  /** Percent added to the Trophies the party's gold and carried items convert to on exit (`tradeBonus`, ETH-159). Leave out for none. */
  tradeBonus?: number;
}

/** This domain's row in `DomainTypes` (`src/sim/domain.ts`). */
export interface ItemsTypes {
  event: ItemsEvent;
  request: ItemsRequest;
  command: ItemsCommand;
  state: ItemsState;
  snapshot: ItemsSnapshot;
}

export const ITEMS_COMMANDS: CommandRecord<ItemsCommand> = {};

/** The state slice for a new run: an empty purse, no items seen, and no types identified yet. */
export function initItems(_config: RunConfig): ItemsState {
  return { gold: 0, known: {}, identifiedTypes: [], heldNotes: {} };
}

/** `{ scaling }` for a view, when the weapon's attribute changes `member`'s damage (ETH-082). */
function scalingField(member: Entity, item: ItemInstance): { scaling?: string } {
  const text = weaponScalingText(member, item);
  return text === null ? {} : { scaling: text };
}

/** The snapshot slice. Shares nothing with the state. */
export function itemsSnapshot({ state, floor }: SnapshotCtx): ItemsSnapshot {
  const members: Record<EntityId, InventoryView> = {};
  for (const id of state.party) {
    const e = state.entities[id];
    if (e?.actor === undefined) continue;
    members[id] = {
      items: inventoryOf(e).map((item) => {
        const typeKnown = isInstanceTypeKnown(state, item);
        const identified = isItemIdentified(state, item);
        const note = itemStateNote(state, item, e);
        return {
          def: item.def,
          name: itemName(state, item, e),
          qty: item.qty,
          weight: itemWeight(item),
          value: itemValue(state, item),
          usable: isUsable(itemDef(item)),
          ...scalingField(e, item),
          ...(identified ? {} : { unidentified: true as const }),
          ...(typeKnown ? {} : { typeUnknown: true as const }),
          ...(note === null ? {} : { stateNote: note }),
        };
      }),
      equipped: wornItems(e).map(({ slot, item }) => {
        const note = itemStateNote(state, item, e);
        return {
          slot,
          def: item.def,
          name: itemName(state, item, e),
          weight: itemWeight(item),
          value: itemValue(state, item),
          ...scalingField(e, item),
          ...(isCursed(item) ? { cursed: true as const } : {}),
          ...(isCursed(item) ? { locked: lockedReason(e, slot) as string } : {}),
          ...(note === null ? {} : { stateNote: note }),
        };
      }),
      weight: carryWeight(state, e),
      carry: carryLimit(state, e),
    };
  }

  const { width } = getFloor(state, floor).terrain;
  const visible = partyVisible(state, floor);
  const viewer = state.party.map((id) => state.entities[id]).find((e) => e !== undefined);
  const views: { i: number; view: FloorItemView }[] = [];
  for (const [key, list] of Object.entries(state.domains.items.known[floor] ?? {})) {
    const i = Number(key);
    if (visible.cells[i] === 1) continue;
    for (const k of list) {
      const typeUnknown = k.unidentified === true && !isTypeIdentified(state, k.def);
      const name = typeUnknown ? appearanceName(state.seed, k.def) : undefined;
      views.push({
        i,
        view: {
          pos: { x: i % width, y: Math.floor(i / width) },
          def: k.def,
          qty: k.qty,
          visible: false,
          ...(name === undefined ? {} : { name }),
          ...(typeUnknown ? { typeUnknown: true as const } : {}),
        },
      });
    }
  }
  for (const e of floorItems(state, floor)) {
    const i = e.pos.y * width + e.pos.x;
    if (visible.cells[i] !== 1) continue;
    const typeUnknown = !isInstanceTypeKnown(state, e.item);
    const shown = viewer === undefined ? itemDef(e.item).name : itemName(state, e.item, viewer);
    const name = shown === itemDef(e.item).name ? undefined : shown;
    views.push({
      i,
      view: {
        pos: { x: e.pos.x, y: e.pos.y },
        def: e.item.def,
        qty: e.item.qty,
        visible: true,
        ...(name === undefined ? {} : { name }),
        ...(typeUnknown ? { typeUnknown: true as const } : {}),
      },
    });
  }
  // A stable sort keeps each tile's items bottom first.
  views.sort((a, b) => a.i - b.i);
  return { gold: state.domains.items.gold, members, floor: views.map((v) => v.view) };
}

/** Turn start: a party member notes the items it can see, before it decides. */
function itemsTurnStart({ state, actor, emit }: TurnCtx): void {
  if (!state.party.includes(actor.id)) return;
  noticeItems(state, actor, emit);
  announceHeldGear(state, actor, emit);
}

/**
 * Says once why the baseline is holding back gear that looks like an upgrade, and again only when
 * the reasons change (ETH-142). It is its own event, not a note on whichever rule fires next, so
 * an unrelated decision's trace carries no gear text.
 */
function announceHeldGear(state: RunState, actor: ActorEntity, emit: Emit): void {
  const held = state.domains.items.heldNotes;
  const notes = inventoryOf(actor).length === 0 ? '' : heldUpgradeNotes(state, actor).join('; ');
  if (notes === (held[actor.id] ?? '')) return;
  if (notes === '') Reflect.deleteProperty(held, actor.id);
  else held[actor.id] = notes;
  if (notes !== '') emit({ type: 'gearHeld', actor: actor.id, note: notes, floor: actor.floor, pos: { x: actor.pos.x, y: actor.pos.y } });
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

/** Every item instance (on a floor, in a pack, worn) has only known property fields, each valid for its kind (ETH-118). */
registerInvariant('items.properties', (state) => {
  const problems: string[] = [];
  const check = (where: string, item: ItemInstance) => {
    for (const p of propertyProblems(item)) problems.push(`${where}: ${p}`);
  };
  for (const e of Object.values(state.entities)) {
    if (e.item !== undefined) check(`floor item ${e.id}`, e.item);
    if (e.inventory === undefined) continue;
    e.inventory.items.forEach((item, i) => check(`entity ${e.id} pack entry ${i}`, item));
    for (const [slot, item] of Object.entries(e.inventory.equipped ?? {})) check(`entity ${e.id} worn in ${slot}`, item);
  }
  return problems;
});

/** The purse is a whole number of 0 or more; remembered items and identified types are valid. */
registerInvariant('items.state', (state) => {
  const problems: string[] = [];
  const { gold, known, identifiedTypes } = state.domains.items;
  if (!Number.isSafeInteger(gold) || gold < 0) problems.push(`gold is ${gold}`);
  if (!Array.isArray(identifiedTypes)) {
    problems.push('identifiedTypes is not an array');
  } else {
    const seen = new Set<string>();
    for (const id of identifiedTypes) {
      if (typeof id !== 'string' || !ITEMS.has(id)) problems.push(`identifiedTypes has unknown item "${String(id)}"`);
      else if (seen.has(id)) problems.push(`identifiedTypes lists "${id}" twice`);
      seen.add(id);
    }
  }
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

/** The identified-item count is a whole number of 0 or more (`track.identified`, ETH-184). */
registerInvariant('items.identified', (state) => {
  const s = state.domains.run.trackers[IDENTIFIED_TRACKER_ID] as Partial<IdentifiedTrackerState> | undefined;
  if (s === undefined) return [];
  return typeof s.count === 'number' && Number.isSafeInteger(s.count) && s.count >= 0
    ? []
    : [`the identified tracker count is ${String(s.count)}, not a whole number of 0 or more`];
});

/** A run chronicle moment (ETH-120): a valuable find. `ids` is the item, `amount` its value. */
export const CHRONICLE_VALUABLE_FIND = defineChronicleKind({ id: 'valuableFind', priority: 40 });

/** Which of this domain's events are run chronicle moments: a known pickup worth `NOTABLE_ITEM_VALUE` or more. */
export const ITEMS_CHRONICLE: ChronicleRules = {
  pickedUp: (e) =>
    e.identified !== false && e.value >= NOTABLE_ITEM_VALUE ? momentAt(CHRONICLE_VALUABLE_FIND, e, [e.actor], [e.item], { amount: e.value }) : null,
};

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
  effectHandlers: ITEMS_EFFECT_HANDLERS,
  trackers: [CURSED_GEAR_TRACKER as RunTracker<unknown>, IDENTIFIED_TRACKER as RunTracker<unknown>],
  turnStart: itemsTurnStart,
  discoveries: {
    itemSighted: (e) => (e.identified !== false && ITEMS.has(e.item) ? [{ id: e.item, mark: 'seen' }] : []),
    pickedUp: (e) => (e.identified !== false && ITEMS.has(e.item) ? [{ id: e.item, mark: 'seen' }] : []),
    goldPickedUp: (e) => (ITEMS.has(e.item) ? [{ id: e.item, mark: 'seen' }] : []),
    used: (e) => (ITEMS.has(e.item) ? [{ id: e.item, mark: 'used' }] : []),
    equipped: (e) => [
      ...(ITEMS.has(e.item) ? [{ id: e.item, mark: 'used' as const }] : []),
      ...(e.enchantments ?? []).filter((id) => ENCHANTMENTS.has(id)).map((id) => ({ id, mark: 'used' as const })),
    ],
    itemIdentified: (e) => [
      ...(ITEMS.has(e.item) ? [{ id: e.item, mark: 'seen' as const }] : []),
      ...(e.enchantments ?? []).filter((id) => ENCHANTMENTS.has(id)).map((id) => ({ id, mark: 'seen' as const })),
    ],
  },
  chronicle: ITEMS_CHRONICLE,
  chronicleKinds: [CHRONICLE_VALUABLE_FIND],
};
