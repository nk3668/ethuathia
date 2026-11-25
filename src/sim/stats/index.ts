/**
 * The stats domain: stat ids, base stats and modifiers, bundles on actors, timed statuses, and
 * the effect interpreter and triggers (ETH-057); attributes (ETH-033) and leveling (ETH-034)
 * build on it. docs/ARCHITECTURE.md §2.2 and Contracts, "Stats", describe the API.
 *
 * Everything this domain adds lives in this folder (docs/ARCHITECTURE.md, Contracts). The root
 * files only compose what is exported here. Never import `domains.ts` or `index.ts` from this folder.
 */
import { findDef, isAttributeId, RACES, STATUSES } from '../../content';
import type { AttributeId, OmenSelection } from '../../content';
import type { ActionRecord } from '../actions';
import type { CommandRecord } from '../commands';
import type { RunTracker, SimDomain, SnapshotCtx, TurnCtx } from '../domain';
import type { Emit } from '../events';
import { registerInvariant } from '../invariants';
import { defineChronicleKind, momentAt } from '../run/chronicle';
import type { ChronicleRules } from '../run/chronicle';
import type { DiscoveryRules } from '../run/codex';
import type { EntityId, RunConfig, RunState } from '../state';
import { getAttributes, PROVIDER_ATTRIBUTES } from './attributes';
import type { AttributeResult } from './attributes';
import { attachBundle } from './bundles';
import { fireTrigger } from './effects';
import { bundleOf, fillVitals, getStats, hasBundle, statValue } from './getStat';
import { isStatId, STAT_IDS, STAT_INFO } from './statIds';
import type { StatId } from './statIds';
import { omenModifiers, omenProblems } from './omens';
import { growthProblems, levelView, XP_TRACKER } from './leveling';
import type { GrowthPart, LevelingEvent, LevelView } from './leveling';
import {
  announceRunModifiers,
  COND_RUN_FLAG,
  describeRunModifier,
  expireFloorModifiers,
  expireTurnModifiers,
  noteTurnFloor,
  rewardMultiplier,
  runModifierListProblems,
  SOURCE_RUN,
  toRunModifier,
} from './runModifiers';
import type { RunModifier, RunModifierConfig, RunModifierEvent } from './runModifiers';
import { applyStatus, tickStatuses } from './statuses';
import type { StatusApplyMode } from './statuses';
import type { BundleSource, StatProvider, StatResult, StatsPart, TriggerKindDef } from './types';

export { BASE_SIGHT_RADIUS, isStatId, SKILL_CAP, SKILL_STAT_IDS, STAT_IDS, STAT_INFO, STAT_REFS, STATUS_RESIST_CAP } from './statIds';
export type { StatId, StatInfo } from './statIds';
export * from './types';
export {
  bundleOf,
  clampVitals,
  fillVitals,
  forEachBundle,
  getStat,
  getStats,
  hasBundle,
  newStatsPart,
  scaleModifier,
  sourceLabel,
  statValue,
} from './getStat';
export { combatValue, exactText, roundedText } from './combatValue';
export { baseSourceId, groupLabel, groupStatParts } from './groupParts';
export type { StatPartGroup } from './groupParts';
export { applyStatus, ensureStats, removeStatus, resistedTurns, tickStatuses } from './statuses';
export type { StatusApplyMode } from './statuses';
export { fireTrigger, MAX_TRIGGER_DEPTH, runEffect, runEffects } from './effects';
export { attachBundle, detachBundles } from './bundles';
export {
  ATTRIBUTE_FORMULAS,
  attributeValue,
  DAMAGE_FORMULA,
  formulasFor,
  getAttribute,
  getAttributes,
  hasAttributes,
  PROVIDER_ATTRIBUTES,
} from './attributes';
export type { AttributeFormula, AttributePart, AttributeResult } from './attributes';
export {
  grantDepthXp,
  grantKillXp,
  grantXp,
  growthOf,
  growthProblems,
  growthRng,
  KILL_GROUP_BONUS,
  KILL_SHARE_RADIUS,
  killShare,
  killSharers,
  levelForXp,
  levelOf,
  levelView,
  rollLevelGains,
  XP_PER_DEPTH,
  XP_PER_THREAT,
  XP_STEP,
  XP_TRACKER,
  xpForLevel,
} from './leveling';
export {
  addRunModifier,
  announceRunModifiers,
  applyRewardMultiplier,
  COND_RUN_FLAG,
  describeRunModifier,
  removeRunModifier,
  rewardBonusText,
  rewardMultiplier,
  xpMultiplier,
  contractMultiplier,
  RUN_MODIFIER_SCOPES,
  runBundleOf,
  runFlag,
  runModifierListProblems,
  runModifierProblems,
  runModifiers,
  runScopeIncludes,
  scopeWords,
  SOURCE_RUN,
  toRunModifier,
} from './runModifiers';
export { omenBundleId, omenLabel, omenModifiers, omenProblems, omenShortLabel } from './omens';
export type {
  RunFlagParams,
  RunModifier,
  RunModifierConfig,
  RunModifierEndReason,
  RunModifierEvent,
  RunModifierScope,
  RunModifierSource,
  RunModifierUntil,
} from './runModifiers';
export type { GrowthGains, GrowthPart, LevelingEvent, LevelView, XpReason, XpRecord, XpTrackerState } from './leveling';

