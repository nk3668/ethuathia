/**
 * Tactics (ETH-162, CLAUDE.md §5.2): the named options the player picks and swaps instead of
 * writing behavior rules. Each option sits on one of six axes. The party picks a **stance** and a
 * **formation**; each adventurer picks a **role**, a **range**, a **focus** and some **habits**.
 *
 * An option is content. What it does comes in one of two ways:
 *
 * - **Rule rows** (stance, role and habit options): condition -> rule action rows the sim puts
 *   ahead of the baseline, in the fixed order stance, then habits, then role (`buildTacticRules`,
 *   `src/sim/ai/tactics.ts`). Rows name conditions and rule actions by id, and a row that needs a
 *   kind of help asks for an ability tag (`act.use_ability { tag: 'heal' }`), never for a class, a
 *   spell or an item.
 * - **Parameters** (range, focus and formation options): fixed numbers or words that rule actions
 *   read from `AiCtx` (an engagement distance, a target preference, a leash). The player picks the
 *   option; the numbers are never set by hand.
 *
 * An option with neither is neutral: it changes nothing, so the baseline plays as it always has.
 * The starter defaults below are all neutral, which is why a run with default picks is identical
 * to one with tactics off. Roles, ranges, focuses, habits, stances and formations arrive with
 * ETH-193, ETH-194, ETH-071 and ETH-151; this file ships a small set that exercises every axis.
 *
 * `requires` and `favors` are validated but unused until M4 (class-only options, bonuses for a
 * good fit). Until then any adventurer can take any option.
 */
import { z } from 'zod';
import { Registry } from '../core';
import type { Def } from '../core';
import type { ContentKind, ContentRef } from './kind';
import { defShape, idSchema } from './schema';

/** The six axes, in the order the panel lists them. */
export const TACTIC_AXES = ['stance', 'formation', 'role', 'range', 'focus', 'habit'] as const;
export type TacticAxis = (typeof TACTIC_AXES)[number];

/** The axes the party picks on (one pick each), and the ones each adventurer picks on. */
export const PARTY_AXES = ['stance', 'formation'] as const;
export const ADVENTURER_AXES = ['role', 'range', 'focus', 'habit'] as const;

/** Axes whose options contribute rule rows, and axes whose options carry parameters. */
export const ROW_AXES: readonly TacticAxis[] = ['stance', 'role', 'habit'];
export const PARAM_AXES: readonly TacticAxis[] = ['formation', 'range', 'focus'];

/** One rule row of an option: when `condition` holds and `action` can be done, do it. */
export interface TacticRow {
  readonly condition: { readonly id: string; readonly params?: unknown };
  readonly action: { readonly id: string; readonly params?: unknown };
}

/** Who an option is for (M4): validated now, enforced later. */
export interface TacticFit {
  /** Class ids. */
  readonly classes?: readonly string[];
}

/** The target preferences a focus option can have. */
export const FOCUS_PREFERENCES = ['weakest', 'strongest'] as const;
export type FocusPreference = (typeof FOCUS_PREFERENCES)[number];

/**
 * An option's parameters. The keys depend on the axis: formation `{ leash, close }` (tiles the party
 * may drift apart, and the distance a straggler walks back to), range `{ engage }` (preferred
 * distance to an enemy in tiles, 1 is adjacent) and focus `{ prefer }` (`FOCUS_PREFERENCES`).
 */
export type TacticParams = Readonly<Record<string, number | string>>;

export interface TacticDef extends Def {
  readonly axis: TacticAxis;
  /** Rule rows, for stance, role and habit options. Leave out (or empty) for a neutral option. */
  readonly rows?: readonly TacticRow[];
  /** Parameters, for formation, range and focus options. */
  readonly params?: TacticParams;
  /** Habit options only: habits that can't be picked together with this one. Must be mutual. */
  readonly exclusiveWith?: readonly string[];
  /** Who may take it (M4). */
  readonly requires?: TacticFit;
  /** Who gets a bonus for taking it (M4). */
  readonly favors?: TacticFit;
}

export const TACTICS = new Registry<TacticDef>('tactic');

/** The baseline's own party leash and close distance (PARTY_LEASH, PARTY_CLOSE in the sim, checked by checkGame): what the default formation must say. */
export const NEUTRAL_LEASH = 8;
export const NEUTRAL_CLOSE = 3;

