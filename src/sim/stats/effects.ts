/**
 * The effect interpreter and triggers (docs/ARCHITECTURE.md §2.2).
 *
 * `runEffect` is the one place an effect kind is carried out: a new kind is one case in its
 * switch (and one member of `Effect` and its schema in `src/content/bundles.ts`). Items, spells,
 * traps, altars and triggers all run effects through it.
 *
 * `fireTrigger(state, entity, kind, emit, other?)` runs every trigger of kind `kind` in the
 * bundles active on `entity`. The domain that owns a moment fires it: the stats domain fires
 * `trigger.turn_start` and `trigger.turn_end` from its turn hooks; combat would fire, say,
 * `trigger.hit` after an attack lands, with the target as `other`.
 */
import type { Effect, Trigger } from '../../content';
import type { Emit } from '../events';
import type { Entity, EntityId, RunState } from '../state';
import { forEachBundle, statValue } from './getStat';
import { applyStatus } from './statuses';
import type { EffectCtx } from './types';

/** Triggers nested deeper than this (a trigger whose effect fires another trigger…) are dropped. */
export const MAX_TRIGGER_DEPTH = 4;

let depth = 0;

/** An effect's amount at `potency`, rounded, never below 1. */
function scaled(amount: number, potency: number): number {
  return Math.max(1, Math.round(amount * potency));
}

/** The living actor an effect lands on, or `undefined` if there is none (no `other`, or dead). */
function targetOf(ctx: EffectCtx, effect: Effect): Entity | undefined {
  const id = (effect.to ?? 'self') === 'self' ? ctx.self : ctx.other;
  if (id === undefined) return undefined;
  const entity = ctx.state.entities[id];
  return entity?.actor !== undefined && entity.actor.hp > 0 ? entity : undefined;
}

/** Carries out one effect. Effects on a missing or dead target do nothing. */
export function runEffect(ctx: EffectCtx, effect: Effect): void {
  const target = targetOf(ctx, effect);
  if (target?.actor === undefined) return;
  const actor = target.actor;
  switch (effect.kind) {
    case 'heal': {
      const gained = Math.min(scaled(effect.amount, ctx.potency), statValue(ctx.state, target, 'hp') - actor.hp);
      if (gained <= 0) return;
      actor.hp += gained;
      ctx.emit({ type: 'healed', actor: target.id, amount: gained, source: ctx.source });
      return;
    }
    case 'damage': {
      const lost = Math.min(scaled(effect.amount, ctx.potency), actor.hp);
      actor.hp -= lost;
      // The dead don't act, so a queued action would be stale (invariant core.actors).
      if (actor.hp <= 0) delete actor.queued;
      ctx.emit({ type: 'damaged', actor: target.id, amount: lost, source: ctx.source });
      return;
    }
    case 'applyStatus':
      // The bundle's holder inflicts it on someone else (a venomous bite's `to: 'other'`).
      applyStatus(ctx.state, target, effect.status, effect.turns, ctx.emit, effect.potency ?? 1, true, ctx.state.entities[ctx.self]);
      return;
  }
}

/** Runs `effects` in order. */
export function runEffects(ctx: EffectCtx, effects: readonly Effect[]): void {
  for (const effect of effects) runEffect(ctx, effect);
}

/**
 * Runs the effects of every trigger of kind `kind` (`trigger.*`) in the bundles active on
 * `entity`, in bundle-source order. The matching triggers are collected first, so effects that
 * add or remove statuses don't change which triggers run this time. `other` is the other party
 * to the event, for effects with `to: 'other'`. Returns how many triggers ran.
 */
export function fireTrigger(state: RunState, entity: Entity, kind: string, emit: Emit, other?: EntityId): number {
  if (depth >= MAX_TRIGGER_DEPTH) return 0;
  const matches: { trigger: Trigger; source: string; potency: number }[] = [];
  forEachBundle(state, entity, (bundle, source, potency) => {
    for (const trigger of bundle.triggers ?? []) if (trigger.on === kind) matches.push({ trigger, source, potency });
  });
  depth++;
  try {
    for (const { trigger, source, potency } of matches) {
      const ctx: EffectCtx = other === undefined
        ? { state, emit, self: entity.id, source, potency }
        : { state, emit, self: entity.id, other, source, potency };
      runEffects(ctx, trigger.effects);
    }
  } finally {
    depth--;
  }
  return matches.length;
}
