/** Codex view of adventurer classes. */
import { CLASSES } from '../../../content';
import { defineCodexRenderer } from '../types';

export default defineCodexRenderer({
  registry: CLASSES,
  label: 'Classes',
  order: 10,
  hint: 'Take one into the dungeon to learn about it.',
  fields: (def) => [
    { label: 'HP', value: def.hp, hint: 'Starting maximum HP, before the race bonus.', key: true },
    { label: 'MP', value: def.mp, hint: 'Starting maximum MP, before the race bonus.', key: true },
  ],
});
