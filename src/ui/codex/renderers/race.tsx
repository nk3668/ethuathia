/** Codex view of adventurer races. */
import { RACES } from '../../../content';
import { defineCodexRenderer } from '../types';

export default defineCodexRenderer({
  registry: RACES,
  label: 'Races',
  order: 20,
  hint: 'Take one into the dungeon to learn about it.',
  fields: (def) => [
    { label: 'HP bonus', value: `+${def.hpBonus}`, hint: "Added to the class's starting maximum HP.", key: true },
    { label: 'MP bonus', value: `+${def.mpBonus}`, hint: "Added to the class's starting maximum MP." },
    { label: 'Speed', value: def.speed, hint: 'Energy gained each tick; 100 acts once a turn.', key: true },
  ],
});