/** The events this domain emits (bodies, without `turn`). Each needs a formatter in `ui/shell/logText/stats.ts`. */
export type StatsEvent =
  /**
   * A status landed on `actor`. `turns` and `potency` are the status's values after stacking,
   * and `mode` says how it merged with one already active of its group.
   */
  | {
      type: 'statusApplied';
      actor: EntityId;
      status: string;
      turns: number;
      potency: number;
      mode: StatusApplyMode;
      /** Turns of a harmful status shrugged off by status resistance (ETH-081); left out when none. */
      resisted?: number;
    }
  /** A status ran out of turns. */
  | { type: 'statusExpired'; actor: EntityId; status: string }
  /** A status was taken off early (a cure). */
  | { type: 'statusRemoved'; actor: EntityId; status: string }
  /** An effect restored `amount` HP. `source` is the content id it came from (a status, an item). */
  | { type: 'healed'; actor: EntityId; amount: number; source: string }
  /** An effect took `amount` HP. `source` is the content id it came from. */
  | { type: 'damaged'; actor: EntityId; amount: number; source: string }
  /** XP and level-ups (ETH-034, `leveling.ts`): `xpGained`, `leveledUp`. */
  | LevelingEvent
  /** Run-wide modifiers (ETH-115, `runModifiers.ts`): `runModifierAdded`, `runModifierRemoved`. */
  | RunModifierEvent;

/** The action requests this domain defines. Each needs an entry in `STATS_ACTIONS`. */
export type StatsRequest = never;

/** The commands this domain accepts. Each needs an entry in `STATS_COMMANDS`. */
export type StatsCommand = never;

/** This domain's slice of the run state, at `state.domains.stats`. Plain data. */
export interface StatsState {
  /**
   * Run-wide modifiers (ETH-115, `runModifiers.ts`), in the order they were added: Omens,
   * blessings, curses, dungeon events, doctrine, veterans, run-scope upgrade grants. Change them
   * only with `addRunModifier` / `removeRunModifier`.
   */
  runModifiers: RunModifier[];
  /** Whether the config's modifiers have been announced (`runModifierAdded` with `atStart`, on the first turn). */
  runModifiersAnnounced: boolean;
}

/** A timed status as the party card shows it. Look the def up in `STATUSES` for its name and badge. */
export interface StatusView {
  status: string;
  remaining: number;
  potency: number;
}

/** One party member's stats for the UI. */
export interface MemberStatsView {
  /** Active statuses, in the order they were applied. */
  statuses: StatusView[];
  /** Every stat with its parts and their sources: what stat tooltips show. */
  stats: Record<StatId, StatResult>;
  /** Every attribute with its parts (class, race, own points). */
  attributes: Record<AttributeId, AttributeResult>;
  /** Level and XP progress (ETH-034). */
  level: LevelView;
}

/** A run modifier as the HUD strip and its tooltip show it (ETH-115). */
export interface RunModifierView extends RunModifier {
  /** One line for the tooltip: what it does, to whom, the reward bonus and when it ends (`describeRunModifier`). */
  text: string;
}

/** This domain's slice of the snapshot, at `snapshot.domains.stats`. Plain data. */
export interface StatsSnapshot {
  /** Per party member, keyed by entity id. */
  members: Record<EntityId, MemberStatsView>;
  /** The run-wide modifiers in force, in the order they were added. */
  runModifiers: RunModifierView[];
  /** 1 + the sum of their reward bonuses: what at-risk earnings are multiplied by. */
  rewardMultiplier: number;
}