const ruleRef = (prefix: string) => z.strictObject({ id: idSchema(prefix), params: z.unknown().optional() });
const rowSchema = z.strictObject({ condition: ruleRef('cond'), action: ruleRef('act') });
const fitSchema = z.strictObject({ classes: z.array(idSchema('class')).min(1).optional() });
const paramValue = z.union([z.number(), z.string()]);

/** Why `params` are wrong for `axis`, as problem lines (keys, types and ranges). */
export function tacticParamProblems(axis: TacticAxis, params: TacticParams | undefined): string[] {
  const keys = { formation: ['leash', 'close'], range: ['engage'], focus: ['prefer'] }[axis as 'formation' | 'range' | 'focus'];
  if (keys === undefined) return params === undefined ? [] : [`a ${axis} option takes no params`];
  if (params === undefined) return [`a ${axis} option needs params (${keys.join(', ')})`];
  const problems: string[] = [];
  for (const key of Object.keys(params)) if (!keys.includes(key)) problems.push(`params.${key} is not a ${axis} parameter`);
  for (const key of keys) {
    const value = params[key];
    if (value === undefined) problems.push(`params.${key} is required`);
    else if (key === 'prefer') {
      if (!(FOCUS_PREFERENCES as readonly unknown[]).includes(value)) problems.push(`params.prefer must be one of ${FOCUS_PREFERENCES.join(', ')}`);
    } else if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) problems.push(`params.${key} must be a whole number of 1 or more`);
  }
  if (axis === 'formation' && typeof params.leash === 'number' && typeof params.close === 'number' && params.close > params.leash) {
    problems.push('params.close must not exceed params.leash');
  }
  return problems;
}

export const TACTIC_KIND: ContentKind<TacticDef> = {
  registry: TACTICS,
  schema: z
    .strictObject({
      ...defShape('tactic'),
      axis: z.enum(TACTIC_AXES),
      rows: z.array(rowSchema).optional(),
      params: z.record(z.string(), paramValue).optional(),
      exclusiveWith: z.array(idSchema('tactic')).optional(),
      requires: fitSchema.optional(),
      favors: fitSchema.optional(),
    })
    .superRefine((def, ctx) => {
      const problem = (path: string, message: string) => ctx.addIssue({ code: 'custom', path: [path], message });
      if (def.rows !== undefined && !ROW_AXES.includes(def.axis)) problem('rows', `a ${def.axis} option takes parameters, not rows`);
      if (def.exclusiveWith !== undefined && def.axis !== 'habit') problem('exclusiveWith', 'only habit options can be exclusive');
      if (def.exclusiveWith?.includes(def.id) === true) problem('exclusiveWith', 'must not list itself');
      for (const message of tacticParamProblems(def.axis, def.params)) problem('params', message);
    }),
  refs: (def) => [
    ...(def.rows ?? []).flatMap((row, i): ContentRef[] => [
      { path: `rows[${i}].condition.id`, kind: 'rule condition', id: row.condition.id },
      { path: `rows[${i}].action.id`, kind: 'rule action', id: row.action.id },
    ]),
    ...(def.exclusiveWith ?? []).map((id, i) => ({ path: `exclusiveWith[${i}]`, kind: 'tactic', id })),
    ...(def.requires?.classes ?? []).map((id, i) => ({ path: `requires.classes[${i}]`, kind: 'class', id })),
    ...(def.favors?.classes ?? []).map((id, i) => ({ path: `favors.classes[${i}]`, kind: 'class', id })),
  ],
  check: (defs) => {
    const problems: string[] = [];
    // The neutral default (ETH-162): exactly one `default` option per axis but habits (a habit
    // is something extra), with no rows and parameters that reproduce the baseline.
    for (const axis of TACTIC_AXES.filter((a) => a !== 'habit')) {
      const defaults = defs.filter((d) => d.axis === axis && d.tags.includes('default'));
      if (defaults.length !== 1) problems.push(`tactic axis "${axis}": needs exactly one default option, has ${defaults.length}`);
    }
    for (const def of defs.filter((d) => d.tags.includes('default'))) {
      if ((def.rows ?? []).length > 0) problems.push(`tactic "${def.id}": a default option must have no rows`);
      const p = def.params ?? {};
      if (def.axis === 'formation' && (p.leash !== NEUTRAL_LEASH || p.close !== NEUTRAL_CLOSE)) problems.push(`tactic "${def.id}": the default formation must have leash ${NEUTRAL_LEASH} and close ${NEUTRAL_CLOSE}`);
      if (def.axis === 'range' && p.engage !== 1) problems.push(`tactic "${def.id}": the default range must have engage 1`);
      if (def.axis === 'focus' && p.prefer !== 'weakest') problems.push(`tactic "${def.id}": the default focus must prefer the weakest`);
    }
    for (const def of defs) {
      for (const other of def.exclusiveWith ?? []) {
        if (!TACTICS.has(other)) continue;
        const them = TACTICS.get(other);
        if (them.axis !== 'habit') problems.push(`tactic "${def.id}": exclusiveWith "${other}" is not a habit`);
        else if (!(them.exclusiveWith ?? []).includes(def.id)) problems.push(`tactic "${def.id}": exclusiveWith "${other}", which does not list it back`);
      }
    }
    return problems;
  },
};

