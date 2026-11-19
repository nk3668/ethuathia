/** Codex view of adventurer classes: their starting attributes (ETH-033) and growth per level (ETH-034). */
import { ATTRIBUTE_IDS, attributeDef, CLASSES } from '../../../content';
import { MAX_LEVEL, XP_PER_DEPTH, XP_PER_THREAT } from '../../../sim';
import { attributeHint, attributeLine } from '../attributeText';
import { defineCodexRenderer } from '../types';

/** How leveling works, for the growth field's tooltip. */
const GROWTH_HINT =
  `Attribute points gained each level; a fraction adds a point every few levels. Adventurers earn XP from kills ` +
  `(${XP_PER_THREAT} per point of the foe's threat, to whoever strikes the blow) and from depth (${XP_PER_DEPTH} per ` +
  `floor of depth, to every living member, the first time the party gets that deep), up to level ${MAX_LEVEL}.`;

export default defineCodexRenderer({
  registry: CLASSES,
  label: 'Classes',
  order: 10,
  hint: 'Take one into the dungeon to learn about it.',
  fields: (def) => [
    { label: 'Attributes', value: attributeLine(def.attributes), hint: 'Starting attributes, before the race adjusts them.', key: true },
    { label: 'Growth per level', value: attributeLine(def.growth, true), hint: GROWTH_HINT, key: true },
    ...ATTRIBUTE_IDS.map((a) => ({ label: attributeDef(a).name, value: def.attributes[a], hint: attributeHint(a) })),
  ],
});
