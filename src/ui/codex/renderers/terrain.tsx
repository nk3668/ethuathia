/** Codex view of terrain. Anyone knows walls and floors from the first step. */
import { TERRAIN } from '../../../content';
import { defineCodexRenderer } from '../types';

export default defineCodexRenderer({
  registry: TERRAIN,
  label: 'Terrain',
  order: 90,
  alwaysKnown: true,
});
