/**
 * Wording for Class Mastery (ETH-087): the run summary's line and its breakdown, and the help
 * text the Guild Hall and the Codex share. Pure, so it can be tested on its own.
 */
import { formatNumber } from '../../core';
import {
  MASTERY_BONUS_PER_DEPTH,
  MASTERY_BONUS_PER_OBJECTIVE,
  MASTERY_COMPANION_SHARE,
  MASTERY_SHARES,
} from '../../meta';
import type { ClassMasteryGain } from '../../meta';
import { contentName } from './text';

const percent = (share: number) => `${Math.round(share * 100)}%`;

/** What Class Mastery is, in one paragraph, for tooltips and the Codex. */
export const MASTERY_HELP =
  'Each class has one guild-wide Mastery level, and every run adds XP to it for each class in the party: ' +
  `the XP its adventurers earned, the fallen included (the highest earner counts ${MASTERY_SHARES.map(percent).join(' / ')} ` +
  `for each further adventurer of the class, a temporary companion ${percent(MASTERY_COMPANION_SHARE)}), plus a run-end bonus ` +
  `of ${MASTERY_BONUS_PER_DEPTH} XP per floor reached and ${MASTERY_BONUS_PER_OBJECTIVE} per contract or bounty completed. ` +
  'A wipe does not reduce it. Each level is one talent point; points are banked now and spent on class talent trees from a later update. ' +
  'Adventurer levels reset every run, but Mastery does not.';

/** "Vanguard Mastery +1,240 XP · level 3 → 5" (or "level 3" when the level didn't change). */
export function masteryLine(gain: ClassMasteryGain): string {
  const level = gain.levelBefore === gain.levelAfter ? `level ${gain.levelAfter}` : `level ${gain.levelBefore} → ${gain.levelAfter}`;
  return `${contentName(gain.classId)} Mastery +${formatNumber(gain.xp)} XP · ${level}`;
}

/** The breakdown behind a line, one string per part: each member's XP × share, then the bonus terms. */
export function masteryBreakdown(gain: ClassMasteryGain): string[] {
  const members = gain.members.map(
    (m) =>
      `${m.name}${m.companion ? ' (companion)' : ''}: ${formatNumber(m.xp)} XP × ${percent(m.share)} = ${formatNumber(m.gained)}`,
  );
  const { bonus } = gain;
  return [
    ...members,
    `Floors reached: ${bonus.depth} × ${MASTERY_BONUS_PER_DEPTH} = ${formatNumber(bonus.depthXp)}`,
    `Contracts and bounties completed: ${bonus.objectives} × ${MASTERY_BONUS_PER_OBJECTIVE} = ${formatNumber(bonus.objectiveXp)}`,
  ];
}
