/**
 * Starting a run: `createRun` builds the initial `RunState` from a config and a seed.
 */
import { clonePlain, Grid, seedStreams } from '../core';
import type { Pos } from '../core';
import { actorAt, addEntity, addFloor, featureAt, getFloor } from './entities';
import { parseFloorText } from './floorText';
import type { FloorPlan } from './floorText';
import { DEFS, RNG_STREAMS, STATE_VERSION, Terrain } from './state';
import type { ActorPart, FloorId, RunConfig, RunState } from './state';

/** The floor every run starts on until generation arrives (ETH-006). */
export const M0_FLOOR: readonly string[] = [
  '############################################',
  '#........#############......################',
  '#.<.@....+...........+......################',
  '#........######.######......################',
  '#........######.######......######.......###',
  "######.########.######......'.....+......###",
  '######.########.#################........###',
  '######.########.#################.....>..###',
  '######.########...........#######........###',
  '######.###################.######.......####',
  '######.....+.......#######.......#..########',
  '################.......................#####',
  '############################################',
];

const FIRST_FLOOR: FloorId = 'd1';

/** Starting actor values for an adventurer, until classes and races supply them (ETH-015). */
const ADVENTURER_ACTOR: ActorPart = {
  energy: 0,
  speed: 100,
  hp: 20,
  maxHp: 20,
  mp: 5,
  maxMp: 5,
  faction: 'party',
};

/**
 * A new run: RNG streams seeded from `seed`, a one-floor dungeon built from `config.floorText`
 * (or `M0_FLOOR`), and the party placed at the floor's `@` marks, or on its up stairs if it has
 * none. Extra party members go on the nearest free floor tiles. `config` is copied, not kept.
 */
export function createRun(config: RunConfig, seed: number): RunState {
  if (config.party.length === 0) throw new Error('A run needs at least one adventurer');
  const state: RunState = {
    version: STATE_VERSION,
    seed,
    rng: seedStreams(seed, RNG_STREAMS),
    turn: 0,
    config: clonePlain(config),
    dungeon: { entry: FIRST_FLOOR, nodes: { [FIRST_FLOOR]: { id: FIRST_FLOOR, depth: 1, up: null, down: [] } } },
    floors: {},
    entities: {},
    party: [],
    nextEntityId: 1,
  };

  const plan = parseFloorText(config.floorText ?? M0_FLOOR);
  addFloor(state, FIRST_FLOOR, plan);
  const starts = startPositions(state, FIRST_FLOOR, plan, config.party.length);
  config.party.forEach((member, i) => {
    const entity = addEntity(state, {
      def: DEFS.adventurer,
      floor: FIRST_FLOOR,
      pos: starts[i] as Pos,
      actor: ADVENTURER_ACTOR,
      adventurer: { name: member.name, classId: member.classId, raceId: member.raceId },
    });
    state.party.push(entity.id);
  });
  return state;
}

/**
 * `count` distinct floor tiles to start the party on: the plan's `@` marks in row order, then the
 * nearest tiles to the first one (breadth-first, `DIRS_8` order) with no actor or feature on them.
 */
function startPositions(state: RunState, floorId: FloorId, plan: FloorPlan, count: number): Pos[] {
  const starts = [...plan.starts];
  if (starts.length === 0) {
    const up = plan.features.find((f) => f.feature.kind === 'stairs' && f.feature.dir === 'up');
    if (up === undefined) throw new Error('The first floor needs an @ start or up stairs');
    starts.push(up.pos);
  }
  if (starts.length >= count) return starts.slice(0, count);

  const terrain = Grid.wrap(getFloor(state, floorId).terrain);
  const taken = new Grid(terrain.width, terrain.height, 'u8');
  for (const p of starts) taken.set(p.x, p.y, 1);
  const queue: Pos[] = [starts[0] as Pos];
  for (let i = 0; i < queue.length && starts.length < count; i++) {
    const p = queue[i] as Pos;
    terrain.forEachNeighbor(p.x, p.y, (x, y) => {
      if (taken.get(x, y) === 1 || terrain.get(x, y) !== Terrain.Floor) return;
      taken.set(x, y, 1);
      queue.push({ x, y });
      const free = actorAt(state, floorId, { x, y }) === undefined && featureAt(state, floorId, { x, y }) === undefined;
      if (free && starts.length < count) starts.push({ x, y });
    });
  }
  if (starts.length < count) throw new Error(`No room on the first floor for ${count} adventurers`);
  return starts;
}
