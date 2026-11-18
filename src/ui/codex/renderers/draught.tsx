/** Codex view of fountain draughts (ETH-072): what each one does and how often a fountain gives it. */
import { DRAUGHTS, draughtChance, FEATURE_FOUNTAIN } from '../../../content';
import type { DraughtDef } from '../../../content';
import { defineCodexRenderer } from '../types';
import { effectText } from './status';

const OUTCOME_LABEL: Readonly<Record<DraughtDef['outcome'], string>> = {
  boon: 'Helpful',
  bane: 'Harmful',
  plain: 'No effect',
};

export default defineCodexRenderer({
  registry: DRAUGHTS,
  label: 'Fountain draughts',
  order: 85,
  hint: 'Drink from a fountain to learn about it.',
  glyph: () => FEATURE_FOUNTAIN.glyph,
  group: (def) => OUTCOME_LABEL[def.outcome],
  fields: (def) => [
    {
      label: 'Effect',
      value: (def.bundle.effects ?? []).map(effectText).join(', ') || 'Nothing',
      hint: 'What drinking it does to the drinker.',
      key: true,
    },
    {
      label: 'Chance',
      value: `${Math.round(draughtChance(def) * 100)}%`,
      hint: 'How often a fountain draught is this one. Each fountain’s draughts are set when its floor is made.',
      key: true,
    },
  ],
});
