/** Upgrade nodes: the Town tab shows them, so the Codex leaves them out. `Explain` still names them. */
import { UPGRADES } from '../../../content';
import { defineCodexRenderer } from '../types';

export default defineCodexRenderer({
  registry: UPGRADES,
  label: 'Upgrades',
  order: 200,
  hidden: true,
});
