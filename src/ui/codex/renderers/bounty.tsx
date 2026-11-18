/** Codex view of bounties (side quests). */
import { BOUNTIES } from '../../../content';
import { defineCodexRenderer } from '../types';

export default defineCodexRenderer({
  registry: BOUNTIES,
  label: 'Bounties',
  order: 110,
  hint: 'Take it on to learn about it.',
});