/** Registers an option and returns it. Its shape is checked by `validateContent`. */
export function defineTactic(def: TacticDef): TacticDef {
  return TACTICS.register(def);
}

/** The options on `axis`, in registration order. */
export function tacticsOn(axis: TacticAxis): TacticDef[] {
  return TACTICS.all().filter((t) => t.axis === axis);
}

// ---------------------------------------------------------------------------------------------
// Starter options. The first on each axis is the neutral default: it changes nothing.

/** Hold the line: the baseline's own approach. No rows. */
export const STANCE_STEADY = defineTactic({
  id: 'tactic.steady',
  name: 'Steady',
  description: 'Explore, fight and descend as the adventurers always have. Changes nothing.',
  hint: 'The measured pace of a party that has done this before.',
  tags: ['default'],
  axis: 'stance',
});

/** Head home now: the whole party climbs out and the run ends as a retreat. */
export const STANCE_FALL_BACK = defineTactic({
  id: 'tactic.fall_back',
  name: 'Fall back',
  description:
    'Head for the stairs up and out of the dungeon, whatever is left to explore. This placeholder comes before every ' +
    'other rule, urgent ones included (ETH-071 replaces it with a guarded stance). The run ends as a retreat: ' +
    'the party keeps everything it earned and every survivor returns to the roster.',
  hint: 'The order to stop pushing and bring everyone home.',
  tags: [],
  axis: 'stance',
  rows: [{ condition: { id: 'cond.always' }, action: { id: 'act.retreat_run' } }],
});

export const FORMATION_STICK_TOGETHER = defineTactic({
  id: 'tactic.stick_together',
  name: 'Stick together',
  description: 'Stay within a few tiles of the party’s lead: a straggler more than 8 tiles away walks back until it is within 3.',
  hint: 'Close ranks, like a party that has lost someone before.',
  tags: ['default'],
  axis: 'formation',
  params: { leash: 8, close: 3 },
});

export const FORMATION_LOOSE = defineTactic({
  id: 'tactic.loose',
  name: 'Loose',
  description: 'Let the party drift apart: a straggler walks back only when more than 14 tiles away, until it is within 6.',
  hint: 'Room to move, at the price of help being far away.',
  tags: [],
  axis: 'formation',
  params: { leash: 14, close: 6 },
});

/** Fights whatever is in reach: the baseline's own fighting. No rows. */
export const ROLE_DAMAGE = defineTactic({
  id: 'tactic.damage',
  name: 'Damage',
  description: 'Kill things. Fights as the baseline does and carries no extra duties.',
  hint: 'The one who ends fights.',
  tags: ['default'],
  axis: 'role',
});

export const ROLE_HEALER = defineTactic({
  id: 'tactic.healer',
  name: 'Healer',
  description:
    'Looks after the party’s health first: uses the best healing it carries once below half HP. Without any healing it ' +
    'says so in the log and carries on as normal.',
  hint: 'Keeps a hand on the wounded and a flask at the ready.',
  tags: [],
  axis: 'role',
  rows: [{ condition: { id: 'cond.wounded', params: { percent: 50 } }, action: { id: 'act.use_ability', params: { tag: 'heal' } } }],
});

export const RANGE_FRONT_LINE = defineTactic({
  id: 'tactic.front_line',
  name: 'Front line',
  description: 'Fights toe to toe: prefers to engage an enemy from the next tile.',
  hint: 'Stands where the blows land.',
  tags: ['default'],
  axis: 'range',
  params: { engage: 1 },
});

export const RANGE_BACK_LINE = defineTactic({
  id: 'tactic.back_line',
  name: 'Back line',
  description: 'Prefers to engage from a few tiles back, behind whoever holds the front.',
  hint: 'Fights from behind the shields.',
  tags: [],
  axis: 'range',
  params: { engage: 4 },
});

