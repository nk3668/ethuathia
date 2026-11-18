/**
 * The composition hub (docs/ARCHITECTURE.md, Contracts): the one module whose top-level code
 * reads every domain. It lists the domains in a fixed order, builds `ACTIONS` and `COMMANDS`
 * from the core records and every domain's, and fills the code registries (`CONDITIONS`,
 * `RULE_ACTIONS`, `GEN_STEPS`, `DISCOVERY_RULES`) and `RUN_TRACKERS`, core first and then domain
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
import type { DomainKey, DomainShape, DomainSnapshots, DomainStates, DomainTypes, RunTracker, SimDomain, SnapshotCtx } from './domain';
import { FLOORS_DOMAIN } from './floors';
import { ROOM_STEPS } from './gen/steps';
import { ITEMS_DOMAIN } from './items';
import { QUESTS_DOMAIN } from './quests';
import { CORE_DISCOVERIES } from './coreEvents';
import { CONDITIONS, DISCOVERY_RULES, GEN_STEPS, RULE_ACTIONS } from './registries';
import { RUN_DOMAIN } from './run';
import type { DiscoveryRule } from './run';
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

/** Every domain's run trackers, in domain order. ETH-062 runs them over each step's events. */
export const RUN_TRACKERS: readonly RunTracker<unknown>[] = ALL.flatMap((d) => d.trackers ?? []);
{
  const ids = new Set<string>();
  for (const tracker of RUN_TRACKERS) {
    if (ids.has(tracker.id)) throw new Error(`Two domains define the run tracker "${tracker.id}"`);
    ids.add(tracker.id);
  }
}

for (const rules of [CORE_DISCOVERIES, ...ALL.map((d) => d.discoveries ?? {})]) {
  for (const [type, rule] of Object.entries(rules) as [string, DiscoveryRule][]) {
    const list = DISCOVERY_RULES.get(type);
    if (list === undefined) DISCOVERY_RULES.set(type, [rule]);
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

export { CONDITIONS, DISCOVERY_RULES, GEN_STEPS, RULE_ACTIONS };
