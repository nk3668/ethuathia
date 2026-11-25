/**
 * Run-wide modifiers (ETH-115, docs/ARCHITECTURE.md "Run-wide modifiers"): one place for
 * "something that changes the whole run". Omens (ETH-067), deity blessings (ETH-070), cursed
 * modifiers taken mid-run (ETH-105), floor-wide dungeon events (ETH-107), doctrine (ETH-071),
 * Tavern veterans and owned upgrades' `run`-scope bundle grants each add a `RunModifier`.
 *
 * A modifier has a source (credited in stat tooltips), a scope (`party`, `monsters` or `all`),
 * and any of: a bundle (through the `stats.run` `BundleSource`, so its modifiers reach `getStat`
 * and its triggers fire), named flags (`runFlag`, `cond.run_flag`), a reward bonus
 * (`rewardMultiplier`, applied to `rewards.atRisk`) and an end (`until`).
 *
 * The list lives in the stats slice, `state.domains.stats.runModifiers`. Change it only through
 * `addRunModifier` and `removeRunModifier`, which emit `runModifierAdded` / `runModifierRemoved`.
 */
import { OMENS, omenRank, RUN_GATE_INFO, RUN_GATES, UPGRADES, upgradeBundle } from '../../content';
import type { Bundle, RunGate } from '../../content';
import { defineCondition } from '../ai/types';
import type { ParamParser } from '../ai/types';
import type { Emit } from '../events';
import type { Entity, EntityId, FloorId, RunState } from '../state';
import { bundleOf, clampVitals } from './getStat';
import { isStatId, STAT_INFO } from './statIds';
import type { BundleSource } from './types';

/** Who a run modifier's bundle applies to: party-faction actors, monster-faction actors, or every actor. */
export type RunModifierScope = 'party' | 'monsters' | 'all';

export const RUN_MODIFIER_SCOPES: readonly RunModifierScope[] = ['party', 'monsters', 'all'];

/** When a run modifier ends by itself. Left out, it lasts the whole run. */
export type RunModifierUntil =
  /** When the party first leaves this floor: the first party member to take the stairs off it. */
  | { floor: FloorId }
  /** At the first actor turn on or after this game turn. */
  | { turn: number };

/** What a run modifier is credited to: a content id (or a node id) and the tooltip text, e.g. "Gloom (Omen, rank 2)". */
export interface RunModifierSource {
  id: string;
  label: string;
}

/** A run modifier as a config or a caller writes it. `potency` defaults to 1. Plain data. */
export interface RunModifierConfig {
  /** Unique within the run; how it is removed again. Adding a second with the same key replaces the first. */
  key: string;
  source: RunModifierSource;
  scope: RunModifierScope;
  /**
   * The id of a def carrying a bundle (`bundleOf`), or of an upgrade node, whose `run`-scope
   * bundle grants are used. Left out, the modifier changes no stats.
   */
  bundle?: string;
  /** Scales the bundle's modifiers and trigger amounts. Default 1. */
  potency?: number;
  /** Named switches code and rules read with `runFlag` / `cond.run_flag` (`doctrine.seek_stairs`, `omen.dry_wells`). */
  flags?: string[];
  /** Added to the reward multiplier: 0.2 is +20% on every at-risk currency. */
  rewardBonus?: number;
  /** Added to the in-run XP multiplier (ETH-132): 0.1 is +10% on every XP grant. Class Mastery follows, as it counts the XP earned. */
  xpBonus?: number;
  /** Added to the pay of every completed contract (ETH-132): 0.1 is +10%, before the reward multiplier. */
  contractBonus?: number;
  until?: RunModifierUntil;
  /**
   * Gates the bundle (ETH-187): its modifiers and triggers count only for an actor that is fleeing, or
   * only once the party has turned back (`RunGate`). Left out, the bundle always applies.
   */
  when?: RunGate;
}

