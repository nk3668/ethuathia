/** Codex view of items. The items work (ETH-061) adds their fields and a `group` by category. */
import { ITEMS } from '../../../content';
import { defineCodexRenderer } from '../types';

export default defineCodexRenderer({
  registry: ITEMS,
  label: 'Items',
  order: 40,
  hint: 'Find or use one in the dungeon.',
});
