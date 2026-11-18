/** Codex view of monsters. ETH-060 adds their fields (HP, attacks) and a `group` by family. */
import { MONSTERS } from '../../../content';
import { defineCodexRenderer } from '../types';

export default defineCodexRenderer({
  registry: MONSTERS,
  label: 'Monsters',
  order: 30,
  hint: 'See or slay one in the dungeon.',
});
