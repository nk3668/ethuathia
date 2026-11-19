/**
 * The decision engine and the baseline AI (docs/ARCHITECTURE.md §4).
 */
export { COND_ALWAYS, COND_STUCK, CORE_CONDITIONS } from './conditions';
export { BASELINE_RULES, chooseRule, DROP_TURNS, ruleDecide, STUCK_TURNS, WAIT_STUCK_TURNS } from './engine';
export type { Choice } from './engine';
export { aiPathGrid, followMap, frontier, OCCUPIED_COST, willingToSwap } from './navigate';
export { ACT_BACK_OFF, ACT_EXPLORE, ACT_WAIT, CORE_RULE_ACTIONS } from './ruleActions';
export { defineCondition, defineRuleAction, newAiPart, noParams } from './types';
export type {
  AiActor,
  AiCtx,
  AiMemory,
  AiPart,
  ConditionDef,
  ConditionResult,
  DroppedGoal,
  Intent,
  ParamParser,
  ProgressMark,
  Resolved,
  Rule,
  RuleActionDef,
  RulePart,
  RuleRef,
} from './types';
