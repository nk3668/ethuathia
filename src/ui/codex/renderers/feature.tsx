/** Codex view of dungeon features: doors, stairs and, later, altars, graves and fountains. */
import { FEATURES } from '../../../content';
import { defineCodexRenderer } from '../types';

export default defineCodexRenderer({
  registry: FEATURES,
  label: 'Dungeon features',
  order: 80,
  hint: 'Come across one in the dungeon.',
});
