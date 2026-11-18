/** Codex view of adventurer classes: their starting attributes (ETH-033). */
import { ATTRIBUTE_IDS, attributeDef, CLASSES } from '../../../content';
import { attributeHint, attributeLine } from '../attributeText';
import { defineCodexRenderer } from '../types';

export default defineCodexRenderer({
  registry: CLASSES,
  label: 'Classes',
  order: 10,
  hint: 'Take one into the dungeon to learn about it.',
  fields: (def) => [
    { label: 'Attributes', value: attributeLine(def.attributes), hint: 'Starting attributes, before the race adjusts them.', key: true },
    ...ATTRIBUTE_IDS.map((a) => ({ label: attributeDef(a).name, value: def.attributes[a], hint: attributeHint(a) })),
  ],
});
