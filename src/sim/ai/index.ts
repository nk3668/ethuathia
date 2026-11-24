/**
 * The decision engine and the baseline AI (docs/ARCHITECTURE.md §4).
 */
export { COND_ALWAYS, COND_STUCK, CORE_CONDITIONS } from './conditions';
export { BASELINE_RULES, chooseRule, DROP_TURNS, ruleDecide, STUCK_TURNS, WAIT_STUCK_TURNS } from './engine';
export type { Choice } from './engine';
export {
  awaitsPlayer,
  compassName,
  describePlayerAction,
  isPossessed,
  PLAYER_RULE,
  POSSESSION_COMMANDS,
  possessedMember,
  tracePlayerAction,
} from './possession';
export type { PossessCommand, PossessionCommand, ReleaseCommand } from './possession';
export { aiPathGrid, ALLY_OCCUPIED_COST, followMap, frontier, OCCUPIED_COST, willingToSwap } from './navigate';
export { ACT_BACK_OFF, ACT_EXPLORE, ACT_WAIT, CORE_RULE_ACTIONS } from './ruleActions';
export {
  checkRequirement,
  CONDITION_TARGET,
  describeCondition,
  describeRequirement,
  requirementProblems,
  requirementScope,
} from './requirements';
export { defineCondition, defineRuleAction, hasActor, newAiPart, noParams } from './types';
export type {
  AiActor,
  AiCtx,
  AiMemory,
  ThreatMark,
  AiPart,
  ConditionDef,
  ConditionResult,
  ConditionScope,
  DroppedGoal,
  Intent,
  ParamParser,
  ProgressMark,
  Resolved,
  ResolveResult,
  Rule,
  RuleActionDef,
  RulePart,
  RuleRef,
  RuleSkipped,
  RunCtx,
} from './types';
