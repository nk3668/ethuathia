/** Codex view of party doctrines. */
import { DOCTRINES } from '../../../content';
import { defineCodexRenderer } from '../types';

export default defineCodexRenderer({
  registry: DOCTRINES,
  label: 'Doctrines',
  order: 65,
  hint: 'Unlock it in the Guild Hall to read about it.',
});
