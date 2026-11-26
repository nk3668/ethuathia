/**
 * The tactics engine (ETH-162, CLAUDE.md §5.2, docs/ARCHITECTURE.md §4): turning the player's picks
 * into the rules an adventurer follows.
 *
 * The picks are option ids (`TacticPicks`): the party's stance and formation, and the
 * adventurer's role, range, focus and habits. `buildTacticRules` is pure: the same picks always
 * give the same rule list, in the fixed order **stance, then habits (in pick order), then role**,
 * each row tagged with the option it came from (`Rule.option`) so the trace can name it. The
 * baseline follows after them, as it does after any own rules. Range, focus and formation add no
 * rows: rule actions read them from `AiCtx` through `tacticsOf`.
 *
 * Tactics change only when the player says so (`setTactics`, `tacticsCommand.ts`): nothing in the
 * sim ever swaps one on its own.
 */
import { clonePlain } from '../../core';
import { registerInvariant } from '../invariants';
import { classTactics, CLASSES, DEFAULT_FORMATION, DEFAULT_STANCE, FOCUS_PREFERENCES, picksProblems, TACTICS } from '../../content';
import type { AdventurerPicks, FocusPreference, TacticDef } from '../../content';
import type { AiCtx, AiPart, ResolvedTactics, Rule, TacticPicks } from './types';

/**
 * The option with this id on `axis`, or the class's default for that axis when the id is unknown
 * or on another axis (a save or roster record naming an option the content dropped). Never throws:
 * the decision loop must survive stale picks, and the engine notes it in the trace (`stalePicks`).
 */
function option(axis: 'stance' | 'formation' | 'role' | 'range' | 'focus' | 'habit', id: string, fallback: string | undefined): TacticDef | undefined {
  if (TACTICS.has(id) && TACTICS.get(id).axis === axis) return TACTICS.get(id);
  return fallback !== undefined && TACTICS.has(fallback) ? TACTICS.get(fallback) : undefined;
}

/** The ids in `picks` that name no option on their axis. */
export function stalePicks(picks: TacticPicks): string[] {
  const out: string[] = [];
  const check = (axis: Parameters<typeof option>[0], id: string) => {
    if (!(TACTICS.has(id) && TACTICS.get(id).axis === axis)) out.push(id);
  };
  check('stance', picks.stance);
  check('formation', picks.formation);
  check('role', picks.role);
  check('range', picks.range);
  check('focus', picks.focus);
  for (const h of picks.habits) check('habit', h);
  return out;
}

/**
 * `picks` resolved to option defs. An id that is not a playable option on its axis falls back to
 * `classId`'s default for that axis (a stale habit is dropped); it never throws.
 */
export function resolveTactics(picks: TacticPicks, classId?: string): ResolvedTactics {
  const base = defaultPicks(classId);
  const def = (axis: Parameters<typeof option>[0], id: string, fallback: string) => option(axis, id, fallback) as TacticDef;
  return {
    stance: def('stance', picks.stance, base.stance),
    formation: def('formation', picks.formation, base.formation),
    role: def('role', picks.role, base.role),
    range: def('range', picks.range, base.range),
    focus: def('focus', picks.focus, base.focus),
    habits: picks.habits.flatMap((h) => option('habit', h, undefined) ?? []),
  };
}

/**
 * The tactics `ctx.actor` plays: `ctx.tactics` when the engine set it, else the actor's own picks
 * resolved, else (a hand-built actor with no picks) the neutral defaults.
 */
export function tacticsOf(ctx: AiCtx): ResolvedTactics {
  if (ctx.tactics !== undefined) return ctx.tactics;
  const classId = ctx.actor.adventurer?.classId;
  return resolveTactics(ctx.actor.ai.tactics ?? defaultPicks(classId), classId);
}
/** The focus preference in force for `ctx.actor`: whom it strikes first among adjacent enemies. */
export function focusPreference(ctx: AiCtx): FocusPreference {
  // Monsters and hand-built actors have no picks: the baseline's own choice, without resolving anything.
  const picks = ctx.actor.ai.tactics;
  const focus = ctx.tactics?.focus ?? (picks === undefined ? undefined : resolveTactics(picks, ctx.actor.adventurer?.classId).focus);
  const prefer = focus?.params?.prefer;
  return FOCUS_PREFERENCES.find((p) => p === prefer) ?? 'weakest';
}

