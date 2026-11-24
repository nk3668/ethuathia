/**
 * Contracts in the run (ETH-024, CLAUDE.md §6): the selected contracts and their progress, the
 * relic a `recover` contract places on the bottom floor, the victory check and the tracker that
 * pays each completed contract's reward into the run's at-risk total.
 *
 * - **Progress** comes from the objective engine (ETH-114, `objectives.ts`): each contract is a
 *   tracked objective with owner `contract`, and `contractProgress` measures it. A `recover`
 *   contract is recomputed from the run state, so it is complete while a living party member
 *   carries its item. `syncContracts` (the domain's turn and step hooks) syncs the objectives,
 *   mirrors each contract's into the slice and emits `contractCompleted`, `contractProgress` and
 *   `contractLost` as it changes.
 * - **Victory:** `victory.contracts` applies once the run has a contract, and is met when every
 *   one is complete as the party walks out.
 * - **Rewards:** `track.contracts` keeps each contract's reward and whether it is complete; its
 *   `rewards` are the completed ones' sum. Its extras (`ContractRecord[]`) go to the run summary
 *   and the run history.
 */
import { CONTRACTS, ITEMS } from '../../content';
import { objectiveOwnerKey } from '../../content';
import type { ContractDef, ObjectiveOwner, RecoverObjective } from '../../content';
import { DIRS_8, Grid, Rng } from '../../core';
import type { Pos } from '../../core';
import type { FloorPlanHook, RunTracker, VictoryCheck } from '../domain';
import type { Emit, SimEvent } from '../events';
import type { FloorPlan } from '../floorText';
import { dungeonDepth, floorIdAt } from '../floors/dungeon';
import { inventoryOf } from '../items/inventory';
import type { RewardAmounts } from '../run/result';
import { Terrain } from '../state';
import type { EntityId, FloorId, RunConfig, RunState } from '../state';
import { findObjective, finishObjectivesStep, measureObjective, newObjective, syncObjectives } from './objectives';
import type { ObjectiveProgress, TrackedObjective } from './objectives';

/** One selected contract in the run: `state.domains.quests.contracts[i]`. */
export interface ContractState {
  /** The contract def id (`contract.recover_relic`). */
  contract: string;
  /** How far along it is: `current` of `target` (a `recover` contract: 1 of 1 while carried). */
  progress: { current: number; target: number };
  complete: boolean;
}

/** One contract as the run summary and the run history see it: `RunResult.extras['track.contracts']`. */
export interface ContractRecord {
  contract: string;
  /** What it pays when complete (currency id → amount). */
  reward: RewardAmounts;
  complete: boolean;
}

/** The contract ids a config selects, checked. Throws a `RangeError` on an unknown or repeated id. */
export function configContracts(config: RunConfig): string[] {
  const ids = config.contracts ?? [];
  const seen = new Set<string>();
  for (const id of ids) {
    if (!CONTRACTS.has(id)) throw new RangeError(`Unknown contract "${id}"`);
    if (seen.has(id)) throw new RangeError(`The contract "${id}" is selected twice`);
    seen.add(id);
  }
  return [...ids];
}

/** A contract's def. Throws on an unknown id. */
export function contractDef(id: string): ContractDef {
  return CONTRACTS.get(id);
}

/** A contract's objective owner. */
export function contractOwner(id: string): ObjectiveOwner {
  return { kind: 'contract', id };
}

/**
 * How far along a contract is right now, and who (if anyone) made it so: its objective measured by
 * the engine (with its tracked counter, for an `events` kind). Changes nothing.
 */
export function contractProgress(state: RunState, id: string): ObjectiveProgress {
  const tracked = findObjective(state, objectiveOwnerKey(contractOwner(id)));
  return measureObjective(state, contractDef(id).objective, tracked?.counter ?? 0);
}

/** The tracked objectives for a run's contracts, in contract order: nothing done yet. */
export function initContractObjectives(contracts: readonly ContractState[]): TrackedObjective[] {
  return contracts.map((c) => newObjective(contractOwner(c.contract), contractDef(c.contract).objective));
}

/** The state of each contract a run starts with: nothing done yet. */
export function initContracts(config: RunConfig): ContractState[] {
  return configContracts(config).map((contract) => ({ contract, progress: { current: 0, target: 1 }, complete: false }));
}

/** The reward of a contract, as at-risk amounts. A fresh copy. */
export function contractReward(id: string): RewardAmounts {
  return { ...contractDef(id).reward };
}

/**
 * Emits `contractsTaken` once, on the run's first turn, so the log says what the party is out
 * to do and the tracker knows each contract's reward. Nothing for a run without contracts.
 */