/** Optional parts this domain adds to `Entity`. */
export interface StatsParts {
  /** Base values, attached bundles and timed statuses. Read stats only through `getStat` / `statValue`. */
  stats?: StatsPart;
  /** An adventurer's level and XP (ETH-034). Absent until it first earns XP: level 1, 0 XP. */
  growth?: GrowthPart;
}

/** A status every party member starts the run with. */
export interface StartingStatus {
  status: string;
  turns: number;
  potency?: number;
}

/** Fields this domain adds to `RunConfig`. Make them optional, so older configs stay valid. */
export interface StatsConfig {
  /**
   * Bundle ids attached to every party member for the whole run (the Prepare screen's loadout,
   * later blessings and Omens).
   */
  partyBundles?: string[];
  /** Statuses every party member starts with (bought buffs). */
  partyStatuses?: StartingStatus[];
  /**
   * Run-wide modifiers in force from the start (ETH-115): Omens, the patron's blessing, doctrine,
   * owned upgrades' `run`-scope bundle grants. Keys must be unique.
   */
  runModifiers?: RunModifierConfig[];
  /**
   * The Omens switched on, with their ranks (ETH-185). Each becomes a run modifier after the
   * `runModifiers` above (`omenModifiers`); the list itself is what the run record keeps.
   */
  omens?: OmenSelection[];
}

/** This domain's row in `DomainTypes` (`src/sim/domain.ts`). */
export interface StatsTypes {
  event: StatsEvent;
  request: StatsRequest;
  command: StatsCommand;
  state: StatsState;
  snapshot: StatsSnapshot;
}

export const STATS_ACTIONS: ActionRecord<StatsRequest> = {};

export const STATS_COMMANDS: CommandRecord<StatsCommand> = {};

/** The state slice for a new run. */
export function initStats(config: RunConfig): StatsState {
  return { runModifiers: [...(config.runModifiers ?? []), ...omenModifiers(config.omens)].map(toRunModifier), runModifiersAnnounced: false };
}

/**
 * Sets up each party member's stats at the start of a run: the config's `partyBundles` and
 * `partyStatuses`, then full HP and MP. `createRun` calls it once the party exists. Throws on an
 * unknown bundle or status id.
 */
export function startPartyStats(state: RunState, emit: Emit): void {
  const { partyBundles = [], partyStatuses = [] } = state.config;
  for (const id of partyBundles) if (!hasBundle(id)) throw new Error(`Unknown party bundle "${id}"`);
  for (const s of partyStatuses) if (!STATUSES.has(s.status)) throw new Error(`Unknown party status "${s.status}"`);
  const omenIssues = omenProblems(state.config.omens);
  if (omenIssues.length > 0) throw new Error(`Invalid Omens: ${omenIssues.join('; ')}`);
  const modProblems = runModifierListProblems(state.domains.stats.runModifiers);
  if (modProblems.length > 0) throw new Error(`Invalid run modifiers: ${modProblems.join('; ')}`);
  for (const id of state.party) {
    const entity = state.entities[id];
    if (entity?.actor === undefined) continue;
    for (const bundle of partyBundles) attachBundle(state, entity, bundle);
    // A starting condition, not an affliction: Grit doesn't shorten it.
    for (const s of partyStatuses) applyStatus(state, entity, s.status, s.turns, emit, s.potency ?? 1, false);
    fillVitals(state, entity);
  }
}

/** The snapshot slice. Shares nothing with the state. */
export function statsSnapshot({ state }: SnapshotCtx): StatsSnapshot {
  const members: Record<EntityId, MemberStatsView> = {};
  for (const id of state.party) {
    const entity = state.entities[id];
    if (entity?.actor === undefined) continue;
    members[id] = {
      statuses: (entity.stats?.statuses ?? []).map((s) => ({ status: s.status, remaining: s.remaining, potency: s.potency })),
      stats: getStats(state, entity),
      attributes: getAttributes(entity),
      level: levelView(entity),
    };
  }
  const runModifiers = state.domains.stats.runModifiers.map((m) => ({ ...toRunModifier(m), text: describeRunModifier(m, state) }));
  return { members, runModifiers, rewardMultiplier: rewardMultiplier(state) };
}

