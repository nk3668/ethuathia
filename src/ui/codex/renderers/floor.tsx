/** Codex view of floor types. */
import { FLOOR_TYPES } from '../../../content';
import { defineCodexRenderer } from '../types';

export default defineCodexRenderer({
  registry: FLOOR_TYPES,
  label: 'Floors',
  order: 70,
  hint: 'Walk one to learn about it.',
  fields: (def) => [{ label: 'Size', value: `${def.size.w} × ${def.size.h}`, hint: 'Width and height in tiles.', key: true }],
});