/** A run modifier in the run state: a config with its potency filled in. Plain data. */
export interface RunModifier extends RunModifierConfig {
  potency: number;
}

/** Why a run modifier went away. */
export type RunModifierEndReason = 'removed' | 'expired';

/** The events run modifiers emit. Log text in `ui/shell/logText/stats.ts`. */
export type RunModifierEvent =
  /**
   * A run modifier took effect. `atStart` marks one from the run config, announced on the run's
   * first turn; `replaced` one that took the place of a modifier with the same key.
   */
  | {
      type: 'runModifierAdded';
      key: string;
      source: RunModifierSource;
      scope: RunModifierScope;
      rewardBonus?: number;
      xpBonus?: number;
      contractBonus?: number;
      atStart?: boolean;
      replaced?: boolean;
    }
  /** A run modifier ended: taken off (`removed`) or run out (`expired`, its `until`). */
  | { type: 'runModifierRemoved'; key: string; source: RunModifierSource; reason: RunModifierEndReason };

/** A config entry as stored: a fresh copy with `potency` filled in. */
export function toRunModifier(config: RunModifierConfig): RunModifier {
  const mod: RunModifier = {
    key: config.key,
    source: { id: config.source.id, label: config.source.label },
    scope: config.scope,
    potency: config.potency ?? 1,
  };
  if (config.bundle !== undefined) mod.bundle = config.bundle;
  if (config.flags !== undefined) mod.flags = [...config.flags];
  if (config.rewardBonus !== undefined) mod.rewardBonus = config.rewardBonus;
  if (config.xpBonus !== undefined) mod.xpBonus = config.xpBonus;
  if (config.contractBonus !== undefined) mod.contractBonus = config.contractBonus;
  if (config.when !== undefined) mod.when = config.when;
  if (config.until !== undefined) mod.until = 'floor' in config.until ? { floor: config.until.floor } : { turn: config.until.turn };
  return mod;
}

/**
 * The bundle a run modifier names: an upgrade node's `run`-scope bundle grants (merged), or any
 * other def's bundle (`bundleOf`). Throws on an unknown id or one without a bundle.
 */
export function runBundleOf(id: string): Bundle {
  // An Omen rank's bundle (ETH-185): `omen.gloom#2`.
  const hash = id.indexOf('#');
  if (hash > 0 && id.startsWith('omen.')) {
    const base = id.slice(0, hash);
    const bundle = OMENS.has(base) ? omenRank(OMENS.get(base), Number(id.slice(hash + 1)))?.bundle : undefined;
    if (bundle === undefined) throw new Error(`Omen rank "${id}" has no bundle`);
    return bundle;
  }
  if (UPGRADES.has(id)) {
    const bundle = upgradeBundle(UPGRADES.get(id), 'run');
    if (bundle === undefined) throw new Error(`Upgrade "${id}" has no run-scope bundle grant`);
    return bundle;
  }
  return bundleOf(id);
}

function hasRunBundle(id: string): boolean {
  try {
    runBundleOf(id);
    return true;
  } catch {
    return false;
  }
}

const nonEmpty = (value: unknown): value is string => typeof value === 'string' && value.trim() !== '';