/**
 * The distance in tiles `ctx.actor` prefers to engage an enemy from (ETH-193): its range option's
 * `engage` (1 is toe to toe, the default). Monsters and hand-built actors have no picks and engage
 * at 1, without resolving anything.
 */
export function engageDistance(ctx: AiCtx): number {
  const picks = ctx.actor.ai.tactics;
  const range = ctx.tactics?.range ?? (picks === undefined ? undefined : TACTICS.get(picks.range));
  const engage = range?.params?.engage;
  return typeof engage === 'number' ? engage : 1;
}

/** The default picks of a class (neutral when `classId` is unknown or not given), with the party defaults. */
export function defaultPicks(classId: string | undefined): TacticPicks {
  const build = classId !== undefined && CLASSES.has(classId) ? classTactics(CLASSES.get(classId)) : classTactics({});
  return { stance: DEFAULT_STANCE, formation: DEFAULT_FORMATION, ...clonePlain(build) };
}

/**
 * The picks a new adventurer of `classId` starts with: the class's default build, with `own`
 * (a roster record's stored picks) over it and the party's `party` stance and formation.
 */
export function startingPicks(
  classId: string,
  party: { readonly stance?: string; readonly formation?: string } = {},
  own: Partial<AdventurerPicks> = {},
): TacticPicks {
  const base = defaultPicks(classId);
  return {
    stance: party.stance ?? base.stance,
    formation: party.formation ?? base.formation,
    role: own.role ?? base.role,
    range: own.range ?? base.range,
    focus: own.focus ?? base.focus,
    habits: [...(own.habits ?? base.habits)],
  };
}

/** Why `picks` can't be played, as problem lines: the adventurer's own picks, and the party's two axes. */
export function tacticPickProblems(picks: TacticPicks): string[] {
  const problems = picksProblems(picks);
  for (const axis of ['stance', 'formation'] as const) {
    const id = picks[axis];
    if (!TACTICS.has(id)) problems.push(`unknown ${axis} tactic "${id}"`);
    else if (TACTICS.get(id).axis !== axis) problems.push(`"${id}" is a ${TACTICS.get(id).axis} tactic, not a ${axis} tactic`);
  }
  return problems;
}

/**
 * The player rule list `picks` build, in order: the stance's rows, each habit's rows in pick order,
 * then the role's rows. Pure. Each row carries the id of the option it came from.
 */
export function buildTacticRules(picks: TacticPicks, classId?: string): Rule[] {
  const resolved = resolveTactics(picks, classId);
  const rules: Rule[] = [];
  for (const def of [resolved.stance, ...resolved.habits, resolved.role]) {
    for (const row of def.rows ?? []) {
      rules.push({
        condition: clonePlain(row.condition),
        action: clonePlain(row.action),
        enabled: true,
        option: def.id,
      });
    }
  }
  return rules;
}

/**
 * Makes `picks` the tactics of `ai`: stores them and rebuilds its rules. The memory that points
 * into the old rule list (a dropped goal, the stuck count) is forgotten, so a swap never reads as
 * being stuck. The change shows at the adventurer's next decision.
 */
export function applyTactics(ai: AiPart, picks: TacticPicks): void {
  ai.tactics = { ...picks, habits: [...picks.habits] };
  ai.rules = buildTacticRules(picks);
  ai.memory.dropped = null;
  ai.memory.still = 0;
  ai.memory.waited = 0;
}

/** An option's name for the trace and the log, or its id if it is not a registered option. */
export function optionName(id: string): string {
  return TACTICS.has(id) ? TACTICS.get(id).name : id;
}

/**
 * An adventurer's tactics are playable picks, and the rules built from them are the rules in its
 * AI part (ETH-162): the rows tagged with an option are exactly `buildTacticRules(picks)`, so a
 * swap can never leave the old option's rows behind.
 */
registerInvariant('core.tactics', (state) => {
  const problems: string[] = [];
  for (const entity of Object.values(state.entities)) {
    const picks = entity.ai?.tactics;
    if (entity.ai === undefined || picks === undefined) continue;
    const bad = tacticPickProblems(picks);
    if (bad.length > 0) {
      problems.push(`actor ${entity.id} has unplayable tactics: ${bad.join('; ')}`);
      continue;
    }
    const built = JSON.stringify(buildTacticRules(picks));
    const held = JSON.stringify(entity.ai.rules.filter((r) => r.option !== undefined));
    if (built !== held) problems.push(`actor ${entity.id}'s rules do not match its tactics`);
  }
  return problems;
});
