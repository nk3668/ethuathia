/**
 * Starting a run: `createRun` builds the initial `RunState` from a config and a seed.
 */
import { clonePlain, Grid, seedStreams } from '../core';
import type { Pos } from '../core';
import { CLASSES, RACES } from '../content';
import { newAiPart } from './ai/types';
import { initDomains } from './domains';
import { actorAt, addEntity, addFloor, featureAt, getFloor } from './entities';
import { buildDungeon, configDepth, DEFAULT_FLOOR_TYPE, planFloor } from './floors';
import type { FloorPlan } from './floorText';
import { perceiveParty } from './perception';
import { DEFS, RNG_STREAMS, STATE_VERSION, Terrain } from './state';
import type { ActorPart, AdventurerConfig, FloorId, RunConfig, RunState } from './state';

/** The floor type the first floor is generated from when the config has no `floorText`. */
export const FIRST_FLOOR_TYPE = DEFAULT_FLOOR_TYPE;

/**
 * An adventurer's starting actor values from its class and race: the class's HP and MP plus the
 * race's bonuses, at full, and the race's speed. Throws, naming the adventurer, on an unknown
 * class or race id.
 */
export function adventurerActor(member: AdventurerConfig): ActorPart {
  if (!CLASSES.has(member.classId)) throw new Error(`Adventurer "${member.name}" has unknown class id "${member.classId}"`);
  if (!RACES.has(member.raceId)) throw new Error(`Adventurer "${member.name}" has unknown race id "${member.raceId}"`);
  const cls = CLASSES.get(member.classId);
  const race = RACES.get(member.raceId);
  const maxHp = cls.hp + race.hpBonus;
  const maxMp = cls.mp + race.mpBonus;
  return { energy: 0, speed: race.speed, hp: maxHp, maxHp, mp: maxMp, maxMp, faction: 'party' };
}

/**
 * A new run: RNG streams seeded from `seed`, a dungeon graph `config.depth` floors deep (default
 * `DEFAULT_DEPTH`), its first floor built from `config.floorText` or else generated (`planFloor`;
 * the other floors are built when first reached, `ensureFloor`), and the party placed at
 * the floor's `@` marks, or on its up stairs if it has none. Extra party members go on the
 * nearest free floor tiles, and the party's memory starts with what they can see. Each
 * adventurer's HP, MP and speed come from its class and race (`adventurerActor`), so an unknown
 * class or race id throws. Each domain's state slice comes from `initDomains(config)`.
 * `config` is copied, not kept.
 */
export function createRun(config: RunConfig, seed: number): RunState {
  if (config.party.length === 0) throw new Error('A run needs at least one adventurer');
  const actors = config.party.map(adventurerActor);
  const dungeon = buildDungeon(configDepth(config));
  const entry = dungeon.entry;
  const state: RunState = {
    version: STATE_VERSION,
    seed,
    rng: seedStreams(seed, RNG_STREAMS),
    turn: 0,
    config: clonePlain(config),
    dungeon,
    floors: {},
    memory: {},
    entities: {},
    party: [],
    nextEntityId: 1,
    domains: clonePlain(initDomains(config)),
  };

  const plan = planFloor(state, entry);
  addFloor(state, entry, plan);
  const starts = startPositions(state, entry, plan, config.party.length);
  config.party.forEach((member, i) => {
    const entity = addEntity(state, {
      def: DEFS.adventurer,
      floor: entry,
      pos: starts[i] as Pos,
      actor: actors[i] as ActorPart,
      adventurer: { name: member.name, classId: member.classId, raceId: member.raceId },
      ai: newAiPart(),
    });
    state.party.push(entity.id);
  });
  perceiveParty(state);
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