/** Problems with one run modifier (config or state), each a phrase; empty if it is well formed. */
export function runModifierProblems(mod: RunModifierConfig): string[] {
  const problems: string[] = [];
  if (!nonEmpty(mod.key)) problems.push('has no key');
  if (!nonEmpty(mod.source?.id) || !nonEmpty(mod.source?.label)) problems.push('needs a source with an id and a label');
  if (!RUN_MODIFIER_SCOPES.includes(mod.scope)) problems.push(`has unknown scope "${String(mod.scope)}"`);
  if (mod.bundle !== undefined && !hasRunBundle(mod.bundle)) problems.push(`has unknown bundle "${mod.bundle}"`);
  if (mod.when !== undefined && !RUN_GATES.includes(mod.when)) problems.push(`has unknown gate "${String(mod.when)}"`);
  if (mod.when !== undefined && mod.bundle === undefined) problems.push('has a gate without a bundle');
  if (mod.potency !== undefined && (!Number.isFinite(mod.potency) || mod.potency <= 0)) problems.push(`has potency ${mod.potency}`);
  for (const flag of mod.flags ?? []) if (!nonEmpty(flag)) problems.push('has an empty flag');
  if (mod.rewardBonus !== undefined && !Number.isFinite(mod.rewardBonus)) problems.push(`has reward bonus ${mod.rewardBonus}`);
  if (mod.xpBonus !== undefined && !Number.isFinite(mod.xpBonus)) problems.push(`has XP bonus ${mod.xpBonus}`);
  if (mod.contractBonus !== undefined && !Number.isFinite(mod.contractBonus)) problems.push(`has contract bonus ${mod.contractBonus}`);
  const until = mod.until;
  if (until !== undefined) {
    if ('floor' in until) {
      if (!nonEmpty(until.floor)) problems.push('ends on an empty floor id');
    } else if (!Number.isSafeInteger(until.turn) || until.turn < 0) {
      problems.push(`ends on turn ${String(until.turn)}`);
    }
  }
  return problems;
}

/** Problems with a list of run modifiers: each one's, plus repeated keys. */
export function runModifierListProblems(mods: readonly RunModifierConfig[]): string[] {
  const problems: string[] = [];
  const keys = new Set<string>();
  mods.forEach((mod, i) => {
    for (const p of runModifierProblems(mod)) problems.push(`run modifier ${i} ("${String(mod.key)}") ${p}`);
    if (keys.has(mod.key)) problems.push(`run modifier key "${mod.key}" is used twice`);
    keys.add(mod.key);
  });
  return problems;
}

/** The run's modifiers, in the order they were added. Read-only: change them with `addRunModifier` / `removeRunModifier`. */
export function runModifiers(state: RunState): readonly RunModifier[] {
  return state.domains.stats.runModifiers;
}

/** True if a run modifier with this scope applies to `entity` (an actor of that faction; `all`: any actor). */
export function runScopeIncludes(scope: RunModifierScope, entity: Entity): boolean {
  const faction = entity.actor?.faction;
  if (faction === undefined) return false;
  if (scope === 'all') return true;
  return scope === 'party' ? faction === 'party' : faction === 'monster';
}

/**
 * True if any run modifier carries `flag`. Code reads named switches with it
 * (`runFlag(state, 'omen.dry_wells')`); rules use `cond.run_flag`.
 */
export function runFlag(state: RunState, flag: string): boolean {
  return runModifiers(state).some((m) => m.flags?.includes(flag) === true);
}

/**
 * The reward multiplier: 1 + the sum of every run modifier's `rewardBonus` (additive across
 * sources), never below 0. Exactly 1 with no bonuses. `reduceTrackers` applies it to the
 * at-risk total (base → ×multiplier → −25% on a wipe; docs/ARCHITECTURE.md "Rewards").
 */
export function rewardMultiplier(state: RunState): number {
  let sum = 0;
  for (const m of runModifiers(state)) sum += m.rewardBonus ?? 0;
  return Math.max(0, 1 + sum);
}

/** The in-run XP multiplier: 1 + the sum of every run modifier's `xpBonus`, never below 0. Exactly 1 with none. */
export function xpMultiplier(state: RunState): number {
  let sum = 0;
  for (const m of runModifiers(state)) sum += m.xpBonus ?? 0;
  return Math.max(0, 1 + sum);
}

/** The contract pay multiplier: 1 + the sum of every run modifier's `contractBonus`, never below 0. Exactly 1 with none. */
export function contractMultiplier(state: RunState): number {
  let sum = 0;
  for (const m of runModifiers(state)) sum += m.contractBonus ?? 0;
  return Math.max(0, 1 + sum);
}

