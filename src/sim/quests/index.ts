/**
 * The quests domain: contracts, bounties and the return trip.
 * Built by ETH-024 (contracts and Recover-relic) and ETH-025 (the return trip).
 *
 * Everything this domain adds lives in this folder (docs/ARCHITECTURE.md, Contracts): declare
 * its events, action requests, commands, state slice, snapshot slice, entity parts and config
 * fields below (or in files this index re-exports), and list its rule conditions, rule actions,
 * generation steps and run trackers in `QUESTS_DOMAIN`. The root files only compose what is exported
 * here. Never import `domains.ts` or `index.ts` from this folder.
 */
import type { ActionRecord } from '../actions';
import type { CommandRecord } from '../commands';
import type { SimDomain, SnapshotCtx } from '../domain';
import type { RunConfig } from '../state';

/** The events this domain emits (bodies, without `turn`). Each needs a formatter in `ui/shell/logText/quests.ts`. */
export type QuestsEvent = never;

/** The action requests this domain defines. Each needs an entry in `QUESTS_ACTIONS`. */
export type QuestsRequest = never;

/** The commands this domain accepts. Each needs an entry in `QUESTS_COMMANDS`. */
export type QuestsCommand = never;

/** This domain's slice of the run state, at `state.domains.quests`. Plain data. */
export interface QuestsState {}

/** This domain's slice of the snapshot, at `snapshot.domains.quests`. Plain data. */
export interface QuestsSnapshot {}

/** Optional parts this domain adds to `Entity`, e.g. `inventory?: InventoryPart`. */
export interface QuestsParts {}

/** Fields this domain adds to `RunConfig`. Make them optional, so older configs stay valid. */
export interface QuestsConfig {}

/** This domain's row in `DomainTypes` (`src/sim/domain.ts`). */
export interface QuestsTypes {
  event: QuestsEvent;
  request: QuestsRequest;
  command: QuestsCommand;
  state: QuestsState;
  snapshot: QuestsSnapshot;
}

export const QUESTS_ACTIONS: ActionRecord<QuestsRequest> = {};

export const QUESTS_COMMANDS: CommandRecord<QuestsCommand> = {};

/** The state slice for a new run. */
export function initQuests(_config: RunConfig): QuestsState {
  return {};
}

/** The snapshot slice. Shares nothing with the state. */
export function questsSnapshot(_ctx: SnapshotCtx): QuestsSnapshot {
  return {};
}

/** What this domain registers with the shared code, in this order. */
export const QUESTS_DOMAIN: SimDomain<QuestsTypes> = {
  actions: QUESTS_ACTIONS,
  commands: QUESTS_COMMANDS,
  init: initQuests,
  snapshot: questsSnapshot,
};
