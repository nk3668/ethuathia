/** Codex view of Omens. */
import { OMENS } from '../../../content';
import { defineCodexRenderer } from '../types';

export default defineCodexRenderer({
  registry: OMENS,
  label: 'Omens',
  order: 50,
  hint: 'Unlock it to read about it.',
});
