/**
 * The sim's code registries: rule conditions, rule actions, generation steps, Codex
 * discovery rules, trigger kinds, stat providers and bundle sources. They are created empty
 * here and filled by `domains.ts` from the core lists and every domain's lists, in domain
 * order, so registration order never depends on which module happened to load first.
 *
 * This is a leaf module (it imports no values from the sim), so code that looks things up at
 * run time, such as a condition naming a rule action, can import it without an import cycle.
 * Look-ups happen at run time only: never read a registry while modules are still loading.
 */
import { Registry } from '../core';
import type { ConditionDef, RuleActionDef } from './ai/types';
import type { FloorPlanHook, RunTracker, VictoryCheck } from './domain';
import type { GenStepDef } from './gen/types';
import type { ChronicleKind, ChronicleRule } from './run/chronicle';
import type { DiscoveryRule } from './run/codex';
import type { BundleSource, EffectHandler, StatProvider, TriggerKindDef } from './stats/types';
import type { EffectKind } from '../content';

/** Every rule condition, by id (`cond.*`). The rules editor is generated from it (M3). */
export const CONDITIONS = new Registry<ConditionDef>('rule condition');

/** Every rule action, by id (`act.*`). */
export const RULE_ACTIONS = new Registry<RuleActionDef>('rule action');

/** Every generation step, by id (`gen.rooms`, `gen.corridors`, …). Floor types name them. */
export const GEN_STEPS = new Registry<GenStepDef>('generation step');

/**
 * What each event type discovers for the Codex, keyed by event type: the core rules, then each
 * domain's `discoveries`, in domain order. `CODEX_TRACKER` reads it (`run/codex.ts`).
 */
export const DISCOVERY_RULES = new Map<string, DiscoveryRule[]>();

/** Every trigger kind, by id (`trigger.*`). Bundle triggers in content name them (`Trigger.on`). */
export const TRIGGERS = new Registry<TriggerKindDef>('trigger');

/** Every stat provider, in run order (core, then domain order): `getStat`'s derivation steps. */
export const STAT_PROVIDERS: StatProvider[] = [];

/** Every bundle source, in run order: what `getStat` and `fireTrigger` read bundles from. */
export const BUNDLE_SOURCES: BundleSource[] = [];

/**
 * Domain-owned effect handlers, keyed by `EffectKind` (ETH-044): filled by `domains.ts` from
 * `SimDomain.effectHandlers` so `runEffect` can delegate domain effects without import cycles.
 */
export const EFFECT_HANDLERS = new Map<EffectKind, EffectHandler>();

/**
 * Every run tracker, in domain order (`RUN_TRACKERS` in `domains.ts` is this list). The run
 * domain reads it at run time to run the trackers; never at load time.
 */
export const TRACKER_LIST: RunTracker<unknown>[] = [];

/** Every victory check, in domain order (ETH-062). Read at run time only. */
export const VICTORY_CHECKS: VictoryCheck[] = [];

/** Every floor plan hook, in domain order (ETH-024). `planFloor` runs them; read at run time only. */
export const FLOOR_PLAN_HOOKS: FloorPlanHook[] = [];

/**
 * Every run chronicle moment kind, by id (ETH-120): each domain's `chronicleKinds`, in domain
 * order. Read at run time only.
 */
export const CHRONICLE_KINDS = new Map<string, ChronicleKind>();

/**
 * Which events are chronicle moments, keyed by event type: the core rules, then each domain's
 * `chronicle`, in domain order. `CHRONICLE_TRACKER` reads it (`run/chronicle.ts`).
 */
export const CHRONICLE_RULES = new Map<string, ChronicleRule[]>();
