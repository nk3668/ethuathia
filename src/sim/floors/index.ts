/**
 * The floors domain (ETH-058): the dungeon's depth, stairs between floors, floors built the
 * first time someone reaches them, and the baseline's descent (docs/ARCHITECTURE.md §3.6).
 *
 * - `dungeon.ts`: the dungeon graph, `ensureFloor` (lazy, deterministic floor building) and the
 *   stairs links.
 * - `rules.ts`: the conditions and rule actions the baseline descends with.
 * - `fountains.ts` (ETH-072): the fountain gen step, the fountain cap, and the rule condition and
 *   rule action the baseline drinks with. The `drink` action and its events are here.
 * - Here: the events, the `stairs` action, the state and snapshot slices and the invariants.
 *
 * Other domains react to arrivals through the `floorEntered` event (in a run tracker or a
 * trigger): depth rewards, contracts that complete on reaching a floor, run end at the exit.
 * Never import `domains.ts` or `index.ts` from this folder.
 */
import { DRAUGHTS, FEATURE_FOUNTAIN, FEATURE_STAIRS_DOWN, FEATURE_STAIRS_UP } from '../../content';
import type { Pos } from '../../core';
import type { ActionRecord } from '../actions';
import type { CommandRecord } from '../commands';
import type { SimDomain, SnapshotCtx } from '../domain';
import { featureAt, moveEntity } from '../entities';
import { registerInvariant } from '../invariants';
import { runEffects } from '../stats/effects';
import { grantDepthXp } from '../stats/leveling';
import type { EntityId, FloorId, RunConfig } from '../state';
import { arrivalStairs, arrivalTile, dungeonDepth, floorIdAt, floorNode, floorTypeOf, stairsOn, stairsTarget } from './dungeon';
import type { StairsDir } from './dungeon';
import { fountainAt, FOUNTAIN_CONDITIONS, FOUNTAIN_GEN_STEPS, FOUNTAIN_RULE_ACTIONS } from './fountains';
import { FLOORS_CONDITIONS, FLOORS_RULE_ACTIONS, names, stairsGathering } from './rules';

export * from './dungeon';
export * from './rules';
export * from './fountains';

/** The events this domain emits (bodies, without `turn`). Each has wording in `ui/shell/logText/floors.ts`. */
export type FloorsEvent =
  /**
   * `actor` took the stairs going `dir` from floor `from` and arrived on floor `to` (at depth
   * `depth`) at `pos`: on the linked stairs, or next to them if someone was standing there.
   */
  | { type: 'tookStairs'; actor: EntityId; dir: StairsDir; from: FloorId; to: FloorId; depth: number; pos: Pos }
  /**
   * `actor` arrived on `floor` (at `depth`). `firstVisit` is true when nobody had been there, so
   * the floor was just built. The hook for anything that happens on arrival: depth rewards,
   * contracts, the run ending at the exit. Not emitted for the floor a run starts on. `floorType`
   * is the floor type it is built from (`floor.halls`, for the Codex), `null` if hand-built.
   */
  | { type: 'floorEntered'; actor: EntityId; floor: FloorId; depth: number; firstVisit: boolean; floorType: string | null }
  /**
   * `actor` led the party (`party`: every living member, gathered at the stairs) up the first
   * floor's stairs and out of the dungeon, at `pos` on `floor`. The run domain ends the run on it:
   * a victory if its victory checks pass, else a retreat (ETH-062).
   */
  | { type: 'leftDungeon'; actor: EntityId; party: EntityId[]; floor: FloorId; pos: Pos }
  /**
   * `actor` drank `draught` (a `draught.*` id) from the fountain entity `fountain` at `pos` on
   * `floor`, which has `left` draughts left. The draught's effects follow as their own events.
   */
  | { type: 'drankFountain'; actor: EntityId; fountain: EntityId; draught: string; left: number; floor: FloorId; pos: Pos }
  /** The fountain entity `fountain` at `pos` on `floor` has run dry. */
  | { type: 'fountainRanDry'; fountain: EntityId; floor: FloorId; pos: Pos };

/** Take the stairs you are standing on, going `dir`. */
export interface StairsRequest {
  id: 'stairs';
  dir: StairsDir;
}

/** Drink from the fountain you are standing on (ETH-072). */
export interface DrinkRequest {
  id: 'drink';
}

/** The action requests this domain defines. */
export type FloorsRequest = StairsRequest | DrinkRequest;

/** The commands this domain accepts. */
export type FloorsCommand = never;

/** This domain's slice of the run state, at `state.domains.floors`. Plain data. */
export interface FloorsState {
  /** The deepest floor depth any party member has reached. */
  deepest: number;
  /**
   * The game turn the party first arrived on each floor it has reached (the run's first floor at
   * turn 0). The per-floor turn cap counts from here.
   */
  arrived: Record<FloorId, number>;
}

/** This domain's slice of the snapshot, at `snapshot.domains.floors`. Plain data. */
export interface FloorsSnapshot {
  /** How many floors the dungeon has: the N of "Floor x/N". */
  depth: number;
  /** The deepest floor the party has reached. */
  deepest: number;
}

