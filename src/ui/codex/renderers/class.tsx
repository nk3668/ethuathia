/** Codex view of adventurer classes: their starting attributes (ETH-033) and level-up rolls (ETH-034, ETH-110). */
import { ATTRIBUTE_IDS, attributeDef, CLASSES } from '../../../content';
import { attributeHint, attributeLine, growthLine, xpSourcesText } from '../attributeText';
import { MASTERY_HELP } from '../../shell/masteryText';
import { defineCodexRenderer } from '../types';

/** How leveling works, for the growth field's tooltip. */
const GROWTH_HINT =
  'Points each attribute may gain at every level-up, rolled once per level: a range, and a percentage when the ' +
  `gain is only a chance. ${xpSourcesText()}`;

export default defineCodexRenderer({
  registry: CLASSES,
  label: 'Classes',
  order: 10,
  hint: 'Take one into the dungeon to learn about it.',
  fields: (def) => [
    { label: 'Attributes', value: attributeLine(def.attributes), hint: 'Starting attributes, before the race adjusts them.', key: true },
    { label: 'Growth per level', value: growthLine(def.growth), hint: GROWTH_HINT, key: true },
    {
      label: 'Class Mastery',
      value: 'Guild-wide level; every run adds XP',
      hint: MASTERY_HELP,
    },
    ...ATTRIBUTE_IDS.map((a) => ({ label: attributeDef(a).name, value: def.attributes[a], hint: attributeHint(a) })),
  ],
});
