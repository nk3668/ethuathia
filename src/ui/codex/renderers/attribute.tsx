/** Codex view of the four attributes (ETH-033) and their second jobs (ETH-081). Every adventurer has them, so they are always known. */
import { ATTRIBUTES } from '../../../content';
import { attributeEffectText, attributeSkillDetails, attributeSkillText } from '../attributeText';
import { defineCodexRenderer } from '../types';

export default defineCodexRenderer({
  registry: ATTRIBUTES,
  label: 'Attributes',
  order: 5,
  alwaysKnown: true,
  fields: (def) => [
    { label: 'Short', value: def.abbr, hint: 'How party cards abbreviate it.' },
    { label: 'Raises', value: attributeEffectText(def.key), hint: 'The stats it derives, per point of the attribute.', key: true },
    { label: 'Second job', value: attributeSkillText(def.key), hint: attributeSkillDetails(def.key) },
  ],
});