// ---------------------------------------------------------------------------------------------
// Providers, bundle sources and triggers

/** The entity's own base values, or `STAT_INFO`'s defaults. Labeled "Base". */
export const PROVIDER_BASE: StatProvider = {
  id: 'stats.base',
  contribute(_state, entity, stat, sink) {
    const value = entity.stats?.base[stat];
    const base = value ?? STAT_INFO[stat].base;
    if (base !== 0) sink('add', base, entity.def, 'Base');
  },
};

/**
 * What an adventurer's class and race give directly rather than through attributes: the race's
 * speed. Max HP, MP and the rest come from attributes (`stats.attributes`, ETH-033).
 */
export const PROVIDER_CLASS_RACE: StatProvider = {
  id: 'stats.class_race',
  contribute(_state, entity, stat, sink) {
    const a = entity.adventurer;
    if (a === undefined || stat !== 'speed') return;
    const race = RACES.get(a.raceId);
    sink('add', race.speed, race.id, race.name);
  },
};

/** Bundles attached to the entity (`stats.bundles`), credited to their source. */
export const SOURCE_ATTACHED: BundleSource = {
  id: 'stats.attached',
  visit(_state, entity, visit) {
    for (const b of entity.stats?.bundles ?? []) visit(bundleOf(b.bundle), b.source ?? b.bundle, 1);
  },
};

/** The entity's timed statuses, each at its potency. */
export const SOURCE_STATUSES: BundleSource = {
  id: 'stats.statuses',
  visit(_state, entity, visit) {
    for (const s of entity.stats?.statuses ?? []) visit(STATUSES.get(s.status).bundle, s.status, s.potency);
  },
};

export const TRIGGER_TURN_START: TriggerKindDef = {
  id: 'trigger.turn_start',
  name: 'Turn start',
  description: "At the start of the holder's turn, before it acts.",
  tags: [],
};

export const TRIGGER_TURN_END: TriggerKindDef = {
  id: 'trigger.turn_end',
  name: 'Turn end',
  description: "At the end of the holder's turn, after it acts and before its statuses tick down.",
  tags: [],
};

/**
 * Turn start: the config's run modifiers are announced on the run's first turn and timed ones
 * end (ETH-115), then `trigger.turn_start` triggers (regeneration, poison).
 */
function statsTurnStart({ state, actor, emit }: TurnCtx): void {
  announceRunModifiers(state, emit);
  expireTurnModifiers(state, emit);
  noteTurnFloor(state, actor);
  fireTrigger(state, actor, TRIGGER_TURN_START.id, emit);
}

/**
 * Turn end: run modifiers bound to a floor a party member just left end (ETH-115), then
 * `trigger.turn_end` triggers, then statuses tick down and expire.
 */
function statsTurnEnd({ state, actor, emit }: TurnCtx): void {
  expireFloorModifiers(state, actor, emit);
  if (actor.actor.hp <= 0) return;
  fireTrigger(state, actor, TRIGGER_TURN_END.id, emit);
  tickStatuses(state, actor, emit);
}

// ---------------------------------------------------------------------------------------------
// Invariants (docs/ARCHITECTURE.md §11.1)

/** Every actor's stats are finite, max HP is at least 1, and current HP and MP are within their maxima. */
registerInvariant('stats.values', (state) => {
  const problems: string[] = [];
  for (const entity of Object.values(state.entities)) {
    if (entity.actor === undefined) continue;
    for (const stat of STAT_IDS) {
      const value = statValue(state, entity, stat);
      if (!Number.isFinite(value)) problems.push(`actor ${entity.id} has ${stat} ${value}`);
    }
    const maxHp = statValue(state, entity, 'hp');
    if (maxHp < 1) problems.push(`actor ${entity.id} has max HP ${maxHp}`);
  }
  return problems;
});

/**
 * Stats parts are well formed: known stat ids with finite bases, known bundles and statuses with
 * turns left, and whole points in known attributes.
 */