/** `amount` at `multiplier`, rounded down to a whole number. Exactly `amount` at 1. */
export function applyRewardMultiplier(amount: number, multiplier: number): number {
  if (multiplier === 1) return amount;
  // The small epsilon keeps 10 × 1.1 at 11, not 10.
  return Math.floor(amount * multiplier + 1e-9);
}

/** Brings every actor's HP and MP within its maxima, after a run modifier went or came. */
function clampEveryone(state: RunState, scope: RunModifierScope): void {
  for (const entity of Object.values(state.entities)) if (runScopeIncludes(scope, entity)) clampVitals(state, entity);
}

/**
 * Adds a run modifier mid-run (a curse taken, a dungeon event) and emits `runModifierAdded`.
 * One with the key of a modifier already active replaces it in place. Lowered maxima clamp
 * current HP and MP; raised ones don't heal. Throws if the modifier is malformed. The at-risk
 * total follows a changed reward bonus at the end of the step.
 */
export function addRunModifier(state: RunState, config: RunModifierConfig, emit: Emit): RunModifier {
  const problems = runModifierProblems(config);
  if (problems.length > 0) throw new Error(`Run modifier "${String(config.key)}" ${problems.join('; ')}`);
  const mod = toRunModifier(config);
  const list = state.domains.stats.runModifiers;
  const i = list.findIndex((m) => m.key === mod.key);
  const old = i >= 0 ? list[i] : undefined;
  if (old !== undefined) list[i] = mod;
  else list.push(mod);
  emit({
    type: 'runModifierAdded',
    key: mod.key,
    source: { ...mod.source },
    scope: mod.scope,
    ...(mod.rewardBonus === undefined ? {} : { rewardBonus: mod.rewardBonus }),
    ...(mod.xpBonus === undefined ? {} : { xpBonus: mod.xpBonus }),
    ...(mod.contractBonus === undefined ? {} : { contractBonus: mod.contractBonus }),
    ...(old === undefined ? {} : { replaced: true }),
  });
  if (old !== undefined) clampEveryone(state, old.scope);
  clampEveryone(state, mod.scope);
  return mod;
}

/** Removes the run modifier with `key`, emitting `runModifierRemoved`. Returns false if there was none. */
export function removeRunModifier(state: RunState, key: string, emit: Emit, reason: RunModifierEndReason = 'removed'): boolean {
  const list = state.domains.stats.runModifiers;
  const i = list.findIndex((m) => m.key === key);
  const mod = list[i];
  if (mod === undefined) return false;
  list.splice(i, 1);
  emit({ type: 'runModifierRemoved', key, source: { ...mod.source }, reason });
  clampEveryone(state, mod.scope);
  return true;
}

/**
 * Announces the config's modifiers on the run's first actor turn (`runModifierAdded` with
 * `atStart`), so the log and the Codex hear of them. Setting up a run reports no events.
 */
export function announceRunModifiers(state: RunState, emit: Emit): void {
  const slice = state.domains.stats;
  if (slice.runModifiersAnnounced) return;
  slice.runModifiersAnnounced = true;
  for (const mod of slice.runModifiers) {
    emit({
      type: 'runModifierAdded',
      key: mod.key,
      source: { ...mod.source },
      scope: mod.scope,
      ...(mod.rewardBonus === undefined ? {} : { rewardBonus: mod.rewardBonus }),
      ...(mod.xpBonus === undefined ? {} : { xpBonus: mod.xpBonus }),
      ...(mod.contractBonus === undefined ? {} : { contractBonus: mod.contractBonus }),
      atStart: true,
    });
  }
}

/** Ends every modifier whose `until.turn` has come. Called at the start of each actor's turn. */
export function expireTurnModifiers(state: RunState, emit: Emit): void {
  const due = runModifiers(state).filter((m) => m.until !== undefined && 'turn' in m.until && state.turn >= m.until.turn);
  for (const m of due) removeRunModifier(state, m.key, emit, 'expired');
}

