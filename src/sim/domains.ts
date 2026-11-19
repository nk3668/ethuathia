/**
 * The composition hub (docs/ARCHITECTURE.md, Contracts): the one module whose top-level code
 * reads every domain. It lists the domains in a fixed order, builds `ACTIONS` and `COMMANDS`
 * from the core records and every domain's, and fills the code registries (`CONDITIONS`,
 * `RULE_ACTIONS`, `GEN_STEPS`, `DISCOVERY_RULES`, `CHRONICLE_KINDS`, `CHRONICLE_RULES`) and `RUN_TRACKERS`, core first and then domain
 * by domain.
 *
 * `src/sim/index.ts` loads this module before anything else, so the domains are always read
 * after they have finished loading. Domain modules must therefore never import this file, nor
 * any module that reads it at load time.
 */
import { CORE_RULE_ACTIONS } from './ai/ruleActions';
import { CORE_CONDITIONS } from './ai/conditions';
import type { ActionDef, ActionRecord, ActionRequest, BaseRequest } from './actions';
import { COMBAT_DOMAIN } from './combat';
import type { CommandRecord, Command } from './commands';
import { CORE_ACTIONS } from './coreActions';
import { CORE_COMMANDS } from './coreCommands';
import type {
  DomainKey,
  DomainShape,
  DomainSnapshots,
  DomainStates,
  DomainTypes,
  RunTracker,
  SimDomain,
  SnapshotCtx,
  StepCtx,
  TurnCtx,
} from './domain';
import { FLOORS_DOMAIN } from './floors';
import { ROOM_STEPS } from './gen/steps';
import { ITEMS_DOMAIN } from './items';
import { QUESTS_DOMAIN } from './quests';
import { CORE_CHRONICLE, CORE_CHRONICLE_KINDS, CORE_DISCOVERIES } from './coreEvents';
import {
  BUNDLE_SOURCES,
  CHRONICLE_KINDS,
  CHRONICLE_RULES,
  CONDITIONS,
  DISCOVERY_RULES,
  FLOOR_PLAN_HOOKS,
  GEN_STEPS,
  RULE_ACTIONS,
  STAT_PROVIDERS,
  TRACKER_LIST,
  TRIGGERS,
  VICTORY_CHECKS,
} from './registries';
import { RUN_DOMAIN } from './run';
import type { ChronicleRule, DiscoveryRule } from './run';
import type { RunConfig } from './state';
import { STATS_DOMAIN } from './stats';

/**
 * Every domain, in domain order: the order of `DomainTypes`, and the order in which their
 * slices are initialized and their registrations, trackers and snapshot builders run. Adding a
 * domain is one line here and one in `DomainTypes`.
 */
export const DOMAINS: { readonly [K in DomainKey]: SimDomain<DomainTypes[K]> } = {
  stats: STATS_DOMAIN,
  floors: FLOORS_DOMAIN,
  combat: COMBAT_DOMAIN,
  items: ITEMS_DOMAIN,
  quests: QUESTS_DOMAIN,
  run: RUN_DOMAIN,
};

/** The domain keys in domain order. */
export const DOMAIN_KEYS = Object.keys(DOMAINS) as readonly DomainKey[];

/** The domains in domain order, for code that treats them all alike. */
const ALL: readonly SimDomain<DomainShape>[] = DOMAIN_KEYS.map((key) => DOMAINS[key] as unknown as SimDomain<DomainShape>);

/**
 * Joins exhaustive records into one, refusing an id defined twice. The result is exhaustive over
 * the joined unions because each part is exhaustive over its own.
 */
function join<T>(what: string, parts: readonly Readonly<Record<string, T>>[]): Record<string, T> {
  const out: Record<string, T> = {};
  for (const part of parts) {
    for (const [id, def] of Object.entries(part)) {
      if (Object.hasOwn(out, id)) throw new Error(`Two domains define the ${what} "${id}"`);
      out[id] = def;
    }
  }
  return out;
}

/**
 * Every action, keyed by id: the core actions, then each domain's. Exhaustive at compile time,
 * because `ActionRequest` is exactly the core and domain request unions and each record is
 * exhaustive over its own. The Codex and tooltips read `name` and `description` from here.
 */
export const ACTIONS: ActionRecord<ActionRequest> = join<ActionDef<BaseRequest>>('action', [
  CORE_ACTIONS,
  ...ALL.map((d) => d.actions),
]) as unknown as ActionRecord<ActionRequest>;

/** Every command, keyed by type: the core commands, then each domain's. */
export const COMMANDS: CommandRecord<Command> = join('command', [
  CORE_COMMANDS,
  ...ALL.map((d) => d.commands),
]) as unknown as CommandRecord<Command>;