registerInvariant('stats.parts', (state) => {
  const problems: string[] = [];
  for (const entity of Object.values(state.entities)) {
    const stats = entity.stats;
    if (stats === undefined) continue;
    for (const [stat, value] of Object.entries(stats.base)) {
      if (!isStatId(stat)) problems.push(`entity ${entity.id} has a base for unknown stat "${stat}"`);
      else if (typeof value !== 'number' || !Number.isFinite(value)) problems.push(`entity ${entity.id} has base ${stat} ${String(value)}`);
    }
    for (const b of stats.bundles) {
      if (!hasBundle(b.bundle)) problems.push(`entity ${entity.id} has unknown bundle "${b.bundle}"`);
    }
    for (const s of stats.statuses) {
      if (!STATUSES.has(s.status)) problems.push(`entity ${entity.id} has unknown status "${s.status}"`);
      if (!Number.isInteger(s.remaining) || s.remaining <= 0) {
        problems.push(`entity ${entity.id} has status "${s.status}" with ${s.remaining} turns left`);
      }
      if (!Number.isFinite(s.potency) || s.potency <= 0) problems.push(`entity ${entity.id} has status "${s.status}" at potency ${s.potency}`);
    }
    for (const [attribute, value] of Object.entries(stats.attributes ?? {})) {
      if (!isAttributeId(attribute)) problems.push(`entity ${entity.id} has points in unknown attribute "${attribute}"`);
      else if (typeof value !== 'number' || !Number.isInteger(value)) problems.push(`entity ${entity.id} has ${attribute} points ${String(value)}`);
    }
  }
  return problems;
});

/**
 * Levels are well formed (ETH-034, ETH-110): only adventurers have a growth part, its XP is a
 * whole number of at least 0, its level is the one that XP reaches, and its rolled growth is
 * whole points of at least 0 in known attributes.
 */
registerInvariant('stats.growth', (state) => Object.values(state.entities).flatMap(growthProblems));

/**
 * Run modifiers are well formed (ETH-115): unique keys, a source, known scopes and bundles, a
 * finite potency above 0, a finite reward bonus and a valid end.
 */
registerInvariant('stats.runModifiers', (state) => {
  const slice = state.domains.stats;
  if (!Array.isArray(slice.runModifiers)) return ['the run modifier list is missing'];
  const problems = runModifierListProblems(slice.runModifiers);
  slice.runModifiers.forEach((m, i) => {
    if (typeof m.potency !== 'number') problems.push(`run modifier ${i} ("${m.key}") has no potency`);
  });
  if (typeof slice.runModifiersAnnounced !== 'boolean') problems.push('runModifiersAnnounced is not a boolean');
  return problems;
});

/**
 * Codex discoveries: a status is seen the first time it lands on anyone; a run modifier's
 * source (an Omen, a deity, an upgrade) is seen when it takes effect (ETH-115).
 */
export const STATS_DISCOVERIES: DiscoveryRules = {
  statusApplied: (e) => (STATUSES.has(e.status) ? [{ id: e.status, mark: 'seen' }] : []),
  runModifierAdded: (e) => (findDef(e.source.id) === undefined ? [] : [{ id: e.source.id, mark: 'seen' }]),
};

/** A run chronicle moment (ETH-120): an adventurer gained a level. `amount` is the level reached. */
export const CHRONICLE_LEVEL_UP = defineChronicleKind({ id: 'leveledUp', priority: 60 });

/** Which of this domain's events are run chronicle moments. */
export const STATS_CHRONICLE: ChronicleRules = {
  leveledUp: (e) => momentAt(CHRONICLE_LEVEL_UP, e, [e.actor], [e.classId], { amount: e.level }),
};

/** What this domain registers with the shared code, in this order. */
export const STATS_DOMAIN: SimDomain<StatsTypes> = {
  actions: STATS_ACTIONS,
  commands: STATS_COMMANDS,
  init: initStats,
  snapshot: statsSnapshot,
  statProviders: [PROVIDER_BASE, PROVIDER_CLASS_RACE, PROVIDER_ATTRIBUTES],
  bundleSources: [SOURCE_ATTACHED, SOURCE_STATUSES, SOURCE_RUN],
  conditions: [COND_RUN_FLAG],
  triggers: [TRIGGER_TURN_START, TRIGGER_TURN_END],
  turnStart: statsTurnStart,
  turnEnd: statsTurnEnd,
  discoveries: STATS_DISCOVERIES,
  chronicle: STATS_CHRONICLE,
  chronicleKinds: [CHRONICLE_LEVEL_UP],
  trackers: [XP_TRACKER as RunTracker<unknown>],
};
