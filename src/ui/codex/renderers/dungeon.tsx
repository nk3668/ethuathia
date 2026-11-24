/** Codex view of dungeon variants (ETH-064): depth and floor type. Always known: the Prepare screen lists them. */
import { DUNGEONS, findDef } from '../../../content';
import { PARTY_SIZE_BUDGET_STEP } from '../../../sim';
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
    {
      label: 'Crowding',
      value: PARTY_SIZE_BUDGET_STEP > 0 ? `+${Math.round(PARTY_SIZE_BUDGET_STEP * 100)}% monsters per extra adventurer` : 'None yet',
      hint:
        'A bigger party can face a slightly bigger monster threat budget on each floor: more monsters and packs, never stronger ones. ' +
        (PARTY_SIZE_BUDGET_STEP > 0 ? 'Every adventurer after the first adds this much.' : 'It is switched off for now while the game is balanced.'),
    },
    { label: 'Floors', value: findDef(def.floorType)?.name ?? def.floorType, hint: 'The kind of floor it is built from.', key: true },
  ],
});
