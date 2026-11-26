/**
 * Where to flee to, and when to go home (ETH-154). Builds on the flee map of ETH-148:
 *
 * - `escapeStep` takes the step the flee map prefers, unless another free step is about as good
 *   (within `ESCAPE_TIE_MARGIN`); among those it prefers the one closest to a living ally on the
 *   floor, then the one closest to the stairs up the party knows. A tie-break only: it never
 *   trades a clearly better escape for company.
 * - `cond.boxed_in`: wounded, no healing, and every unexplored tile and every known way down is near
 *   a remembered threat. Going on means walking back past the threat, so the adventurer rests
 *   (`act.rest`) until it recovers and tells the player once; it never ends the run (Nate,
 *   2026-11-25: retreat is the player's call, e.g. the Fall back stance).
 */
import { DIRS_8 } from '../../core';
import type { Grid, Pos } from '../../core';
import { aiPathGrid, frontier, nameOf } from '../ai/navigate';
import { defineCondition, noParams } from '../ai/types';
import type { AiCtx } from '../ai/types';
import { blockerAt } from '../entities';
import { knownStairs, partyOnFloor } from '../floors/rules';
import { buildGoalMap, canStep, stepToward, UNREACHABLE } from '../goalMap';
import type { PathGrid } from '../goalMap';
import { ESCAPE_TIE_MARGIN, FLEE_RELEASE_PERCENT, GUARDED_RADIUS } from './fleeConfig';
import { distance } from './rules';
import { freshThreats, isWounded } from './threat';

/** The step chosen, and where it leads when that decided between equal escapes ("fleeing toward Mira"). */
export interface EscapeStep {
  dir: Pos;
  /** What the step heads for ("Mira", "the stairs up"), or null when the flee map alone chose. */
  toward: string | null;
}

type Key = readonly [number, number, number];

function better(a: Key, b: Key): boolean {
  for (let i = 0; i < 3; i++) if ((a[i] as number) !== (b[i] as number)) return (a[i] as number) < (b[i] as number);
  return false;
}

/**
 * The step `ctx.actor` takes along `flee`: the best one, or an almost-as-good free one nearer an ally
 * or the stairs up. When the best step is occupied, the best free candidate instead. Null when there
 * is no step downhill, as `stepToward`. `dangers` are the tiles fled from; a step ending next to one
 * is never taken in place of the best. `toward` is set only when the tie-break chose a step other
 * than the flee map's own best.
 *
 * Cost: only when two or more steps are in the margin, and only for a party member, this builds two
 * goal maps (allies, stairs up), one Dijkstra pass each over the floor (about 0.1 ms on a
 * rooms-and-corridors floor, docs/ARCHITECTURE.md goal maps), once per flee decision. Not cached.
 */
