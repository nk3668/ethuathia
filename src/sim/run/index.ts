/**
 * The run domain: how a run ends (victory, retreat, wipe), run trackers and the at-risk rewards.
 * Built by ETH-062 (run end, run trackers and the run summary).
 *
 * Everything this domain adds lives in this folder (docs/ARCHITECTURE.md, Contracts): declare
 * its events, action requests, commands, state slice, snapshot slice, entity parts and config
 * fields below (or in files this index re-exports), and list its rule conditions, rule actions,
 * generation steps and run trackers in `RUN_DOMAIN`. The root files only compose what is exported
 * here. Never import `domains.ts` or `index.ts` from this folder.
 */
import type { ActionRecord } from '../actions';
import type { CommandRecord } from '../commands';
import type { SimDomain, SnapshotCtx } from '../domain';
import { registerInvariant } from '../invariants';
import type { RunConfig } from '../state';
import { CODEX_TRACKER } from './codex';
import type { RewardAmounts } from './result';

export * from './codex';
export * from './result';

/** The events this domain emits (bodies, without `turn`). Each needs a formatter in `ui/shell/logText/run.ts`. */
export type RunDomainEvent = never;

/** The action requests this domain defines. Each needs an entry in `RUN_DOMAIN_ACTIONS`. */
export type RunDomainRequest = never;

/** The commands this domain accepts. Each needs an entry in `RUN_DOMAIN_COMMANDS`. */
export type RunDomainCommand = never;

/** This domain's slice of the run state, at `state.domains.run`. Plain data. */
export interface RunDomainState {
  /**
   * The reward flow (docs/ARCHITECTURE.md, Contracts, "Rewards"): run trackers reduce sim
   * events into `rewards.atRisk`; at run end it goes into the `RunResult`, and meta's
   * `applyRunResult` banks it (losing a share on a wipe). The sim never touches banked currency.
   */
  rewards: { atRisk: RewardAmounts };
}

/** This domain's slice of the snapshot, at `snapshot.domains.run`. Plain data. */
export interface RunDomainSnapshot {}

/** Optional parts this domain adds to `Entity`, e.g. `inventory?: InventoryPart`. */
export interface RunDomainParts {}

/** Fields this domain adds to `RunConfig`. Make them optional, so older configs stay valid. */
export interface RunDomainConfig {}

/** This domain's row in `DomainTypes` (`src/sim/domain.ts`). */
export interface RunDomainTypes {
  event: RunDomainEvent;
  request: RunDomainRequest;
  command: RunDomainCommand;
  state: RunDomainState;
  snapshot: RunDomainSnapshot;
}

export const RUN_DOMAIN_ACTIONS: ActionRecord<RunDomainRequest> = {};

export const RUN_DOMAIN_COMMANDS: CommandRecord<RunDomainCommand> = {};

/** The state slice for a new run. */
export function initRunDomain(_config: RunConfig): RunDomainState {
  return { rewards: { atRisk: {} } };
}

/** The snapshot slice. Shares nothing with the state. */
export function runDomainSnapshot(_ctx: SnapshotCtx): RunDomainSnapshot {
  return {};
}

// Invariants for this domain's state (docs/ARCHITECTURE.md §11.1), registered when the module
// loads. Names are namespaced by domain.
registerInvariant('run.rewardsAtRisk', (state) =>
  Object.entries(state.domains.run.rewards.atRisk)
    .filter(([, amount]) => !Number.isFinite(amount) || amount < 0)
    .map(([currency, amount]) => `at-risk ${currency} is ${amount}, not a finite amount of 0 or more`),
);

/** What this domain registers with the shared code, in this order. */
export const RUN_DOMAIN: SimDomain<RunDomainTypes> = {
  actions: RUN_DOMAIN_ACTIONS,
  commands: RUN_DOMAIN_COMMANDS,
  init: initRunDomain,
  snapshot: runDomainSnapshot,
  trackers: [CODEX_TRACKER],
};
