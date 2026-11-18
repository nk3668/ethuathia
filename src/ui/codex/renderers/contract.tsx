/** Codex view of contracts (main quests). */
import { CONTRACTS } from '../../../content';
import { defineCodexRenderer } from '../types';

export default defineCodexRenderer({
  registry: CONTRACTS,
  label: 'Contracts',
  order: 100,
  hint: 'Take it on to learn about it.',
});
