/**
 * Getting around, for rule actions: the path grid an adventurer plans on, the exploration
 * frontier, and turning one step along a goal map into an action.
 */
import type { Grid, Pos } from '../../core';
import { MONSTERS } from '../../content';
import { blockerAt, featureAt, getEntity, getFloor } from '../entities';
import { memoryPathGrid, OPEN_DOOR_COST, stepToward } from '../goalMap';
import type { PathGrid } from '../goalMap';
import { getMemory } from '../perception';
import { RULE_ACTIONS } from '../registries';
import type { Entity } from '../state';
import type { AiCtx, Resolved } from './types';

/**
 * Extra cost to step onto a tile another actor stands on, so a route around them wins when there
 * is one that isn't much longer. They usually move on, so the tile is not blocked outright.
 */
export const OCCUPIED_COST = 8;

/**
 * The grid the actor plans on: the party's memory of its floor, with closed doors costing the
 * turn it takes to open them, and tiles where it knows another actor stands costing
 * `OCCUPIED_COST` more, or blocked outright if `occupied` is `'blocked'`. It knows where its
 * party is, and feels anyone right next to it.
 */
export function aiPathGrid({ state, actor }: AiCtx, occupied: 'costly' | 'blocked' = 'costly'): PathGrid {
  const paths = memoryPathGrid(state, actor.floor, { closedDoorCost: OPEN_DOOR_COST });
  const { width } = paths;
  for (const id of getFloor(state, actor.floor).entities) {
    if (id === actor.id) continue;
    const other = getEntity(state, id);
    if (other.actor === undefined) continue;
    const near = Math.abs(other.pos.x - actor.pos.x) <= 1 && Math.abs(other.pos.y - actor.pos.y) <= 1;
    if (!near && !state.party.includes(id)) continue;
    const i = other.pos.y * width + other.pos.x;
    const cost = paths.cost[i] as number;
    if (cost !== 0) paths.cost[i] = occupied === 'blocked' ? 0 : Math.min(0xffff, cost + OCCUPIED_COST);
  }
  return paths;
}

/**
 * The exploration frontier of the actor's floor: tiles the actor could plan to enter (non-zero
 * cost in `paths`) with at least one neighbor nobody has seen. Standing on one shows all of its
 * neighbors, since an adjacent tile is always in view, so reaching a frontier tile always
 * removes it from the frontier.
 */
export function frontier({ state, actor }: AiCtx, paths: PathGrid): Pos[] {
  const seen = getMemory(state, actor.floor).terrain.cells;
  const { width, height, cost } = paths;
  const tiles: Pos[] = [];
  // Hot: runs over the whole floor at every exploring decision, so plain loops, no closures.
  for (let y = 0; y < height; y++) {
    const y0 = y > 0 ? y - 1 : 0;
    const y1 = y < height - 1 ? y + 1 : y;
    for (let x = 0; x < width; x++) {
      if (cost[y * width + x] === 0) continue;
      const x0 = x > 0 ? x - 1 : 0;
      const x1 = x < width - 1 ? x + 1 : x;
      let open = false;
      for (let ny = y0; ny <= y1 && !open; ny++) {
        for (let nx = x0; nx <= x1; nx++) {
          if (seen[ny * width + nx] === 0 && (nx !== x || ny !== y)) {
            open = true;
            break;
          }
        }
      }
      if (open) tiles.push({ x, y });
    }
  }
  return tiles;
}

/**
 * The action that takes the actor one step down `map`: a move, opening the closed door in the
 * way, swapping places with a willing party member on the next tile (`willingToSwap`), or
 * waiting for whoever stands there to move. `null` if there is no step (the actor is at a goal or
 * can't reach one).
 */
export function followMap(ctx: AiCtx, paths: PathGrid, map: Grid, detail: string): Resolved | null {
  const { state, actor } = ctx;
  const dir = stepToward(paths, map, actor.pos);
  if (dir === null) return null;
  const to = { x: actor.pos.x + dir.x, y: actor.pos.y + dir.y };
  const other = blockerAt(state, actor, actor.floor, to);
  if (other !== undefined) {
    if (willingToSwap(ctx, other)) {
      return { request: { id: 'swap', dir }, detail: `${detail}; squeezing past ${nameOf(other)}` };
    }
    return {
      request: { id: 'wait' },
      detail: `${detail}; waiting for ${nameOf(other)} to get out of the way`,
      waitingFor: other.id,
    };
  }
  const door = featureAt(state, actor.floor, to)?.feature;
  if (door?.kind === 'door' && !door.open) return { request: { id: 'openDoor', dir }, detail: `${detail}; opening a door` };
  return { request: { id: 'move', dir }, detail };
}

/**
 * Whether `other`, standing where the actor wants to step, will trade places with it. Both must
 * be in the party, and `other` must be AI-driven and either waiting on the actor (its last
 * decision was blocked by the actor, so each wants the other's tile) or with nowhere to be (no
 * decision yet, or an idle one such as waiting). A member heading somewhere else is left alone,
 * so the actor waits behind it instead of pushing it back the way it came. Deterministic: it
 * depends only on the run state.
 */
export function willingToSwap({ actor }: AiCtx, other: Entity): boolean {
  if (actor.actor.faction !== 'party' || other.actor?.faction !== 'party' || other.ai === undefined) return false;
  // The player moves a possessed adventurer; the AI never pushes it around (ETH-066).
  if (other.ai.possessed === true) return false;
  const memory = other.ai.memory;
  if (memory.waitingFor === actor.id) return true;
  const intent = memory.intent;
  return intent === null || (RULE_ACTIONS.has(intent.action) && RULE_ACTIONS.get(intent.action).idle);
}

/** A short name for an entity in a reason: an adventurer's name, a monster's kind, else its id. */
export function nameOf(entity: Entity): string {
  if (entity.adventurer !== undefined) return entity.adventurer.name;
  return MONSTERS.has(entity.def) ? `the ${MONSTERS.get(entity.def).name.toLowerCase()}` : `entity ${entity.id}`;
}
