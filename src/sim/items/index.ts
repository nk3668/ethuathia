/**
 * The items domain: items on the floor, inventory, equipment, enchantment and identification.
 * Built by ETH-061 (items and inventory), ETH-043 (equipment) and ETH-044 (enchantment and identification).
 *
 * Everything this domain adds lives in this folder (docs/ARCHITECTURE.md, Contracts): declare
 * its events, action requests, commands, state slice, snapshot slice, entity parts and config
 * fields below (or in files this index re-exports), and list its rule conditions, rule actions,
 * generation steps and run trackers in `ITEMS_DOMAIN`. The root files only compose what is exported
 * here. Never import `domains.ts` or `index.ts` from this folder.
 */
import type { ActionRecord } from '../actions';
import type { CommandRecord } from '../commands';
import type { SimDomain, SnapshotCtx } from '../domain';
import type { RunConfig } from '../state';

/** The events this domain emits (bodies, without `turn`). Each needs a formatter in `ui/shell/logText/items.ts`. */
export type ItemsEvent = never;

/** The action requests this domain defines. Each needs an entry in `ITEMS_ACTIONS`. */
export type ItemsRequest = never;

/** The commands this domain accepts. Each needs an entry in `ITEMS_COMMANDS`. */
export type ItemsCommand = never;

/** This domain's slice of the run state, at `state.domains.items`. Plain data. */
export interface ItemsState {}

/** This domain's slice of the snapshot, at `snapshot.domains.items`. Plain data. */
export interface ItemsSnapshot {}

/** Optional parts this domain adds to `Entity`, e.g. `inventory?: InventoryPart`. */
export interface ItemsParts {}

/** Fields this domain adds to `RunConfig`. Make them optional, so older configs stay valid. */
export interface ItemsConfig {}

/** This domain's row in `DomainTypes` (`src/sim/domain.ts`). */
export interface ItemsTypes {
  event: ItemsEvent;
  request: ItemsRequest;
  command: ItemsCommand;
  state: ItemsState;
  snapshot: ItemsSnapshot;
}

export const ITEMS_ACTIONS: ActionRecord<ItemsRequest> = {};

export const ITEMS_COMMANDS: CommandRecord<ItemsCommand> = {};

/** The state slice for a new run. */
export function initItems(_config: RunConfig): ItemsState {
  return {};
}

/** The snapshot slice. Shares nothing with the state. */
export function itemsSnapshot(_ctx: SnapshotCtx): ItemsSnapshot {
  return {};
}

/** What this domain registers with the shared code, in this order. */
export const ITEMS_DOMAIN: SimDomain<ItemsTypes> = {
  actions: ITEMS_ACTIONS,
  commands: ITEMS_COMMANDS,
  init: initItems,
  snapshot: itemsSnapshot,
};
