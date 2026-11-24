/**
 * `track.cursedGear` (ETH-142): how many game turns at least one living party member wore cursed
 * gear this run, for the run summary ("Cursed gear was worn for N turns"). It watches the state
 * rather than events, so it is sampled at the end of each step: the turns since the last sample
 * count when someone wore cursed gear at the end of the step.
 */
import { EQUIP_SLOT_INFO } from '../../content';
import type { EquipSlot } from '../../content';
import type { RunTracker } from '../domain';
import type { Entity, RunState } from '../state';
import { isCursed } from './enchant';
import { wornItems } from './equipment';

export const CURSED_GEAR_TRACKER_ID = 'track.cursedGear';

/** The tracker's state: turns spent wearing cursed gear, and the turn it was last sampled. */
export interface CursedGearState {
  turns: number;
  last: number;
}

/** True while any living party member wears cursed gear. */
export function partyWearsCursed(state: RunState): boolean {
  return state.party.some((id) => {
    const e = state.entities[id];
    return e?.actor !== undefined && e.actor.hp > 0 && wornItems(e).some(({ item }) => isCursed(item));
  });
}

export const CURSED_GEAR_TRACKER: RunTracker<CursedGearState> = {
  id: CURSED_GEAR_TRACKER_ID,
  init: () => ({ turns: 0, last: 0 }),
  reduce: (s) => s,
  afterStep(s, run) {
    const turns = partyWearsCursed(run) ? s.turns + Math.max(0, run.turn - s.last) : s.turns;
    return turns === s.turns && run.turn === s.last ? s : { turns, last: run.turn };
  },
};

/** The turns the run's result says cursed gear was worn, or 0 if it doesn't say (a result from before ETH-142). */
export function cursedGearTurns(extras: Readonly<Record<string, unknown>>): number {
  const value = extras[CURSED_GEAR_TRACKER_ID];
  const turns = typeof value === 'object' && value !== null ? (value as { turns?: unknown }).turns : undefined;
  return typeof turns === 'number' && Number.isFinite(turns) ? turns : 0;
}

/** Why `item` in `slot` can't be taken off or replaced: shown on the party card. `undefined` if it isn't locked. */
export function lockedReason(entity: Entity, slot: EquipSlot): string | undefined {
  const item = wornItems(entity).find((w) => w.slot === slot)?.item;
  if (!isCursed(item)) return undefined;
  return `The ${EQUIP_SLOT_INFO[slot].label.toLowerCase()} slot is locked: cursed gear can't be taken off or replaced until a Scroll of Uncursing frees it.`;
}
