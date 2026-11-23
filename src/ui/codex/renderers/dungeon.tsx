/** Codex view of dungeon variants (ETH-064): depth and floor type. Always known: the Prepare screen lists them. */
import { DUNGEONS, findDef } from '../../../content';
import { defineCodexRenderer } from '../types';

export default defineCodexRenderer({
  registry: DUNGEONS,
  label: 'Dungeons',
  order: 65,
  alwaysKnown: true,
  fields: (def) => [
    {
      label: 'Depth',
      value: def.depth.min === def.depth.max ? `${def.depth.min} ${def.depth.min === 1 ? 'floor' : 'floors'}` : `${def.depth.min}–${def.depth.max} floors`,
      hint: 'How many floors down the bottom lies.',
      key: true,
    },
    {
      label: 'Danger',
      value: def.danger.perFloor === 0 ? String(def.danger.start) : `${def.danger.start} (+${def.danger.perFloor}/floor)`,
      hint: 'Starting Danger rating and how fast threats escalate per floor.',
      key: true,
    },
    { label: 'Floors', value: findDef(def.floorType)?.name ?? def.floorType, hint: 'The kind of floor it is built from.', key: true },
  ],
});
