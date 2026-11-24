/**
 * The stats domain's types (docs/ARCHITECTURE.md §2.2 and Contracts, "Stats"). Types only, so
 * the root `registries.ts` and `domain.ts` can import them without a cycle.
 */
import type { Def } from '../../core';
import type { AttributeId, Bundle, Effect, EffectKind } from '../../content';
import type { Emit } from '../events';
import type { Entity, EntityId, RunState } from '../state';
import type { StatId } from './statIds';

/** A bundle attached to an actor, by content id. Saves store ids only (§2.1). */
export interface AttachedBundle {
  /** The id of a def with a `bundle` field: a `bundle.*` def, or any other kind that carries one. */
  bundle: string;
  /**
   * The content id credited in tooltips and used to detach it again (`detachBundles`), e.g. the
   * item or Omen that granted it. Left out, the bundle's own id is the source.
   */
  source?: string;
}

/** A timed status on an actor (`src/sim/stats/statuses.ts`). */
export interface ActiveStatus {
  /** Status def id, e.g. `status.poisoned`. */
  status: string;
  /** The holder's turns left. Always above 0: at 0 the status expires. */
  remaining: number;
  /** Scales the status's modifiers and trigger amounts. 1 is the def as written. */
  potency: number;
  /**
   * Who inflicted it, if someone else did (a monster's hit trigger, an ally's bolster): the latest
   * applier's id and def, so a death from it can name its source (ETH-075). Left out when unknown
   * or self-inflicted.
   */
  by?: StatusSource;
}

/** The actor that inflicted a status: `ActiveStatus.by`. The def outlives the entity. */
export interface StatusSource {
  id: EntityId;
  def: string;
}

/**
 * The stats part of an entity: base values, attached bundles and timed statuses. The final
 * value of a stat comes only from `getStat` / `statValue`.
 */
export interface StatsPart {
  /** Per-entity base values. A stat with no entry starts at `STAT_INFO[stat].base`. */
  base: Partial<Record<StatId, number>>;
  /** Bundles attached to this entity, in the order they were attached. */
  bundles: AttachedBundle[];
  /** Timed statuses, in the order they were applied. */
  statuses: ActiveStatus[];
  /**
   * The actor's own attribute points (ETH-033), added to its class and race values and its
   * class's level growth (ETH-034, derived from `growth.level`, not stored here). For an actor
   * without a class (a monster), its whole attributes. Left out, an adventurer has only its class and race values and anyone else has none.
   */
  attributes?: Partial<Record<AttributeId, number>>;
}

/** Where a stat part came from, for the tooltip: a content id and its display label. */
export interface StatSource {
  id: string;
  label: string;
}

/** One contribution to a stat. `add` parts are summed, then multiplied by every `mul` part. */
export interface StatPart {
  op: 'add' | 'mul';
  value: number;
  source: StatSource;
}

/** A stat's final value and every contribution to it, in order: what a stat tooltip shows. */
export interface StatResult {
  stat: StatId;
  /** What combat uses: `raw` rounded and clamped (`combatValue`). */
  value: number;
  /** The exact total before rounding (1.8 where `value` is 2), for tooltips (ETH-181). */
  raw: number;
  parts: StatPart[];
}

/**
 * Receives a stat contribution. `label` may be left out: `getStat` then looks up the content
 * name for `sourceId`. `statValue` ignores sources entirely, so providers stay cheap.
 */
export type StatSink = (op: 'add' | 'mul', value: number, sourceId: string, label?: string) => void;

/**
 * Derives part of a stat before bundles apply: the entity's base values, its class and race,
 * and later attributes (ETH-033) and level (ETH-034). Listed in a domain's `statProviders`;
 * they run core first, then in domain order, then list order.
 */
export interface StatProvider {
  /** Unique, e.g. `stats.base`, `stats.class_race`, `stats.attributes`. */
  readonly id: string;
  /** Calls `sink` once per contribution to `stat` on `entity`. Must not change anything. */
  contribute(state: RunState, entity: Entity, stat: StatId, sink: StatSink): void;
}

/**
 * Receives one bundle active on an entity, credited to `sourceId`. `label` names the part in a tooltip when the source's def name alone would mislead (ETH-082's
 * weapon scaling: "Finesse 14 (Arming sword)"; a run modifier's "Gloom (Omen, rank 2)", ETH-115); left out, the label is the source's name.
 */
export type BundleVisitor = (bundle: Bundle, sourceId: string, potency: number, label?: string) => void;

/**
 * Lists the bundles active on an entity: attached bundles and statuses (the stats domain), and
 * later equipped gear (ETH-043) or run-wide Omens (ETH-067). Each bundle's modifiers feed
 * `getStat` and its triggers fire on `fireTrigger`. Listed in a domain's `bundleSources`.
 */
export interface BundleSource {
  /** Unique, e.g. `stats.attached`, `stats.statuses`, `items.equipped`. */
  readonly id: string;
  /** Calls `visit` once per active bundle on `entity`, in a fixed order. Must not change anything. */
  visit(state: RunState, entity: Entity, visit: BundleVisitor): void;
}

/**
 * A trigger kind: a moment a bundle's triggers can react to (`Trigger.on` in content). The
 * domain that owns the moment lists it in its `triggers` and calls `fireTrigger` there.
 */
export interface TriggerKindDef extends Def {
  /** `trigger.*`, e.g. `trigger.turn_start`. */
  readonly id: string;
}

/** What `fireTrigger` and the effect interpreter run in. */
export interface EffectCtx {
  readonly state: RunState;
  readonly emit: Emit;
  /** Who holds the bundle: the target of effects with `to: 'self'` (the default). */
  readonly self: EntityId;
  /** The other party to the event (an attacker, a target), for effects with `to: 'other'`. */
  readonly other?: EntityId;
  /** The content id the effect comes from, carried into events for the log. */
  readonly source: string;
  /** Scales `heal` and `damage` amounts. 1 is the def as written. */
  readonly potency: number;
}

/**
 * A domain-owned handler for one `Effect` kind (ETH-044): lets domains register custom effect
 * interpreters (`identify`, `uncurse`, later `teleport`, `reveal`, `summon`) through
 * `SimDomain.effectHandlers` without creating import cycles with `src/sim/stats/effects.ts`.
 */
export interface EffectHandler<K extends EffectKind = EffectKind> {
  readonly kind: K;
  run(ctx: EffectCtx, target: Entity, effect: Extract<Effect, { kind: K }>): void;
}
