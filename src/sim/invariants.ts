/**
 * State invariants (docs/ARCHITECTURE.md §11): facts about a `RunState` that must hold between
 * steps, whatever the run did. The soak test (`tools/soak.ts`) checks them after every step of
 * many seeded runs, so a change that corrupts the state fails `npm test` even when no unit test
 * looks at the part it broke.
 *
 * There is one list of checks. The core checks below are registered here; a domain (combat,
 * items, quests, ...) registers its own from its module with `registerInvariant`, next to the
 * state it owns.
 */
import { findNonPlain, Grid, isRngState } from '../core';
import { inFloorBounds, mayShareTile } from './entities';
import { RNG_STREAMS, Terrain } from './state';
import type { Entity, RunState } from './state';
import { statValue } from './stats/getStat';

/**
 * Checks one invariant. Returns a readable line for each violation (naming the entity, floor or
 * field at fault), or an empty list when the state is fine. Must not change the state.
 */
export type InvariantCheck = (state: RunState) => string[];

export interface Invariant {
  /** Short, unique, namespaced by domain, e.g. `core.floorIndex` or `combat.hpRange`. */
  readonly name: string;
  readonly check: InvariantCheck;
}

const invariants: Invariant[] = [];

/**
 * Adds a check to the list `checkInvariants` runs, and returns a function that removes it again
 * (for tests). Throws if the name is taken.
 */
export function registerInvariant(name: string, check: InvariantCheck): () => void {
  if (invariants.some((i) => i.name === name)) throw new Error(`Duplicate invariant "${name}"`);
  const entry: Invariant = { name, check };
  invariants.push(entry);
  return () => {
    const i = invariants.indexOf(entry);
    if (i !== -1) invariants.splice(i, 1);
  };
}

/** The registered invariants, in registration order. */
export function listInvariants(): readonly Invariant[] {
  return [...invariants];
}

/**
 * Runs every registered invariant on `state` and returns all violations, each prefixed with the
 * invariant's name: `[core.positions] entity 4 at (99, 2) is outside floor "d1"`. A check that
 * throws counts as a violation rather than stopping the others. Empty means the state is sound.
 */
