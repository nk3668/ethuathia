/** Codex view of deities. */
import { DEITIES } from '../../../content';
import { defineCodexRenderer } from '../types';

export default defineCodexRenderer({
  registry: DEITIES,
  label: 'Deities',
  order: 60,
  hint: 'Find their altar or take them as patron.',
});
