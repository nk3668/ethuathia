/**
 * Start-up validation of everything the game is built from (docs/ARCHITECTURE.md §2.1, §5):
 * the content registries, plus the checks only the sim can make because they involve its code
 * registries. The app runs `validateGame` before it starts, and `tools/validate-content` runs
 * `checkGame` as part of `npm test`.
 */
import { checkContent, ContentError, crateTableProblems, FEATURES, FLOOR_TYPES, NEUTRAL_CLOSE, NEUTRAL_LEASH, TACTICS, TERRAIN } from '../content';
import type { FloorTypeDef } from '../content';
import { BASELINE_RULES } from './ai/engine';
import { CONDITION_TARGET } from './ai/requirements';
import { PARTY_CLOSE, PARTY_LEASH } from './floors/rules';
import { checkFloorType } from './gen';
import { CONDITIONS, GEN_STEPS, RULE_ACTIONS, TRIGGERS } from './registries';
import { STAT_REFS } from './stats';
import { DEFS, TERRAIN_IDS } from './state';

/**
 * Every problem found, as lines naming the def or table at fault; empty when all is well:
 *
 * - content shapes and cross-references (`checkContent`), with floor types' steps looked up in
 *   `GEN_STEPS`, stat ids in `STAT_REFS`, unlocked conditions and rule actions in theirs, and bundle
 *   trigger kinds in `TRIGGERS`; requirements' conditions also have their params and scope
 *   checked (`CONDITION_TARGET`, ETH-121);
 * - each floor type's step parameters, when all its steps exist;
 * - the content ids the sim names in code: `TERRAIN_IDS` and the feature ids in `DEFS`;
 * - the conditions and rule actions the baseline rules name, and the params of every tactic option's rows.
 */
export function checkGame(): string[] {
  const problems = checkContent([GEN_STEPS, STAT_REFS, CONDITION_TARGET, RULE_ACTIONS, TRIGGERS]);
  problems.push(...checkFloorParams(FLOOR_TYPES.all()));
  problems.push(...crateTableProblems());

  TERRAIN_IDS.forEach((id, code) => {
    if (!TERRAIN.has(id)) problems.push(`sim TERRAIN_IDS[${code}]: unknown terrain "${id}"`);
  });
  for (const key of ['door', 'stairsUp', 'stairsDown'] as const) {
    if (!FEATURES.has(DEFS[key])) problems.push(`sim DEFS.${key}: unknown feature "${DEFS[key]}"`);
  }

  BASELINE_RULES.forEach((rule, i) => {
    if (!CONDITIONS.has(rule.condition.id)) {
      problems.push(`baseline rule #${i + 1}: unknown condition "${rule.condition.id}"`);
    }
    if (!RULE_ACTIONS.has(rule.action.id)) {
      problems.push(`baseline rule #${i + 1}: unknown rule action "${rule.action.id}"`);
    }
  });
  if (NEUTRAL_LEASH !== PARTY_LEASH || NEUTRAL_CLOSE !== PARTY_CLOSE) problems.push('content NEUTRAL_LEASH and NEUTRAL_CLOSE differ from the sim PARTY_LEASH and PARTY_CLOSE');
  // Tactic rows (ETH-162): each row's condition and rule action must accept the row's params.
  for (const def of TACTICS.all()) {
    (def.rows ?? []).forEach((row, i) => {
      const at = `tactic "${def.id}" rows[${i}]`;
      if (CONDITIONS.has(row.condition.id)) {
        const why = CONDITIONS.get(row.condition.id).check(row.condition.params);
        if (why !== null) problems.push(`${at}: condition "${row.condition.id}": ${why}`);
      }
      if (RULE_ACTIONS.has(row.action.id)) {
        const why = RULE_ACTIONS.get(row.action.id).check(row.action.params);
        if (why !== null) problems.push(`${at}: rule action "${row.action.id}": ${why}`);
      }
    });
  }
  return problems;
}

/**
 * Whether each floor type's steps accept their parameters, as problems naming the floor type and
 * step. Floor types naming a step that doesn't exist are skipped: `checkContent` reports those.
 */
export function checkFloorParams(types: readonly FloorTypeDef[]): string[] {
  const problems: string[] = [];
  for (const type of types) {
    if (!type.steps.every((s) => GEN_STEPS.has(s.step))) continue;
    try {
      checkFloorType(type);
    } catch (err) {
      problems.push((err as Error).message);
    }
  }
  return problems;
}

/** Throws a `ContentError` listing every problem `checkGame` finds. */
export function validateGame(): void {
  const problems = checkGame();
  if (problems.length > 0) throw new ContentError(problems);
}
