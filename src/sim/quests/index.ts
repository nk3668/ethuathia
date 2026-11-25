/**
 * The quests domain: contracts, bounties and the return trip.
 * Built by ETH-024 (contracts and Recover-relic) and ETH-025 (the return trip).
 *
 * - `objectives.ts`: the objective engine (ETH-114): objective kinds, tracked objectives with an
 *   owner, syncing them and the `quests.objectives` tracker. Contracts are its first owner.
 * - `contracts.ts`: contract progress, the relic placed on the bottom floor (a floor plan hook),
 *   the victory check and the contracts tracker.
 * - `rules.ts`: `cond.contracts_complete`, `act.recover_contract_item` and the baseline's
 *   objective rules (`QUESTS_BASELINE`).
 * - Here: the events, the state and snapshot slices, the config field and the invariants.
 *
 * Never import `domains.ts` or `index.ts` from this folder.
 */
import { CONTRACTS } from '../../content';
import type { Pos } from '../../core';
import type { ActionRecord } from '../actions';
import type { CommandRecord } from '../commands';
import type { SimDomain, SnapshotCtx } from '../domain';
import { registerInvariant } from '../invariants';
import { defineChronicleKind, momentAt } from '../run/chronicle';
import type { ChronicleRules } from '../run/chronicle';
import type { RewardAmounts } from '../run/result';
import type { EntityId, FloorId, RunConfig } from '../state';
import {
  announceContracts,
  configContracts,
  contractDef,
  contractReward,
  CONTRACTS_TRACKER,
  CONTRACTS_VICTORY,
  initContractObjectives,
  initContracts,
  RELIC_PLAN_HOOK,
  relicCount,
  relicFloorId,
  syncContracts,
} from './contracts';
import type { ContractState } from './contracts';
import { objectiveProblems, OBJECTIVES_TRACKER } from './objectives';
import type { TrackedObjective } from './objectives';
import { QUESTS_CONDITIONS, QUESTS_RULE_ACTIONS } from './rules';

export * from './contracts';
export * from './objectives';
export * from './rules';

/** The events this domain emits (bodies, without `turn`). Each has wording in `ui/shell/logText/quests.ts`. */
export type QuestsEvent =
  /** The run's contracts and what each pays, on the run's first turn (none for a run without contracts). */
  | { type: 'contractsTaken'; contracts: { contract: string; reward: RewardAmounts }[] }
  /** A contract moved on without being completed: `current` of `target`. */
  | { type: 'contractProgress'; contract: string; current: number; target: number }
  /**
   * A contract is complete, by `actor` (the relic's bearer) at `pos` on `floor`; its `reward` joins
   * the at-risk total. A highlight.
   */
  | { type: 'contractCompleted'; contract: string; actor: EntityId | null; reward: RewardAmounts; floor: FloorId; pos: Pos }
  /** A complete contract no longer is (the relic's bearer fell); its reward leaves the at-risk total. */
  | { type: 'contractLost'; contract: string };

/** The action requests this domain defines. Picking up the relic is the items domain's `pickup`. */
export type QuestsRequest = never;

/** The commands this domain accepts. */
export type QuestsCommand = never;

/** This domain's slice of the run state, at `state.domains.quests`. Plain data. */
export interface QuestsState {
  /** The selected contracts, in the order they were picked, with their progress. */
  contracts: ContractState[];
  /** Whether `contractsTaken` has been emitted (on the run's first turn). */
  announced: boolean;
  /**
   * Every objective the run tracks (ETH-114), in tracking order: the contracts' first, then any
   * added with `trackObjective` (bounties, conducts, taboos, building quests).
   */
  objectives: TrackedObjective[];
  /** How many of the current step's events the objectives have folded; 0 between steps. */
  folded: number;
}

/** One contract as the UI sees it. */
export interface ContractView {
  contract: string;
  current: number;
  target: number;
  complete: boolean;
  reward: RewardAmounts;
}

/** This domain's slice of the snapshot, at `snapshot.domains.quests`. Plain data. */
export interface QuestsSnapshot {
  contracts: ContractView[];
}

/** Optional parts this domain adds to `Entity`. */
export interface QuestsParts {}

/** Fields this domain adds to `RunConfig`. */
export interface QuestsConfig {
  /**
   * The contracts the run takes on (`contract.*` ids, each at most once). Victory needs every one
   * complete and the party walked out. Leave it out (tests, older configs) for none: walking out
   * is then always a retreat.
   */
  contracts?: string[];
}

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

/** The state slice for a new run. Throws a `RangeError` on an unknown or repeated contract id. */
export function initQuests(config: RunConfig): QuestsState {
  const contracts = initContracts(config);
  return { contracts, announced: false, objectives: initContractObjectives(contracts), folded: 0 };
}