export function announceContracts(state: RunState, emit: Emit): void {
  const slice = state.domains.quests;
  if (slice.announced) return;
  slice.announced = true;
  if (slice.contracts.length === 0) return;
  emit({ type: 'contractsTaken', contracts: slice.contracts.map((c) => ({ contract: c.contract, reward: contractReward(c.contract) })) });
}

/**
 * Syncs the run's objectives (`syncObjectives`, folding `events`, the step so far) and, for each
 * contract whose objective changed, stores its progress and emits `contractCompleted` when it
 * becomes complete, `contractLost` when a complete one no longer is (its relic's bearer fell),
 * and `contractProgress` when it moves without either. `finish` ends the step for the engine
 * (`stepEnd`). Nothing is emitted for changes the run end makes.
 */
export function syncContracts(state: RunState, emit: Emit, events: readonly SimEvent[] = [], finish = false): void {
  const changes = finish ? finishObjectivesStep(state, events) : syncObjectives(state, events);
  for (const change of changes) {
    const o = change.objective;
    if (o.owner.kind !== 'contract') continue;
    const c = state.domains.quests.contracts.find((x) => x.contract === o.owner.id);
    if (c === undefined) continue;
    const complete = o.status === 'complete';
    const moved = o.current !== c.progress.current || o.target !== c.progress.target;
    const was = c.complete;
    c.progress = { current: o.current, target: o.target };
    c.complete = complete;
    if (change.atRunEnd) continue;
    if (complete && !was) {
      const by = change.by;
      emit({
        type: 'contractCompleted',
        contract: c.contract,
        actor: by?.id ?? null,
        reward: contractReward(c.contract),
        floor: by?.floor ?? state.dungeon.entry,
        pos: by === undefined ? { x: 0, y: 0 } : { x: by.pos.x, y: by.pos.y },
      });
    } else if (!complete && was) {
      emit({ type: 'contractLost', contract: c.contract });
    } else if (moved) {
      emit({ type: 'contractProgress', contract: c.contract, current: o.current, target: o.target });
    }
  }
}

/** True once the run has contracts and every one is complete right now. */
export function contractsComplete(state: RunState): boolean {
  const ids = state.domains.quests.contracts.map((c) => c.contract);
  return ids.length > 0 && ids.every((id) => {
    const p = contractProgress(state, id);
    return p.current >= p.target;
  });
}

/** The contracts not yet complete, by name: "Recover the relic". */
function unfinished(state: RunState): string[] {
  return state.domains.quests.contracts
    .filter((c) => {
      const p = contractProgress(state, c.contract);
      return p.current < p.target;
    })
    .map((c) => contractDef(c.contract).name);
}

