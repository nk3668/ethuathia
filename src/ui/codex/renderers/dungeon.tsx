/** Codex view of dungeon variants (ETH-064): depth and floor type. Always known: the Prepare screen lists them. */
import { DUNGEONS, findDef } from '../../../content';
import { defineCodexRenderer } from '../types';

export default defineCodexRenderer({
  registry: DUNGEONS,
  label: 'Dungeons',
  order: 65,
  alwaysKnown: true,
  fields: (def) => [
    { label: 'Depth', value: `${def.depth} floors`, hint: 'How many floors down the bottom is.', key: true },
    { label: 'Floors', value: findDef(def.floorType)?.name ?? def.floorType, hint: 'The kind of floor it is built from.', key: true },
  ],
});
