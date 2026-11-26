/**
 * Target choice by focus (ETH-193, CLAUDE.md §5.2): which of a set of enemies an adventurer picks,
 * given the focus option it plays. One place, so attacking an adjacent enemy and closing in on a
 * visible one agree.
 *
 * The default focus, Weakest, gives exactly the baseline's old choice (least HP, then lowest id),
 * so default picks change nothing. Monsters and hand-built actors have no picks and always play it.
 *
 * What counts as a caster or a ranged enemy comes from the monster's role powers, never from its
 * name: a caster has a bolt, a mend or a bolster; a ranged enemy has a bolt; the rest are melee.
 * This module must not import `./rules` or `./roles` (they import it).
 */
import { FOCUS_INFO, MONSTERS, monsterPowers } from '../../content';
import type { FocusPreference } from '../../content';
import type { AiCtx } from '../ai/types';
import { focusPreference } from '../ai/tactics';
import type { ActorEntity, Entity, RunState } from '../state';
import { templatesOf } from './overlay';

/** Tiles between two entities, diagonals counting as one. */
function gap(a: Entity, b: Entity): number {
  return Math.max(Math.abs(a.pos.x - b.pos.x), Math.abs(a.pos.y - b.pos.y));
}

/** What an enemy does from afar: `caster` has a bolt, a mend or a bolster, `ranged` has a bolt. */
export function enemyKind(enemy: Entity): { caster: boolean; ranged: boolean } {
  if (!MONSTERS.has(enemy.def)) return { caster: false, ranged: false };
  const powers = monsterPowers(MONSTERS.get(enemy.def), templatesOf(enemy));
  const ranged = powers.bolt !== undefined;
  return { caster: ranged || powers.mend !== undefined || powers.bolster !== undefined, ranged };
}

/** True when `enemy` is hitting a party member other than `me`: next to one, or its last decision struck one. */
export function isHittingAlly(state: RunState, me: Entity, enemy: Entity): boolean {
  const target = enemy.ai?.memory.intent?.goal;
  for (const id of state.party) {
    const ally = state.entities[id];
    if (ally?.actor === undefined || ally.actor.hp <= 0 || ally.id === me.id || ally.floor !== enemy.floor) continue;
    if (gap(ally, enemy) <= 1) return true;
    if (enemy.ai?.memory.intent?.action === 'act.attack_adjacent' && target !== undefined && target.x === ally.pos.x && target.y === ally.pos.y) return true;
  }
  return false;
}

/** The enemy picked, and a trace note when the focus found nothing it wanted. */
export interface Chosen {
  target: ActorEntity;
  /** Set when the focus matched no candidate and a fallback was taken, e.g. "Casters: no caster in reach, striking the weakest". */
  note?: string;
}

/**
 * Picks one of `candidates` for `ctx.actor` by its focus. `mode` says what the pick is for:
 * `strike` (the candidates are in reach, so Weakest means least HP) or `approach` (they are in
 * sight, so Weakest and Nearest both mean the closest). A focus that wants a kind of enemy
 * (casters, melee, ranged, protect) and finds none falls back to the Weakest (strike) or the
 * nearest (approach), with a note saying so. `null` for no candidates.
 */
export function chooseTarget(ctx: AiCtx, candidates: readonly ActorEntity[], mode: 'strike' | 'approach' = 'strike'): Chosen | null {
  if (candidates.length === 0) return null;
  const { state, actor } = ctx;
  const prefer: FocusPreference = focusPreference(ctx);
  const byId = (a: Entity, b: Entity) => a.id - b.id;
  const weakest = (a: ActorEntity, b: ActorEntity) => a.actor.hp - b.actor.hp || gap(a, actor) - gap(b, actor) || byId(a, b);
  const strongest = (a: ActorEntity, b: ActorEntity) => b.actor.hp - a.actor.hp || gap(a, actor) - gap(b, actor) || byId(a, b);
  const nearest = (a: ActorEntity, b: ActorEntity) => gap(a, actor) - gap(b, actor) || byId(a, b);
  const fallback = mode === 'strike' ? weakest : nearest;
  const first = (list: readonly ActorEntity[], order: (a: ActorEntity, b: ActorEntity) => number): ActorEntity => [...list].sort(order)[0] as ActorEntity;

  switch (prefer) {
    case 'weakest':
      return { target: first(candidates, fallback) };
    case 'strongest':
      return { target: first(candidates, strongest) };
    case 'nearest':
      return { target: first(candidates, nearest) };
    default: {
      const wanted =
        prefer === 'casters'
          ? candidates.filter((e) => enemyKind(e).caster)
          : prefer === 'ranged'
            ? candidates.filter((e) => enemyKind(e).ranged)
            : prefer === 'melee'
              ? candidates.filter((e) => !enemyKind(e).ranged)
              : candidates.filter((e) => isHittingAlly(state, actor, e));
      if (wanted.length > 0) return { target: first(wanted, fallback) };
      const info = FOCUS_INFO[prefer];
      const where = mode === 'strike' ? 'next to me' : 'in sight';
      return { target: first(candidates, fallback), note: `${info.label}: ${info.none ?? 'no match'} ${where}, ${mode === 'strike' ? 'striking the weakest' : 'closing on the nearest'}` };
    }
  }
}