/** "A", "A and B", "A, B and C". */
function list(names: readonly string[]): string {
  return names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names.at(-1) as string}`;
}

/** `victory.contracts`: the party wins by walking out with every contract complete. */
export const CONTRACTS_VICTORY: VictoryCheck = {
  id: 'victory.contracts',
  check(state) {
    const contracts = state.domains.quests.contracts;
    if (contracts.length === 0) return { applies: false, met: false, detail: '' };
    const open = unfinished(state);
    if (open.length === 0) {
      const names = list(contracts.map((c) => contractDef(c.contract).name));
      return { applies: true, met: true, detail: contracts.length === 1 ? `The contract was done: ${names}.` : `Every contract was done: ${names}.` };
    }
    return { applies: true, met: false, detail: `${list(open)} ${open.length === 1 ? 'was' : 'were'} left undone.` };
  },
};

/**
 * `track.contracts`: each contract's reward and whether it is complete, from `contractsTaken`,
 * `contractCompleted` and `contractLost`. Pays the completed ones' rewards into the at-risk total.
 */
export const CONTRACTS_TRACKER: RunTracker<{ contracts: ContractRecord[] }> = {
  id: 'track.contracts',
  init: () => ({ contracts: [] }),
  reduce: (s, e) => {
    if (e.type === 'contractsTaken') return { contracts: e.contracts.map((c) => ({ contract: c.contract, reward: { ...c.reward }, complete: false })) };
    if (e.type === 'contractCompleted' || e.type === 'contractLost') {
      const complete = e.type === 'contractCompleted';
      return { contracts: s.contracts.map((c) => (c.contract === e.contract ? { ...c, reward: { ...c.reward }, complete } : c)) };
    }
    return s;
  },
  rewards: (s) => {
    const total: RewardAmounts = {};
    for (const c of s.contracts) {
      if (!c.complete) continue;
      for (const [key, amount] of Object.entries(c.reward)) total[key] = (total[key] ?? 0) + amount;
    }
    return total;
  },
  extras: (s) => s.contracts,
};

// ---------------------------------------------------------------------------------------------
// The relic on the bottom floor

/**
 * Where the relic goes on a bottom floor: a free floor tile (no feature, start, item or creature)
 * in the farthest quarter of the floor by walking distance from the stairs up (or the first start,
 * on a hand-built floor without them), picked with the floor's own contract RNG. `null` if the
 * floor has no free tile.
 */
export function relicTile(plan: FloorPlan, rng: Rng): Pos | null {
  const terrain = plan.terrain;
  const taken = new Set<number>();
  const key = (p: Pos) => p.y * terrain.width + p.x;
  for (const f of plan.features) taken.add(key(f.pos));
  for (const s of plan.starts) taken.add(key(s));
  for (const i of plan.items ?? []) taken.add(key(i.pos));
  for (const s of plan.spawns ?? []) taken.add(key(s.pos));

  const up = plan.features.find((f) => f.feature.kind === 'stairs' && f.feature.dir === 'up')?.pos ?? plan.starts[0];
  // Walking distances from the stairs up; without them, every floor tile counts as distance 0.
  const dist = new Grid(terrain.width, terrain.height, 'i32', -1);
  const tiles: Pos[] = [];
  if (up !== undefined && terrain.get(up.x, up.y) === Terrain.Floor) {
    dist.set(up.x, up.y, 0);
    const queue: Pos[] = [up];
    for (const p of queue) {
      tiles.push(p);
      for (const d of DIRS_8) {
        const x = p.x + d.x;
        const y = p.y + d.y;
        if (!terrain.inBounds(x, y) || dist.get(x, y) !== -1 || terrain.get(x, y) !== Terrain.Floor) continue;
        dist.set(x, y, dist.get(p.x, p.y) + 1);
        queue.push({ x, y });
      }
    }
  } else {
    for (let y = 0; y < terrain.height; y++) {
      for (let x = 0; x < terrain.width; x++) {
        if (terrain.get(x, y) !== Terrain.Floor) continue;
        dist.set(x, y, 0);
        tiles.push({ x, y });
      }
    }
  }
  const free = tiles.filter((p) => !taken.has(key(p)));
  if (free.length === 0) return null;
  const far = Math.max(...free.map((p) => dist.get(p.x, p.y)));
  const cut = Math.floor((far * 3) / 4);
  const candidates = free.filter((p) => dist.get(p.x, p.y) >= cut).sort((a, b) => key(a) - key(b));
  return rng.pick(candidates);
}

/** The RNG a floor's contract items are placed with: from the run seed and the floor id alone. */
export function contractRng(seed: number, floorId: FloorId): Rng {
  return Rng.seeded(seed, `contracts/${floorId}`);
}

/**
 * `quests.relic`: on its floor (the bottom floor, or the one a `recover` objective names with
 * `depth`), each selected `recover` contract's item is put on a free tile far from the stairs up
 * (`relicTile`). Deterministic from the seed, the config and the floor.
 */
export const RELIC_PLAN_HOOK: FloorPlanHook = {
  id: 'quests.relic',
  apply(state, floorId, plan) {
    const rng = contractRng(state.seed, floorId);
    for (const id of configContracts(state.config)) {
      const { objective } = contractDef(id);
      if (objective.kind !== 'recover' || !ITEMS.has(objective.item) || relicFloorId(state, objective) !== floorId) continue;
      const pos = relicTile(plan, rng);
      if (pos === null) throw new Error(`Floor "${floorId}" has no free tile for the ${ITEMS.get(objective.item).name}`);
      plan.items = [...(plan.items ?? []), { pos, item: { def: objective.item, qty: 1 } }];
    }
  },
};

/** Where a contract's relic is now, for the invariants: carried by a party member, or lying on a built floor. */
export function relicCount(state: RunState, item: string): { carried: EntityId[]; lying: number } {
  const carried: EntityId[] = [];
  let lying = 0;
  for (const e of Object.values(state.entities)) {
    if (e.item?.def === item) lying += e.item.qty;
    if (inventoryOf(e).some((i) => i.def === item)) carried.push(e.id);
  }
  return { carried, lying };
}

/** The bottom floor's id, whether or not it has been built. */
export function bottomFloorId(state: RunState): FloorId {
  return floorIdAt(dungeonDepth(state));
}

/**
 * The floor a `recover` objective's item lies on, whether or not it has been built: the floor
 * `depth` names, or the bottom floor (also when the dungeon is shallower than `depth`).
 */
export function relicFloorId(state: RunState, objective: RecoverObjective): FloorId {
  return floorIdAt(Math.min(objective.depth ?? Number.MAX_SAFE_INTEGER, dungeonDepth(state)));
}