export function checkInvariants(state: RunState): string[] {
  const problems: string[] = [];
  for (const { name, check } of invariants) {
    try {
      for (const problem of check(state)) problems.push(`[${name}] ${problem}`);
    } catch (error) {
      problems.push(`[${name}] check threw: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return problems;
}

// ---------------------------------------------------------------------------------------------
// Core checks

/** Plain data only: no NaN or infinities, no `undefined`, class instances or shared references. */
registerInvariant('core.plainData', (state) => {
  const problem = findNonPlain(state);
  return problem === null ? [] : [problem];
});

/** The run-level counters and RNG streams. */
registerInvariant('core.run', (state) => {
  const problems: string[] = [];
  if (!Number.isSafeInteger(state.turn) || state.turn < 0) problems.push(`turn is ${state.turn}`);
  if (!Number.isSafeInteger(state.nextEntityId) || state.nextEntityId < 1) {
    problems.push(`nextEntityId is ${state.nextEntityId}`);
  }
  for (const stream of RNG_STREAMS) {
    if (!isRngState(state.rng[stream])) problems.push(`RNG stream "${stream}" has a bad state`);
  }
  return problems;
});

/** Entity ids match their keys and were handed out by `nextEntityId`. */
registerInvariant('core.entityIds', (state) => {
  const problems: string[] = [];
  for (const [key, entity] of Object.entries(state.entities)) {
    if (String(entity.id) !== key) problems.push(`entity under key ${key} has id ${entity.id}`);
    if (!Number.isSafeInteger(entity.id) || entity.id < 1 || entity.id >= state.nextEntityId) {
      problems.push(`entity ${entity.id} is outside the ids handed out (1 to ${state.nextEntityId - 1})`);
    }
  }
  return problems;
});

/**
 * Floors and their entity lists agree: every entity is listed exactly once, on the floor its
 * `floor` names, and every listed id is a live entity. Floors, memory and the dungeon graph
 * have the same keys and matching sizes.
 */
registerInvariant('core.floorIndex', (state) => {
  const problems: string[] = [];
  const listedOn = new Map<number, string>();
  for (const [key, floor] of Object.entries(state.floors)) {
    if (floor.id !== key) problems.push(`floor under key "${key}" has id "${floor.id}"`);
    const node = state.dungeon.nodes[key];
    if (node === undefined) problems.push(`floor "${key}" is not in the dungeon graph`);
    else if (node.depth !== floor.depth) problems.push(`floor "${key}" has depth ${floor.depth}, its node ${node.depth}`);
    const memory = state.memory[key];
    if (memory === undefined) problems.push(`floor "${key}" has no party memory`);
    else if (memory.terrain.width !== floor.terrain.width || memory.terrain.height !== floor.terrain.height) {
      problems.push(`floor "${key}" memory is ${memory.terrain.width}x${memory.terrain.height}, the floor ${floor.terrain.width}x${floor.terrain.height}`);
    }
    for (const id of floor.entities) {
      const entity = state.entities[id];
      if (entity === undefined) problems.push(`floor "${key}" lists entity ${id}, which does not exist`);
      else if (entity.floor !== key) problems.push(`floor "${key}" lists entity ${id}, which is on "${entity.floor}"`);
      const other = listedOn.get(id);
      if (other !== undefined) problems.push(`entity ${id} is listed on "${other}" and again on "${key}"`);
      listedOn.set(id, key);
    }
  }
  for (const key of Object.keys(state.memory)) {
    if (state.floors[key] === undefined) problems.push(`party memory of "${key}", which has not been built`);
  }
  for (const entity of Object.values(state.entities)) {
    if (state.floors[entity.floor] === undefined) problems.push(`entity ${entity.id} is on unbuilt floor "${entity.floor}"`);
    else if (!listedOn.has(entity.id)) problems.push(`entity ${entity.id} is missing from floor "${entity.floor}"'s list`);
  }
  return problems;
});

/**
 * Positions are whole tiles inside their floor; actors stand on floor terrain, one per tile,
 * except creatures that share tiles (`sharesTile`), which may stand together with each other.
 */
registerInvariant('core.positions', (state) => {
  const problems: string[] = [];
  const occupied = new Map<string, Entity>();
  for (const entity of Object.values(state.entities)) {
    const floor = state.floors[entity.floor];
    if (floor === undefined) continue; // core.floorIndex reports it.
    const { x, y } = entity.pos;
    if (!inFloorBounds(floor, entity.pos)) {
      problems.push(`entity ${entity.id} at (${x}, ${y}) is outside floor "${floor.id}"`);
      continue;
    }
    if (entity.actor === undefined) continue;
    if (Grid.wrap(floor.terrain).get(x, y) === Terrain.Wall) {
      problems.push(`actor ${entity.id} at (${x}, ${y}) on "${floor.id}" is inside a wall`);
    }
    // A fallen adventurer lies on its tile without taking it up (`isStanding`).
    if (entity.actor.hp <= 0) continue;
    const tile = `${floor.id}:${x},${y}`;
    const other = occupied.get(tile);
    if (other !== undefined && !mayShareTile(other, entity)) {
      problems.push(`actors ${other.id} and ${entity.id} share (${x}, ${y}) on "${floor.id}"`);
    }
    occupied.set(tile, entity);
  }
  return problems;
});

/** Party ids are unique, live adventurers. */
registerInvariant('core.party', (state) => {
  const problems: string[] = [];
  if (new Set(state.party).size !== state.party.length) problems.push(`party has a repeated id: [${state.party.join(', ')}]`);
  for (const id of state.party) {
    const entity = state.entities[id];
    if (entity === undefined) problems.push(`party member ${id} does not exist`);
    else if (entity.actor === undefined || entity.adventurer === undefined) {
      problems.push(`party member ${id} is not an adventurer with an actor part`);
    }
  }
  return problems;
});

/**
 * Actor numbers are in range, and the dead are out of the schedule: an actor at 0 HP or below
 * has no action queued (the scheduler never runs it, so a queued action would be stale).
 */
registerInvariant('core.actors', (state) => {
  const problems: string[] = [];
  for (const entity of Object.values(state.entities)) {
    const a = entity.actor;
    if (a === undefined) continue;
    const maxHp = statValue(state, entity, 'hp');
    const maxMp = statValue(state, entity, 'mp');
    const speed = statValue(state, entity, 'speed');
    if (maxHp <= 0 || a.hp > maxHp) problems.push(`actor ${entity.id} has HP ${a.hp}/${maxHp}`);
    if (maxMp < 0 || a.mp < 0 || a.mp > maxMp) problems.push(`actor ${entity.id} has MP ${a.mp}/${maxMp}`);
    if (speed < 0) problems.push(`actor ${entity.id} has speed ${speed}`);
    if (a.hp <= 0 && a.queued !== undefined) problems.push(`dead actor ${entity.id} still has a queued action`);
  }
  return problems;
});