/**
 * Where the party member taking the current turn stood when it began, so the turn's end can
 * tell that they left a floor. Set and read within one `takeTurn` (no save happens between), so
 * it is never part of the run state.
 */
let turnFrom: { actor: EntityId; floor: FloorId } | null = null;

/** Notes where a party member starts its turn. */
export function noteTurnFloor(state: RunState, actor: Entity): void {
  turnFrom = state.party.includes(actor.id) ? { actor: actor.id, floor: actor.floor } : null;
}

/**
 * Ends every `until: { floor }` modifier for the floor a party member just left (the default:
 * the party first leaving the floor ends it). Called at the end of each actor's turn.
 */
export function expireFloorModifiers(state: RunState, actor: Entity, emit: Emit): void {
  const from = turnFrom;
  turnFrom = null;
  if (from === null || from.actor !== actor.id || actor.floor === from.floor) return;
  const due = runModifiers(state).filter((m) => m.until !== undefined && 'floor' in m.until && m.until.floor === from.floor);
  for (const m of due) removeRunModifier(state, m.key, emit, 'expired');
}

/**
 * Whether a run modifier's gate holds for `entity` right now (ETH-187). `fleeing` reads the AI's
 * flight memory (`act.flee` sets it, and it clears when the flight ends); `returning` is the run
 * domain's `leaving`, the same test as the floors domain's `headingOut`, read from the state here
 * so stats keeps no import of floors.
 */
export function gateHolds(state: RunState, entity: Entity, gate: RunGate): boolean {
  if (gate === 'fleeing') {
    return entity.ai?.memory.fleeing != null && entity.ai.possessed !== true && entity.ai.memory.intent?.action !== 'act.attack_adjacent';
  }
  return state.domains.run.leaving !== null;
}

/**
 * `stats.run`: every run modifier with a bundle whose scope includes the entity, at its potency,
 * credited to its source id and labeled with its source label ("Gloom (Omen, rank 2)").
 */
export const SOURCE_RUN: BundleSource = {
  id: 'stats.run',
  visit(state, entity, visit) {
    for (const m of state.domains.stats.runModifiers) {
      if (m.bundle === undefined || !runScopeIncludes(m.scope, entity)) continue;
      if (m.when !== undefined && !gateHolds(state, entity, m.when)) continue;
      visit(runBundleOf(m.bundle), m.source.id, m.potency, m.source.label);
    }
  },
};

// ---------------------------------------------------------------------------------------------
// Words for tooltips and the log

const SCOPE_WORDS: Record<RunModifierScope, string> = { party: 'the party', monsters: 'monsters', all: 'everyone' };

/** "the party", "monsters" or "everyone". */
export function scopeWords(scope: RunModifierScope): string {
  return SCOPE_WORDS[scope];
}

/** "+20%" for a reward bonus of 0.2. */
export function rewardBonusText(bonus: number): string {
  const pct = Math.round(bonus * 100);
  return `${pct >= 0 ? '+' : '−'}${Math.abs(pct)}%`;
}

function statWord(stat: string): string {
  return isStatId(stat) ? STAT_INFO[stat].label : stat;
}

/** The `OmenRankDef` that created `mod`, when `mod.source.id` names an Omen and its rank is in config or source label. */
function omenRankFor(mod: RunModifier, state?: RunState) {
  if (!OMENS.has(mod.source.id)) return undefined;
  const def = OMENS.get(mod.source.id);
  const fromConfig = state?.config.omens?.find((o) => o.id === mod.source.id)?.rank;
  if (fromConfig !== undefined) return omenRank(def, fromConfig);
  const match = /\(Omen, rank (\d+)\)$/.exec(mod.source.label);
  return match === null ? undefined : omenRank(def, Number(match[1]));
}