/** Optional parts this domain adds to `Entity`. None: stairs are core `feature` parts. */
export interface FloorsParts {}

/** Fields this domain adds to `RunConfig`. */
export interface FloorsConfig {
  /** How many floors the dungeon has, 1 to `MAX_DEPTH`. Default `DEFAULT_DEPTH` (10). */
  depth?: number;
  /**
   * Hand-built floors by depth (index 0 is floor 1), as text for `parseFloorText`. Floors with no
   * entry are generated. `floorText`, if set, takes the place of the first entry.
   */
  floorTexts?: string[][];
  /** Game turns the party may spend on a floor before the baseline moves on. Default `FLOOR_TURN_CAP`. */
  floorTurnCap?: number;
  /**
   * The most fountains a floor may have (ETH-072); extra ones are left out after generation, so
   * nothing else on the floor changes. 0 means no fountains (the Dry Wells Omen, ETH-067). Leave
   * it out for as many as the floor type places (0–2 on Hewn Halls).
   */
  maxFountains?: number;
}

/** This domain's row in `DomainTypes` (`src/sim/domain.ts`). */
export interface FloorsTypes {
  event: FloorsEvent;
  request: FloorsRequest;
  command: FloorsCommand;
  state: FloorsState;
  snapshot: FloorsSnapshot;
}

const isDir = (value: unknown): value is StairsDir => value === 'up' || value === 'down';

export const FLOORS_ACTIONS: ActionRecord<FloorsRequest> = {
  stairs: {
    id: 'stairs',
    name: 'Take the stairs',
    description:
      'Go up or down the stairs you are standing on, arriving on the linked stairs of the floor above or below. ' +
      'A floor nobody has reached yet is discovered on arrival; floors already visited are as the party left them. ' +
      'The first floor’s stairs up lead out of the dungeon: the whole party must be gathered there, and leaving ends the run.',
    tags: [],
    cost: 100,
    parse: (raw) => (isDir(raw.dir) ? { id: 'stairs', dir: raw.dir } : 'The direction must be "up" or "down"'),
    validate: ({ state, actor }, { dir }) => {
      const here = featureAt(state, actor.floor, actor.pos)?.feature;
      if (here?.kind !== 'stairs' || here.dir !== dir) return `There are no stairs ${dir} here`;
      if (stairsTarget(state, actor.floor, dir) === null) {
        if (dir === 'down') return 'These stairs lead nowhere';
        // The way out of the dungeon: the party leaves together, which ends the run (ETH-062).
        const { missing } = stairsGathering(state, actor.floor, actor.pos, 'up');
        if (missing.length > 0) {
          return `These stairs lead out of the dungeon, and the party leaves together: ${names(missing)} ${missing.length === 1 ? 'is' : 'are'} not here yet`;
        }
      }
      return null;
    },
    execute: ({ state, actor, emit }, { dir }) => {
      const from = actor.floor;
      const to = stairsTarget(state, from, dir);
      if (to === null) {
        const { gathered } = stairsGathering(state, from, actor.pos, 'up');
        emit({ type: 'leftDungeon', actor: actor.id, party: gathered.map((g) => g.id), floor: from, pos: { x: actor.pos.x, y: actor.pos.y } });
        return;
      }
      const firstVisit = state.floors[to] === undefined;
      const pos = arrivalTile(state, to, arrivalStairs(state, to, dir));
      if (pos === null) throw new Error(`Floor "${to}" has no free tile to arrive on`);
      moveEntity(state, actor.id, to, pos);
      const depth = floorNode(state, to).depth;
      const slice = state.domains.floors;
      if (slice.arrived[to] === undefined) slice.arrived[to] = state.turn;
      const deeper = depth > slice.deepest;
      slice.deepest = Math.max(slice.deepest, depth);
      emit({ type: 'tookStairs', actor: actor.id, dir, from, to, depth, pos: { x: pos.x, y: pos.y } });
      emit({ type: 'floorEntered', actor: actor.id, floor: to, depth, firstVisit, floorType: floorTypeOf(state, to) });
      // A new deepest floor is worth XP to every living member (ETH-034).
      if (deeper) grantDepthXp(state, to, depth, emit);
    },
  },
  drink: {
    id: 'drink',
    name: 'Drink from a fountain',
    description:
      'Drink from the fountain you are standing on. Each drink is the next draught the fountain holds: mending ' +
      'water, a short blessing, a mild upset or plain water. A fountain runs dry after a few draughts.',
    tags: [],
    cost: 100,
    parse: () => ({ id: 'drink' }),
    validate: ({ state, actor }) => {
      const fountain = fountainAt(state, actor.floor, actor.pos);
      if (fountain === undefined) return 'There is no fountain here';
      return fountain.feature.draughts.length === 0 ? 'The fountain is dry' : null;
    },
    execute: ({ state, actor, emit }) => {
      const fountain = fountainAt(state, actor.floor, actor.pos);
      const draught = fountain?.feature.draughts.shift();
      if (fountain === undefined || draught === undefined) return;
      const floor = actor.floor;
      const pos = { x: fountain.pos.x, y: fountain.pos.y };
      const left = fountain.feature.draughts.length;
      emit({ type: 'drankFountain', actor: actor.id, fountain: fountain.id, draught, left, floor, pos });
      if (DRAUGHTS.has(draught)) {
        runEffects({ state, emit, self: actor.id, source: draught, potency: 1 }, DRAUGHTS.get(draught).bundle.effects ?? []);
      }
      if (left === 0) emit({ type: 'fountainRanDry', fountain: fountain.id, floor, pos: { x: pos.x, y: pos.y } });
    },
  },
};

