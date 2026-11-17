/**
 * The floors domain: dungeon depth, stairs between floors, lazily generated floors and descending.
 * Built by ETH-058 (multiple floors and descent).
 *
 * Everything this domain adds lives in this folder (docs/ARCHITECTURE.md, Contracts): declare
 * its events, action requests, commands, state slice, snapshot slice, entity parts and config
 * fields below (or in files this index re-exports), and list its rule conditions, rule actions,
 * generation steps and run trackers in `FLOORS_DOMAIN`. The root files only compose what is exported
 * here. Never import `domains.ts` or `index.ts` from this folder.
 */
import type { ActionRecord } from '../actions';
import type { CommandRecord } from '../commands';
import type { SimDomain, SnapshotCtx } from '../domain';
import type { RunConfig } from '../state';

/** The events this domain emits (bodies, without `turn`). Each needs a formatter in `ui/shell/logText/floors.ts`. */
export type FloorsEvent = never;

/** The action requests this domain defines. Each needs an entry in `FLOORS_ACTIONS`. */
export type FloorsRequest = never;

/** The commands this domain accepts. Each needs an entry in `FLOORS_COMMANDS`. */
export type FloorsCommand = never;

/** This domain's slice of the run state, at `state.domains.floors`. Plain data. */
export interface FloorsState {}

/** This domain's slice of the snapshot, at `snapshot.domains.floors`. Plain data. */
export interface FloorsSnapshot {}

/** Optional parts this domain adds to `Entity`, e.g. `inventory?: InventoryPart`. */
export interface FloorsParts {}

/** Fields this domain adds to `RunConfig`. Make them optional, so older configs stay valid. */
export interface FloorsConfig {}

/** This domain's row in `DomainTypes` (`src/sim/domain.ts`). */
export interface FloorsTypes {
  event: FloorsEvent;
  request: FloorsRequest;
  command: FloorsCommand;
  state: FloorsState;
  snapshot: FloorsSnapshot;
}

export const FLOORS_ACTIONS: ActionRecord<FloorsRequest> = {};

export const FLOORS_COMMANDS: CommandRecord<FloorsCommand> = {};

/** The state slice for a new run. */
export function initFloors(_config: RunConfig): FloorsState {
  return {};
}

/** The snapshot slice. Shares nothing with the state. */
export function floorsSnapshot(_ctx: SnapshotCtx): FloorsSnapshot {
  return {};
}

/** What this domain registers with the shared code, in this order. */
export const FLOORS_DOMAIN: SimDomain<FloorsTypes> = {
  actions: FLOORS_ACTIONS,
  commands: FLOORS_COMMANDS,
  init: initFloors,
  snapshot: floorsSnapshot,
};
