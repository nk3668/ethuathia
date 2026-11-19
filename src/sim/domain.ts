/**
 * The extension seams (docs/ARCHITECTURE.md, Contracts): what a sim domain module is, and the
 * one table of domain types the root unions are built from.
 *
 * A domain (`stats`, `floors`, `combat`, `items`, `quests`, `run`) owns its events, actions,
 * commands, state slice, snapshot slice, entity parts, config fields, rule conditions, rule
 * actions, generation steps and run trackers, all in `src/sim/<domain>/`. The root files
 * (`events.ts`, `actions.ts`, `commands.ts`, `state.ts`, `snapshot.ts`, `domains.ts`) only
 * compose them, one line per domain, so feature work rarely touches a shared file.
 *
 * Types only: this file has no runtime code, so anything may import it.
 */
import type { BaseRequest, ActionRecord } from './actions';
import type { ConditionDef, RuleActionDef } from './ai/types';
import type { BaseCommand, CommandRecord } from './commands';
import type { CombatTypes } from './combat';
import type { FloorsTypes } from './floors';
import type { GenStepDef } from './gen/types';
import type { ItemsTypes } from './items';
import type { QuestsTypes } from './quests';
import type { DiscoveryRules, RunDomainTypes } from './run';
import type { ChronicleKind, ChronicleRules } from './run/chronicle';
import type { Emit, SimEvent } from './events';
import type { FloorPlan } from './floorText';
import type { RewardAmounts } from './run/result';
import type { ActorEntity, FloorId, RunConfig, RunState } from './state';
import type { StatsTypes } from './stats';
import type { BundleSource, StatProvider, TriggerKindDef } from './stats/types';

/** The types one domain contributes. Each domain exports one of these as `<Domain>Types`. */
export interface DomainShape {
  /** Its event union (bodies, without `turn`), or `never`. */
  event: { type: string };
  /** Its action request union, or `never`. */
  request: BaseRequest;
  /** Its command union, or `never`. */
  command: BaseCommand;
  /** Its slice of `RunState`, at `state.domains.<key>`. Plain data. */
  state: object;
  /** Its slice of `Snapshot`, at `snapshot.domains.<key>`. Plain data. */
  snapshot: object;
}

/**
 * Every domain's types, keyed by domain. The root unions (`SimEventBody`, `ActionRequest`,
 * `Command`) and the `domains` slices of `RunState` and `Snapshot` are built from this table.
 * The key order here is the domain order everywhere (`DOMAINS` in `domains.ts` follows it).
 */
export interface DomainTypes {
  stats: StatsTypes;
  floors: FloorsTypes;
  combat: CombatTypes;
  items: ItemsTypes;
  quests: QuestsTypes;
  run: RunDomainTypes;
}

export type DomainKey = keyof DomainTypes;

/** Every domain's state slice: `RunState.domains`. */
export type DomainStates = { [K in DomainKey]: DomainTypes[K]['state'] };

/** Every domain's snapshot slice: `Snapshot.domains`. */
export type DomainSnapshots = { [K in DomainKey]: DomainTypes[K]['snapshot'] };

/** What a domain's snapshot builder gets. It must not change anything. */
export interface SnapshotCtx {
  readonly state: RunState;
  /** The floor the snapshot shows. */
  readonly floor: FloorId;
}

/**
 * A reducer over the event stream (docs/ARCHITECTURE.md §2.4, §6.4): kills, depth reached,
 * conducts kept. Its state is plain data. The run domain (ETH-062, `src/sim/run/trackers.ts`)
 * keeps every tracker's state in `state.domains.run.trackers[id]` and, at the end of each step,
 * reduces it over that step's events in order (a run's last step includes its `runEnded`). Then:
 *
 * - every tracker's `rewards(state)` is summed into `state.domains.run.rewards.atRisk`, the run's
 *   at-risk currency, recomputed after every step (nothing else writes it);
 * - at run end, `extras(state)` (default: the state itself) goes into `RunResult.extras[id]`,
 *   where profile slices read it (`extras['track.codex']`).
 *
 * Domains contribute trackers through `SimDomain.trackers`.
 */
export interface RunTracker<S> {
  /** Unique, e.g. `track.kills` or `conduct.pacifist`. Also its key in `RunResult.extras`. */
  readonly id: string;
  init(): S;
  /** The tracker's next state after `event`. Must not change `state` in place or draw randomness. */
  reduce(state: S, event: SimEvent): S;
  /**
   * The tracker's next state from the run itself, once the step's events are folded in (ETH-121):
   * for trackers that watch state rather than events, such as `track.requirements`. Must not
   * change either state in place or draw randomness. Not used for `projectedRewards`, so a
   * tracker that earns currency should earn it from events.
   */
  afterStep?(state: S, run: RunState): S;
  /**
   * The at-risk currency this state is worth now (currency id → amount, `RewardAmounts`). Pure.
   * Leave it out for a tracker that earns nothing, such as the Codex.
   */
  rewards?(state: S): RewardAmounts;
  /** What goes into `RunResult.extras[id]` at run end. Plain data. Default: the state itself. */
  extras?(state: S): unknown;
}

