/** Codex view of adventurer races: attribute adjustments (ETH-033) and speed. */
import { RACES } from '../../../content';
import { attributeLine } from '../attributeText';
import { defineCodexRenderer } from '../types';

export default defineCodexRenderer({
  registry: RACES,
  label: 'Races',
  order: 20,
  hint: 'Take one into the dungeon to learn about it.',
  fields: (def) => [
    { label: 'Attributes', value: attributeLine(def.attributes, true), hint: "Added to the class's starting attributes.", key: true },
    { label: 'Speed', value: def.speed, hint: 'Energy gained each tick; 100 acts once a turn.', key: true },
  ],
});
