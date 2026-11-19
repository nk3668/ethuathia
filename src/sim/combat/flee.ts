/**
 * Breaking away (ETH-081): the `flee` action, a step away that an enemy next to the actor may
 * stop. The chance is the actor's `flee` stat (Finesse, docs/ARCHITECTURE.md Contracts, "Stats").
 *
 * - With no enemy adjacent, or for a creature without attributes (a monster), it is a plain move:
 *   nothing to break away from, or no Finesse to test.
 * - Otherwise one draw from the combat stream: on a success the actor steps away (`moved`), on a
 *   failure it stays put, loses the turn and emits `fleeFailed`.
 */
import { Rng } from '../../core';
import type { Pos } from '../../core';
import type { ActionDef } from '../actions';
import { CORE_ACTIONS, isStep } from '../coreActions';
import type { MoveRequest } from '../coreActions';
import { statValue } from '../stats/getStat';
import { hasAttributes } from '../stats/attributes';
import { adjacentEnemies } from './rules';

/** Step away from the enemies in `dir`, testing Finesse if one is next to the actor. */
export interface FleeRequest {
  id: 'flee';
  dir: Pos;
}

const MOVE = CORE_ACTIONS.move;

function asMove(dir: Pos): MoveRequest {
  return { id: 'move', dir };
}

export const FLEE_ACTION: ActionDef<FleeRequest> = {
  id: 'flee',
  name: 'Flee',
  description:
    'Step away from danger. With an enemy next to you it takes a Flee check (Finesse): fail it and you are held ' +
    'back, losing the turn. Fleeing from enemies further off always works.',
  tags: [],
  cost: MOVE.cost,
  parse: (raw) =>
    isStep(raw.dir) ? { id: 'flee', dir: { x: raw.dir.x, y: raw.dir.y } } : 'The direction must be one step: x and y each -1, 0 or 1, not both 0',
  validate: (ctx, { dir }) => MOVE.validate(ctx, asMove(dir)),
  execute: (ctx, { dir }) => {
    const { state, actor, emit } = ctx;
    const near = adjacentEnemies(state, actor);
    const first = near[0];
    if (first !== undefined && hasAttributes(actor)) {
      const chance = statValue(state, actor, 'flee');
      if (!new Rng(state.rng.combat).chance(chance / 100)) {
        emit({
          type: 'fleeFailed',
          actor: actor.id,
          enemy: first.id,
          enemyDef: first.def,
          chance,
          floor: actor.floor,
          pos: { x: actor.pos.x, y: actor.pos.y },
        });
        return;
      }
    }
    MOVE.execute(ctx, asMove(dir));
  },
};