/** The snapshot slice. Shares nothing with the state. */
export function questsSnapshot({ state }: SnapshotCtx): QuestsSnapshot {
  return {
    contracts: state.domains.quests.contracts.map((c) => ({
      contract: c.contract,
      current: c.progress.current,
      target: c.progress.target,
      complete: c.complete,
      reward: contractReward(c.contract, state),
    })),
  };
}

// Invariants for this domain's state (docs/ARCHITECTURE.md §11.1).

registerInvariant('quests.contracts', (state) => {
  const problems: string[] = [];
  const { contracts } = state.domains.quests;
  const ids = contracts.map((c) => c.contract);
  if (new Set(ids).size !== ids.length) problems.push('a contract is listed twice');
  let expected: string[] = [];
  try {
    expected = configContracts(state.config);
  } catch (error) {
    problems.push(`the config's contracts are invalid: ${(error as Error).message}`);
  }
  if (JSON.stringify(ids) !== JSON.stringify(expected)) problems.push(`the contracts are [${ids.join(', ')}], the config asks for [${expected.join(', ')}]`);
  for (const c of contracts) {
    if (!CONTRACTS.has(c.contract)) {
      problems.push(`unknown contract "${c.contract}"`);
      continue;
    }
    const { current, target } = c.progress;
    if (!Number.isSafeInteger(current) || !Number.isSafeInteger(target) || current < 0 || target < 1) {
      problems.push(`contract "${c.contract}" progress is ${current}/${target}`);
    }
    if (c.complete !== current >= target) problems.push(`contract "${c.contract}" is ${c.complete ? '' : 'not '}complete at ${current}/${target}`);
    // Its tracked objective (ETH-114) says the same.
    const o = state.domains.quests.objectives.find((x) => x.owner.kind === 'contract' && x.owner.id === c.contract);
    if (o === undefined) problems.push(`contract "${c.contract}" has no tracked objective`);
    else if (o.current !== current || o.target !== target || (o.status === 'complete') !== c.complete) {
      problems.push(`contract "${c.contract}" is ${current}/${target}, its objective ${o.current}/${o.target} (${o.status})`);
    }
  }
  return problems;
});

registerInvariant('quests.objectives', objectiveProblems);

registerInvariant('quests.relics', (state) => {
  const problems: string[] = [];
  for (const c of state.domains.quests.contracts) {
    if (!CONTRACTS.has(c.contract)) continue;
    const { objective } = contractDef(c.contract);
    if (objective.kind !== 'recover') continue;
    const built = state.floors[relicFloorId(state, objective)] !== undefined;
    const { carried, lying } = relicCount(state, objective.item);
    const total = carried.length + lying;
    // One relic, once its floor exists; none before.
    if (total !== (built ? 1 : 0)) problems.push(`there are ${total} of "${objective.item}", expected ${built ? 1 : 0}`);
    for (const id of carried) if (!state.party.includes(id)) problems.push(`"${objective.item}" is carried by ${id}, who is not in the party`);
  }
  return problems;
});

/** A run chronicle moment (ETH-120): a contract is complete. `ids` is the contract, `actors` who completed it. */
export const CHRONICLE_CONTRACT_COMPLETE = defineChronicleKind({ id: 'contractComplete', priority: 90 });

/** Which of this domain's events are run chronicle moments. */
export const QUESTS_CHRONICLE: ChronicleRules = {
  contractCompleted: (e) => momentAt(CHRONICLE_CONTRACT_COMPLETE, e, e.actor === null ? [] : [e.actor], [e.contract]),
};

/** What this domain registers with the shared code, in this order. */
export const QUESTS_DOMAIN: SimDomain<QuestsTypes> = {
  actions: QUESTS_ACTIONS,
  commands: QUESTS_COMMANDS,
  init: initQuests,
  snapshot: questsSnapshot,
  conditions: QUESTS_CONDITIONS,
  ruleActions: QUESTS_RULE_ACTIONS,
  trackers: [CONTRACTS_TRACKER, OBJECTIVES_TRACKER],
  victoryChecks: [CONTRACTS_VICTORY],
  floorPlanHooks: [RELIC_PLAN_HOOK],
  // A contract is met when the party takes it on, and used once it is done.
  discoveries: {
    contractsTaken: (e) => e.contracts.map((c) => ({ id: c.contract, mark: 'seen' as const })),
    contractCompleted: (e) => [{ id: e.contract, mark: 'used' }],
  },
  chronicle: QUESTS_CHRONICLE,
  chronicleKinds: [CHRONICLE_CONTRACT_COMPLETE],
  // Synced at both ends of every turn, so a bearer felled by a status at the start of a turn counts
  // too, and once more at the end of the step for the events after the last turn (ETH-114).
  turnStart: ({ state, emit, events }) => {
    announceContracts(state, emit);
    syncContracts(state, emit, events);
  },
  turnEnd: ({ state, emit, events }) => syncContracts(state, emit, events),
  stepEnd: ({ state, emit, events }) => syncContracts(state, emit, events, true),
};
