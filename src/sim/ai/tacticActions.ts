/**
 * The rule actions tactic options are built from (ETH-162). They are ordinary `RuleActionDef`s:
 * a tactic's rows name them by id, and they take ability tags, never a class, a spell or an item.
 */
import { ABILITY_TAG_INFO, isAbilityTag } from '../../content';
import type { AbilityTag } from '../../content';
import { bestByTag } from './abilities';
import { defineRuleAction } from './types';
import type { ParamParser, RuleActionDef } from './types';

interface TagParams {
  tag: AbilityTag;
}

const parseTag: ParamParser<TagParams> = (raw) => {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return 'Params must be an object with "tag"';
  const { tag, ...rest } = raw as Record<string, unknown>;
  if (Object.keys(rest).length > 0) return `Unknown parameter "${Object.keys(rest)[0] as string}"`;
  if (!isAbilityTag(tag)) return '"tag" must be an ability tag';
  return { tag };
};

/**
 * Use the best source of an ability tag the adventurer has (`bestByTag`): for `heal`, the potion
 * that best covers the missing HP. With nothing of the tag it can't be done, and it says so in the
 * trace ("no healing to use, carrying on as normal"), so the tactic that asked falls back to the
 * baseline's general behavior and the player can see why.
 */
export const ACT_USE_ABILITY = defineRuleAction({
  id: 'act.use_ability',
  name: 'Use an ability',
  description:
    'Use the best thing the adventurer carries that has an ability tag, such as a healing potion for “heal”. ' +
    'Can’t be done without one: the log then says so and the adventurer carries on as normal.',
  parse: parseTag,
  resolve(ctx, { tag }) {
    const best = bestByTag(ctx, tag);
    if (best === null) return { skipped: `no ${ABILITY_TAG_INFO[tag].label.toLowerCase()} to use, carrying on as normal` };
    return { request: { id: 'use', index: best.index }, detail: `using ${best.reason}` };
  },
  describe: ({ tag }) => `use the best ${ABILITY_TAG_INFO[tag].label.toLowerCase()} it has`,
});

/** The tactic rule actions, registered after the core ones (`domains.ts`). */
export const TACTIC_RULE_ACTIONS: readonly RuleActionDef[] = [ACT_USE_ABILITY];
