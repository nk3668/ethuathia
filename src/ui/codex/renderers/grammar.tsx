/** Grammar tables: internal templates for generated text, hidden from the player's Codex tab. */
import { GRAMMARS } from '../../../content';
import { defineCodexRenderer } from '../types';

export default defineCodexRenderer({
  registry: GRAMMARS,
  label: 'Grammars',
  order: 220,
  hidden: true,
});
