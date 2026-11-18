/** Town buildings: the Town tab shows them, so the Codex leaves them out. `Explain` still names them. */
import { BUILDINGS } from '../../../content';
import { defineCodexRenderer } from '../types';

export default defineCodexRenderer({
  registry: BUILDINGS,
  label: 'Buildings',
  order: 210,
  hidden: true,
});