for (const def of [...CORE_CONDITIONS, ...ALL.flatMap((d) => d.conditions ?? [])]) CONDITIONS.register(def);
for (const def of [...CORE_RULE_ACTIONS, ...ALL.flatMap((d) => d.ruleActions ?? [])]) RULE_ACTIONS.register(def);
for (const def of [...ROOM_STEPS, ...ALL.flatMap((d) => d.genSteps ?? [])]) GEN_STEPS.register(def);

for (const def of ALL.flatMap((d) => d.triggers ?? [])) TRIGGERS.register(def);
STAT_PROVIDERS.push(...unique('stat provider', ALL.flatMap((d) => d.statProviders ?? [])));
BUNDLE_SOURCES.push(...unique('bundle source', ALL.flatMap((d) => d.bundleSources ?? [])));

/** `items`, refusing an id listed twice. */
function unique<T extends { readonly id: string }>(what: string, items: readonly T[]): readonly T[] {
  const ids = new Set<string>();
  for (const item of items) {
    if (ids.has(item.id)) throw new Error(`Two domains define the ${what} "${item.id}"`);
    ids.add(item.id);
  }
  return items;
}

/** Runs every domain's `turnStart` hook for `ctx.actor`, in domain order (`step.ts`). */
export function runTurnStart(ctx: TurnCtx): void {
  for (const d of ALL) d.turnStart?.(ctx);
}

/** Runs every domain's `turnEnd` hook for `ctx.actor`, in domain order (`step.ts`). */
export function runTurnEnd(ctx: TurnCtx): void {
  for (const d of ALL) d.turnEnd?.(ctx);
}

/** Runs every domain's `stepEnd` hook, in domain order, before the step's trackers (`step.ts`, ETH-114). */
export function runStepEnd(ctx: StepCtx): void {
  for (const d of ALL) d.stepEnd?.(ctx);
}

/**
 * Every domain's run trackers, in domain order. The run domain runs them over each step's events
 * (`src/sim/run/trackers.ts`); it reads them from `TRACKER_LIST` in `registries.ts`, which is
 * this same array.
 */
export const RUN_TRACKERS: readonly RunTracker<unknown>[] = TRACKER_LIST;
for (const tracker of ALL.flatMap((d) => d.trackers ?? [])) {
  if (TRACKER_LIST.some((t) => t.id === tracker.id)) throw new Error(`Two domains define the run tracker "${tracker.id}"`);
  TRACKER_LIST.push(tracker);
}

/** Every domain's victory checks, in domain order (`VICTORY_CHECKS` in `registries.ts`). */
for (const check of ALL.flatMap((d) => d.victoryChecks ?? [])) {
  if (VICTORY_CHECKS.some((c) => c.id === check.id)) throw new Error(`Two domains define the victory check "${check.id}"`);
  VICTORY_CHECKS.push(check);
}

/** Every domain's floor plan hooks, in domain order (`FLOOR_PLAN_HOOKS` in `registries.ts`). */
FLOOR_PLAN_HOOKS.push(...unique('floor plan hook', ALL.flatMap((d) => d.floorPlanHooks ?? [])));

for (const rules of [CORE_DISCOVERIES, ...ALL.map((d) => d.discoveries ?? {})]) {
  for (const [type, rule] of Object.entries(rules) as [string, DiscoveryRule][]) {
    const list = DISCOVERY_RULES.get(type);
    if (list === undefined) DISCOVERY_RULES.set(type, [rule]);
    else list.push(rule);
  }
}

for (const kind of [...CORE_CHRONICLE_KINDS, ...ALL.flatMap((d) => d.chronicleKinds ?? [])]) {
  if (CHRONICLE_KINDS.has(kind.id)) throw new Error(`Two domains define the chronicle kind "${kind.id}"`);
  CHRONICLE_KINDS.set(kind.id, kind);
}
for (const rules of [CORE_CHRONICLE, ...ALL.map((d) => d.chronicle ?? {})]) {
  for (const [type, rule] of Object.entries(rules) as [string, ChronicleRule][]) {
    const list = CHRONICLE_RULES.get(type);
    if (list === undefined) CHRONICLE_RULES.set(type, [rule]);
    else list.push(rule);
  }
}

/** Every domain's state slice for a new run: `RunState.domains`. */
export function initDomains(config: RunConfig): DomainStates {
  const out: Partial<Record<DomainKey, object>> = {};
  for (const key of DOMAIN_KEYS) out[key] = DOMAINS[key].init(config);
  return out as DomainStates;
}

/** Every domain's snapshot slice: `Snapshot.domains`. */
export function domainSnapshots(ctx: SnapshotCtx): DomainSnapshots {
  const out: Partial<Record<DomainKey, object>> = {};
  for (const key of DOMAIN_KEYS) out[key] = DOMAINS[key].snapshot(ctx);
  return out as DomainSnapshots;
}

export { BUNDLE_SOURCES, CHRONICLE_KINDS, CHRONICLE_RULES, CONDITIONS, DISCOVERY_RULES, GEN_STEPS, RULE_ACTIONS, STAT_PROVIDERS, TRIGGERS, VICTORY_CHECKS };