export const FLOORS_COMMANDS: CommandRecord<FloorsCommand> = {};

/** The state slice for a new run: the party starts on the first floor at turn 0. */
export function initFloors(_config: RunConfig): FloorsState {
  return { deepest: 1, arrived: { [floorIdAt(1)]: 0 } };
}

/** The snapshot slice. Shares nothing with the state. */
export function floorsSnapshot({ state }: SnapshotCtx): FloorsSnapshot {
  return { depth: dungeonDepth(state), deepest: state.domains.floors.deepest };
}

/** The dungeon is a straight line `d1` … `dN` with matching links, `N` the config's depth. */
registerInvariant('floors.graph', (state) => {
  const problems: string[] = [];
  const depth = dungeonDepth(state);
  if (state.config.depth !== undefined && depth !== state.config.depth) {
    problems.push(`the dungeon has ${depth} floors, the config asks for ${state.config.depth}`);
  }
  if (state.dungeon.entry !== floorIdAt(1)) problems.push(`the entry is "${state.dungeon.entry}", not "${floorIdAt(1)}"`);
  for (let d = 1; d <= depth; d++) {
    const id = floorIdAt(d);
    const node = state.dungeon.nodes[id];
    if (node === undefined) {
      problems.push(`floor "${id}" is missing from the graph`);
      continue;
    }
    const up = d === 1 ? null : floorIdAt(d - 1);
    const down = d === depth ? [] : [floorIdAt(d + 1)];
    if (node.depth !== d || node.up !== up || JSON.stringify(node.down) !== JSON.stringify(down)) {
      problems.push(`floor "${id}" is linked as depth ${node.depth}, up ${String(node.up)}, down [${node.down.join(', ')}]`);
    }
  }
  return problems;
});

/**
 * The slice agrees with the floors: every reached floor is built and was reached no later than
 * now, `deepest` is the deepest of them, every party member stands on a reached floor, and the
 * bottom floor has no stairs down.
 */
registerInvariant('floors.state', (state) => {
  const problems: string[] = [];
  const { deepest, arrived } = state.domains.floors;
  let max = 0;
  for (const [id, turn] of Object.entries(arrived)) {
    const floor = state.floors[id];
    if (floor === undefined) problems.push(`floor "${id}" was reached but is not built`);
    else max = Math.max(max, floor.depth);
    if (!Number.isSafeInteger(turn) || turn < 0 || turn > state.turn) problems.push(`floor "${id}" was reached on turn ${turn}`);
  }
  if (deepest !== max) problems.push(`deepest is ${deepest}, but the deepest floor reached is ${max}`);
  for (const id of state.party) {
    const floor = state.entities[id]?.floor;
    if (floor !== undefined && arrived[floor] === undefined) problems.push(`party member ${id} is on "${floor}", which was never reached`);
  }
  const bottom = floorIdAt(dungeonDepth(state));
  if (state.floors[bottom] !== undefined && stairsOn(state, bottom, 'down') !== undefined) {
    problems.push(`the bottom floor "${bottom}" has stairs down`);
  }
  return problems;
});

/** What this domain registers with the shared code, in this order. */
export const FLOORS_DOMAIN: SimDomain<FloorsTypes> = {
  actions: FLOORS_ACTIONS,
  commands: FLOORS_COMMANDS,
  init: initFloors,
  snapshot: floorsSnapshot,
  conditions: [...FLOORS_CONDITIONS, ...FOUNTAIN_CONDITIONS],
  ruleActions: [...FLOORS_RULE_ACTIONS, ...FOUNTAIN_RULE_ACTIONS],
  genSteps: FOUNTAIN_GEN_STEPS,
  discoveries: {
    tookStairs: (e) => [{ id: e.dir === 'up' ? FEATURE_STAIRS_UP.id : FEATURE_STAIRS_DOWN.id, mark: 'used' }],
    drankFountain: (e) => [
      { id: FEATURE_FOUNTAIN.id, mark: 'used' },
      ...(DRAUGHTS.has(e.draught) ? [{ id: e.draught, mark: 'seen' as const }] : []),
    ],
    // The floor type (ETH-064) is seen on arrival; hand-built floors have none.
    floorEntered: (e) => (e.floorType === null ? [] : [{ id: e.floorType, mark: 'seen' }]),
  },
};
