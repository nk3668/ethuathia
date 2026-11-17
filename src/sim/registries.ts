/**
 * The sim's code registries: rule conditions, rule actions and generation steps. They are
 * created empty here and filled by `domains.ts` from the core lists and every domain's lists,
 * in domain order, so registration order never depends on which module happened to load first.
 *
 * This is a leaf module (it imports no values from the sim), so code that looks things up at
 * run time, such as a condition naming a rule action, can import it without an import cycle.
 * Look-ups happen at run time only: never read a registry while modules are still loading.
 */
import { Registry } from '../core';
import type { ConditionDef, RuleActionDef } from './ai/types';
import type { GenStepDef } from './gen/types';

/** Every rule condition, by id (`cond.*`). The rules editor is generated from it (M3). */
export const CONDITIONS = new Registry<ConditionDef>('rule condition');

/** Every rule action, by id (`act.*`). */
export const RULE_ACTIONS = new Registry<RuleActionDef>('rule action');

/** Every generation step, by id (`gen.rooms`, `gen.corridors`, …). Floor types name them. */
export const GEN_STEPS = new Registry<GenStepDef>('generation step');
