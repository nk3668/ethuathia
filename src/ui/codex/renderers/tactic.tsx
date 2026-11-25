/**
 * Codex view of tactic options (ETH-162). Hidden from the Codex tab for now: the tactics panel
 * (ETH-196) lists them with their tooltips and the Library (ETH-163) decides how a locked one is
 * discovered. `Explain` still reads these entries, so every option has its text wherever it shows.
 */
import { TACTICS } from '../../../content';
import type { TacticAxis } from '../../../content';
import { defineCodexRenderer } from '../types';

const AXIS_LABEL: Readonly<Record<TacticAxis, string>> = {
  stance: 'Stance',
  formation: 'Formation',
  role: 'Role',
  range: 'Range',
  focus: 'Focus',
  habit: 'Habit',
};

export default defineCodexRenderer({
  registry: TACTICS,
  label: 'Tactics',
  order: 66,
  hidden: true,
  group: (def) => AXIS_LABEL[(def as { axis: TacticAxis }).axis],
  fields: (def) => [
    { label: 'Kind', value: AXIS_LABEL[(def as { axis: TacticAxis }).axis], hint: 'Which choice this option is on: a party stance or formation, or one adventurer’s role, range, focus or habit.', key: true },
  ],
});