export function escapeStep(ctx: AiCtx, paths: PathGrid, flee: Grid, dangers: readonly Pos[]): EscapeStep | null {
  const { state, actor } = ctx;
  const best = stepToward(paths, flee, actor.pos);
  if (best === null) return null;
  if (actor.actor.faction !== 'party') return { dir: best, toward: null };
  const { width } = paths;
  const index = (d: Pos): number => (actor.pos.y + d.y) * width + actor.pos.x + d.x;
  const here = flee.cells[actor.pos.y * width + actor.pos.x] as number;
  const total = (d: Pos): number => (flee.cells[index(d)] as number) + (paths.cost[index(d)] as number);
  const free = (d: Pos): boolean => {
    const to = { x: actor.pos.x + d.x, y: actor.pos.y + d.y };
    return Math.min(...dangers.map((p) => distance(p, to))) > 1 && blockerAt(state, actor, actor.floor, to) === undefined;
  };
  const bestFree = free(best);
  const limit = total(best) + ESCAPE_TIE_MARGIN;
  const candidates = DIRS_8.filter((d) => {
    if (!canStep(paths, actor.pos.x, actor.pos.y, d)) return false;
    const value = flee.cells[index(d)] as number;
    return value !== UNREACHABLE && value < here && total(d) <= limit && free(d);
  });
  if (candidates.length === 0 || (bestFree && candidates.length < 2)) return { dir: best, toward: null };

  const allies = partyOnFloor(state, actor.floor).filter((e) => e.id !== actor.id);
  const stairs = knownStairs(state, actor.floor, 'up');
  const allyMap = allies.length > 0 ? buildGoalMap(paths, allies.map((a) => a.pos)) : null;
  const stairsMap = stairs === null ? null : buildGoalMap(paths, [stairs]);
  const at = (map: Grid | null, p: Pos): number => (map === null ? UNREACHABLE : (map.cells[p.y * width + p.x] as number));
  const keyOf = (d: Pos): Key => {
    const p = { x: actor.pos.x + d.x, y: actor.pos.y + d.y };
    return [at(allyMap, p), at(stairsMap, p), total(d)];
  };
  // The best step is taken (the flee map's own choice) unless it is occupied: then the cheapest free one.
  const same = (d: Pos): boolean => d.x === best.x && d.y === best.y;
  if (!bestFree) return { dir: candidates.reduce((p, d) => (total(d) < total(p) ? d : p)), toward: null };
  let pick: Pos = best;
  let pickKey = keyOf(best);
  for (const d of candidates) {
    const key = keyOf(d);
    if (better(key, pickKey)) {
      pick = d;
      pickKey = key;
    }
  }
  if (same(pick)) return { dir: pick, toward: null };
  const to = { x: actor.pos.x + pick.x, y: actor.pos.y + pick.y };
  if (allyMap !== null && at(allyMap, to) < at(allyMap, actor.pos)) {
    const nearest = allies.reduce((a, b) => (distance(b.pos, actor.pos) < distance(a.pos, actor.pos) ? b : a));
    return { dir: pick, toward: nameOf(nearest) };
  }
  if (stairsMap !== null && at(stairsMap, to) < at(stairsMap, actor.pos)) return { dir: pick, toward: 'the stairs up' };
  return { dir: pick, toward: null };
}

/** True when `pos` is within `GUARDED_RADIUS` of a remembered threat. */
function guarded(pos: Pos, marks: readonly { pos: Pos }[]): boolean {
  return marks.some((m) => distance(m.pos, pos) <= GUARDED_RADIUS);
}

/**
 * True when a wounded adventurer with no healing has no way forward that isn't near a remembered
 * threat: every unexplored tile and every known way down. Needs at least one way forward to judge.
 */
export function isBoxedIn(ctx: AiCtx): boolean {
  const { state, actor } = ctx;
  if (actor.actor.faction !== 'party' || !isWounded(state, actor)) return false;
  const marks = freshThreats(state, actor);
  if (marks.length === 0) return false;
  const ways = frontier(ctx, aiPathGrid(ctx));
  const down = knownStairs(state, actor.floor, 'down');
  if (down !== null) ways.push(down);
  return ways.length > 0 && ways.every((p) => guarded(p, marks));
}

/**
 * True from the moment the adventurer finds itself boxed in (`checkBoxedIn` in `ai/engine.ts` latches
 * `AiMemory.boxedIn`) until it has recovered or found a healing potion: the baseline rests rather than
 * walk back past the threats. This never ends the run; that is the player's call.
 */
export const COND_BOXED_IN = defineCondition({
  id: 'cond.boxed_in',
  name: 'Boxed in',
  description:
    `True when HP is below ${FLEE_RELEASE_PERCENT}%, there is no healing potion, and every unexplored tile and every known way down ` +
    `is within ${GUARDED_RADIUS} tiles of a threat the adventurer remembers: going on means walking back past it, so it rests where it is ` +
    `until HP is back to ${FLEE_RELEASE_PERCENT}%. Ending the run is the player's call (the Fall back stance).`,
  parse: noParams,
  evaluate({ state, actor }) {
    if (actor.ai.memory.boxedIn === undefined || !isWounded(state, actor)) return { ok: false, detail: '' };
    return { ok: true, detail: 'wounded, no healing, threats on every way forward' };
  },
  describe: () => 'wounded, with threats on every way forward',
});

export const ESCAPE_CONDITIONS = [COND_BOXED_IN];
