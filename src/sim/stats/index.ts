/**
 * The stats domain: stat ids, base stats and modifiers, timed statuses, attributes and leveling.
 * Built by ETH-057 (bundles, `getStat`, statuses), ETH-033 (attributes) and ETH-034 (XP and leveling).
 *
 * Everything this domain adds lives in this folder (docs/ARCHITECTURE.md, Contracts): declare
 * its events, action requests, commands, state slice, snapshot slice, entity parts and config
 * fields below (or in files this index re-exports), and list its rule conditions, rule actions,
 * generation steps and run trackers in `STATS_DOMAIN`. The root files only compose what is exported
 * here. Never import `domains.ts` or `index.ts` from this folder.
 */
import type { ActionRecord } from '../actions';
import type { CommandRecord } from '../commands';
import type { SimDomain, SnapshotCtx } from '../domain';
import type { RunConfig } from '../state';

export { isStatId, STAT_IDS, STAT_REFS } from './statIds';
export type { StatId } from './statIds';

/** The events this domain emits (bodies, without `turn`). Each needs a formatter in `ui/shell/logText/stats.ts`. */
export type StatsEvent = never;

/** The action requests this domain defines. Each needs an entry in `STATS_ACTIONS`. */
export type StatsRequest = never;

/** The commands this domain accepts. Each needs an entry in `STATS_COMMANDS`. */
export type StatsCommand = never;

/** This domain's slice of the run state, at `state.domains.stats`. Plain data. */
export interface StatsState {}

/** This domain's slice of the snapshot, at `snapshot.domains.stats`. Plain data. */
export interface StatsSnapshot {}

/** Optional parts this domain adds to `Entity`, e.g. `inventory?: InventoryPart`. */
export interface StatsParts {}

/** Fields this domain adds to `RunConfig`. Make them optional, so older configs stay valid. */
export interface StatsConfig {}

/** This domain's row in `DomainTypes` (`src/sim/domain.ts`). */
export interface StatsTypes {
  event: StatsEvent;
  request: StatsRequest;
  command: StatsCommand;
  state: StatsState;
  snapshot: StatsSnapshot;
}

export const STATS_ACTIONS: ActionRecord<StatsRequest> = {};

export const STATS_COMMANDS: CommandRecord<StatsCommand> = {};

/** The state slice for a new run. */
export function initStats(_config: RunConfig): StatsState {
  return {};
}

/** The snapshot slice. Shares nothing with the state. */
export function statsSnapshot(_ctx: SnapshotCtx): StatsSnapshot {
  return {};
}

/** What this domain registers with the shared code, in this order. */
export const STATS_DOMAIN: SimDomain<StatsTypes> = {
  actions: STATS_ACTIONS,
  commands: STATS_COMMANDS,
  init: initStats,
  snapshot: statsSnapshot,
};