/**
 * A victory condition (ETH-062): a domain's say in whether walking out of the dungeon wins the
 * run. Contracts (ETH-024) add one. When the party leaves, the run is a victory if at least one
 * check applies and every check that applies is met; otherwise it is a retreat.
 */
export interface VictoryCheck {
  /** Unique, e.g. `victory.contracts`. */
  readonly id: string;
  /**
   * Whether the check applies to this run (`applies: false` for a run with no contracts) and, if
   * so, whether it is met, with a sentence for the run summary ("Both contracts complete").
   * Must not change the state.
   */
  check(state: RunState): { applies: boolean; met: boolean; detail: string };
}

/**
 * A change a domain makes to a floor's plan before the floor is built (ETH-024): the quests
 * domain puts a contract's relic on the bottom floor. `planFloor` runs every hook, in domain
 * order, on every floor plan, generated or hand-built.
 *
 * `apply` changes `plan` in place and must not change `state`. It must be deterministic from
 * `state.seed`, `state.config` and `floorId` alone (draw from an RNG seeded with them, never a
 * shared stream), so a floor never depends on when or in which order floors are reached.
 */
export interface FloorPlanHook {
  /** Unique, e.g. `quests.relic`. */
  readonly id: string;
  apply(state: RunState, floorId: FloorId, plan: FloorPlan): void;
}

/**
 * The runtime half of a domain: what it registers with the shared code. `domains.ts` lists one
 * per domain and registers every list in domain order, so registration order is fixed.
 *
 * - `actions` and `commands` are exhaustive records over the domain's request and command unions.
 * - `init` builds the state slice for a new run from its config. Return fresh plain data.
 * - `snapshot` builds the snapshot slice. Return fresh plain data that shares nothing with state.
 * - `conditions`, `ruleActions` and `genSteps` go into `CONDITIONS`, `RULE_ACTIONS` and
 *   `GEN_STEPS`; ids must be unique across domains (`cond.*`, `act.*`, `gen.*`).
 * - `trackers` are the domain's run trackers, in the order they should run.
 * - `discoveries` maps the domain's event types to the content they discover for the Codex.
 * - `chronicle` and `chronicleKinds` say which of its events are run chronicle moments.
 * - `statProviders`, `bundleSources` and `triggers` feed the stats tables (§2.2), in domain order.
 * - `turnStart` and `turnEnd` run around every actor's turn (`step.ts`), in domain order.
 * - `victoryChecks` are the domain's victory conditions (`VictoryCheck`).
 * - `floorPlanHooks` change floor plans before floors are built (`FloorPlanHook`).
 */
export interface SimDomain<T extends DomainShape> {
  readonly actions: ActionRecord<T['request']>;
  readonly commands: CommandRecord<T['command']>;
  init(config: RunConfig): T['state'];
  snapshot(ctx: SnapshotCtx): T['snapshot'];
  readonly conditions?: readonly ConditionDef[];
  readonly ruleActions?: readonly RuleActionDef[];
  readonly genSteps?: readonly GenStepDef[];
  readonly trackers?: readonly RunTracker<unknown>[];
  /**
   * What the domain's events discover for the Codex, by event type (`run/codex.ts`). Goes into
   * `DISCOVERY_RULES`, which `CODEX_TRACKER` reads.
   */
  readonly discoveries?: DiscoveryRules;
  /**
   * Which of the domain's events are run chronicle moments, by event type (`run/chronicle.ts`,
   * ETH-120). Goes into `CHRONICLE_RULES`, which `CHRONICLE_TRACKER` reads.
   */
  readonly chronicle?: ChronicleRules;
  /** The moment kinds the domain's chronicle rules make (`CHRONICLE_KINDS`), with their priority. */
  readonly chronicleKinds?: readonly ChronicleKind[];
  readonly victoryChecks?: readonly VictoryCheck[];
  /** Changes to floor plans before floors are built (`FLOOR_PLAN_HOOKS`), in domain order. */
  readonly floorPlanHooks?: readonly FloorPlanHook[];
  /** Stat derivation steps (`STAT_PROVIDERS`), run core first, then in domain order (§2.2). */
  readonly statProviders?: readonly StatProvider[];
  /** Where active bundles come from (`BUNDLE_SOURCES`), for `getStat` and `fireTrigger`. */
  readonly bundleSources?: readonly BundleSource[];
  /** The trigger kinds this domain fires (`TRIGGERS`, ids `trigger.*`). */
  readonly triggers?: readonly TriggerKindDef[];
  /**
   * Runs at the start of every actor's turn, before it decides, in domain order. It may change
   * the state and emit events; an actor left dead skips its action.
   */
  turnStart?(ctx: TurnCtx): void;
  /** Runs at the end of every actor's turn, after its action, in domain order. */
  turnEnd?(ctx: TurnCtx): void;
}

/** What a domain's turn hooks get. */
export interface TurnCtx {
  readonly state: RunState;
  readonly actor: ActorEntity;
  readonly emit: Emit;
}