/** Strikes the adjacent enemy with the least HP left: the baseline's own choice. */
export const FOCUS_WEAKEST = defineTactic({
  id: 'tactic.weakest',
  name: 'Weakest',
  description: 'Strikes the adjacent enemy with the least HP left, so kills come quickly.',
  hint: 'Finishes what is already falling.',
  tags: ['default'],
  axis: 'focus',
  params: { prefer: 'weakest' },
});

export const FOCUS_STRONGEST = defineTactic({
  id: 'tactic.strongest',
  name: 'Strongest',
  description: 'Strikes the adjacent enemy with the most HP left, wearing down the biggest threat first.',
  hint: 'Goes for the biggest thing in the room.',
  tags: [],
  axis: 'focus',
  params: { prefer: 'strongest' },
});

export const HABIT_QUICK_TO_QUAFF = defineTactic({
  id: 'tactic.quick_to_quaff',
  name: 'Quick to quaff',
  description: 'Uses the best healing it carries as soon as HP drops below 60%, rather than waiting for the baseline’s 35%.',
  hint: 'Never lets the wounds pile up.',
  tags: [],
  axis: 'habit',
  rows: [{ condition: { id: 'cond.wounded', params: { percent: 60 } }, action: { id: 'act.use_ability', params: { tag: 'heal' } } }],
});

/** The neutral option on each axis, which every default build uses. */
export const DEFAULT_STANCE = STANCE_STEADY.id;
export const DEFAULT_FORMATION = FORMATION_STICK_TOGETHER.id;

/** An adventurer's own picks, without the party's stance and formation. */
export interface AdventurerPicks {
  readonly role: string;
  readonly range: string;
  readonly focus: string;
  readonly habits: readonly string[];
}

/** What a class that names no default build plays: the neutral option on every axis. */
export const NEUTRAL_PICKS: AdventurerPicks = {
  role: ROLE_DAMAGE.id,
  range: RANGE_FRONT_LINE.id,
  focus: FOCUS_WEAKEST.id,
  habits: [],
};

/** The shape of `AdventurerPicks` for content that stores one (a class's default build). */
export const picksSchema = z.strictObject({
  role: idSchema('tactic'),
  range: idSchema('tactic'),
  focus: idSchema('tactic'),
  habits: z.array(idSchema('tactic')),
});

/** The tactic ids a picks object mentions, with where, for ref checks. */
export function picksRefs(path: string, picks: AdventurerPicks): ContentRef[] {
  return [
    { path: `${path}.role`, kind: 'tactic', id: picks.role },
    { path: `${path}.range`, kind: 'tactic', id: picks.range },
    { path: `${path}.focus`, kind: 'tactic', id: picks.focus },
    ...picks.habits.map((id, i) => ({ path: `${path}.habits[${i}]`, kind: 'tactic', id })),
  ];
}

/** The most habits one adventurer can carry at all. Habit slots (ETH-194) set the actual limit, up to this. */
export const MAX_HABITS = 3;

/**
 * Why `picks` can't be played, as problem lines: an id that is not an option, an option on the
 * wrong axis, a repeated or exclusive habit, too many habits. `lookup` finds an option by id
 * (default: the registry), so tests can check against options of their own.
 */
export function picksProblems(
  picks: AdventurerPicks,
  lookup: (id: string) => TacticDef | undefined = (id) => (TACTICS.has(id) ? TACTICS.get(id) : undefined),
): string[] {
  const problems: string[] = [];
  const one = (axis: TacticAxis, id: string): TacticDef | undefined => {
    const def = lookup(id);
    if (def === undefined) problems.push(`unknown ${axis} tactic "${id}"`);
    else if (def.axis !== axis) problems.push(`"${id}" is a ${def.axis} tactic, not a ${axis} tactic`);
    return def;
  };
  one('role', picks.role);
  one('range', picks.range);
  one('focus', picks.focus);
  if (picks.habits.length > MAX_HABITS) problems.push(`${picks.habits.length} habits, at most ${MAX_HABITS}`);
  const seen = new Set<string>();
  for (const id of picks.habits) {
    if (seen.has(id)) problems.push(`habit "${id}" is picked twice`);
    seen.add(id);
    const def = one('habit', id);
    for (const other of def?.exclusiveWith ?? []) if (picks.habits.includes(other)) problems.push(`habit "${id}" can't be taken with "${other}"`);
  }
  return problems;
}