/**
 * One line describing a modifier for its tooltip: what it does, to whom, the reward bonus and
 * when it ends. "Monsters: Sight −2. Rewards +20%. Ends when the party leaves floor 3."
 */
export function describeRunModifier(mod: RunModifier, state?: RunState): string {
  const parts: string[] = [];
  if (mod.bundle !== undefined) {
    const bundle = runBundleOf(mod.bundle);
    const changes = (bundle.modifiers ?? []).map((m) => {
      const value = m.op === 'add' ? m.value * mod.potency : 1 + (m.value - 1) * mod.potency;
      const shown = Math.round(value * 100) / 100;
      return m.op === 'add' ? `${statWord(m.stat)} ${shown >= 0 ? '+' : '−'}${Math.abs(shown)}` : `${statWord(m.stat)} ×${shown}`;
    });
    const triggers = bundle.triggers?.length ?? 0;
    if (triggers > 0) changes.push(`${triggers} triggered effect${triggers === 1 ? '' : 's'}`);
    if (changes.length > 0) {
      const who = scopeWords(mod.scope);
      parts.push(`${who.charAt(0).toUpperCase()}${who.slice(1)}: ${changes.join(', ')}.`);
    }
  }
  if (mod.when !== undefined) parts.push(`Only ${RUN_GATE_INFO[mod.when].name}.`);
  if (mod.flags !== undefined && mod.flags.length > 0) {
    const rank = omenRankFor(mod, state);
    if (rank === undefined) parts.push(`Sets ${mod.flags.join(', ')}.`);
    else if (mod.bundle === undefined) parts.push(rank.text.endsWith('.') ? rank.text : `${rank.text}.`);
  }
  if (mod.rewardBonus !== undefined && mod.rewardBonus !== 0) parts.push(`Rewards ${rewardBonusText(mod.rewardBonus)}.`);
  if (mod.xpBonus !== undefined && mod.xpBonus !== 0) parts.push(`XP ${rewardBonusText(mod.xpBonus)}.`);
  if (mod.contractBonus !== undefined && mod.contractBonus !== 0) parts.push(`Contract pay ${rewardBonusText(mod.contractBonus)}.`);
  if (mod.until !== undefined) {
    if ('turn' in mod.until) parts.push(`Ends on turn ${mod.until.turn}.`);
    else {
      const depth = state?.dungeon.nodes[mod.until.floor]?.depth;
      parts.push(`Ends when the party leaves ${depth === undefined ? 'its floor' : `floor ${depth}`}.`);
    }
  }
  return parts.join(' ');
}

// ---------------------------------------------------------------------------------------------
// Rule condition

/** `cond.run_flag`'s params: the flag to look for. */
export interface RunFlagParams {
  flag: string;
}

const parseRunFlag: ParamParser<RunFlagParams> = (raw) => {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return 'Params must be an object with "flag"';
  const { flag, ...rest } = raw as Record<string, unknown>;
  if (Object.keys(rest).length > 0) return `Unknown parameter "${Object.keys(rest)[0] as string}"`;
  if (!nonEmpty(flag)) return '"flag" must be a non-empty string';
  return { flag };
};

/**
 * True while some run modifier carries the flag (ETH-115). Run-scope, so rules, doctrine and
 * data requirements read the same switch.
 */
export const COND_RUN_FLAG = defineCondition({
  id: 'cond.run_flag',
  name: 'Run flag set',
  scope: 'run',
  description: 'True while an Omen, blessing, doctrine or other run-wide modifier sets the named flag.',
  parse: parseRunFlag,
  evaluate({ state }, { flag }) {
    const by = runModifiers(state).find((m) => m.flags?.includes(flag) === true);
    return by === undefined ? { ok: false, detail: '' } : { ok: true, detail: `${by.source.label} sets ${flag}` };
  },
  describe: ({ flag }) => `run flag ${flag} is set`,
});
