/**
 * The adventurer records' read and mutation API (ETH-119). The records live in the profile's
 * `adventurers` slice (`slices/adventurers.ts`); every change goes through the pure helpers
 * here (or `applyRunResult`), which return a new slice and never edit one in place. Reads take
 * the `Profile`, mutations the `Adventurers` slice.
 */
import type { Profile } from './profile';
import type { AdventurerId, AdventurerOrigin, AdventurerRecord, Adventurers } from './slices/adventurers';

/** Cap on active roster adventurers (docs/ARCHITECTURE.md §6.1, ETH-132). */
export const ROSTER_SIZE = 50;

/** A valid record id: `adv.<n>`. */
export const ADVENTURER_ID_PATTERN = /^adv\.[1-9][0-9]*$/;

/** The id `adv.<n>` for the issue number `n`. */
export function adventurerId(n: number): AdventurerId {
  return `adv.${n}`;
}

/** The issue number of an id (`adv.7` is 7), or 0 for a string that is not an id. */
export function idNumber(id: string): number {
  return ADVENTURER_ID_PATTERN.test(id) ? Number(id.slice(4)) : 0;
}

/** What `newRecord` needs: who they are and the run they are recruited for. */
export interface NewRecordInit {
  readonly name: string;
  readonly classId: string;
  readonly raceId: string;
  /** The run number they are recruited for (`history.totals.runs + 1`). */
  readonly born: number;
  readonly traits?: readonly string[];
  readonly origin?: AdventurerOrigin;
}

/** The record for `id`, if the profile has one. */
export function recordOf(profile: Profile, id: AdventurerId): AdventurerRecord | undefined {
  return Object.hasOwn(profile.adventurers.records, id) ? profile.adventurers.records[id] : undefined;
}

function withStatus(profile: Profile, status: AdventurerRecord['status']): AdventurerRecord[] {
  return Object.values(profile.adventurers.records).filter((r) => r.status === status);
}

/** Active adventurers, in creation order (by id). */
export function activeRecords(profile: Profile): AdventurerRecord[] {
  return withStatus(profile, 'active').sort((a, b) => idNumber(a.id) - idNumber(b.id));
}

/** Retired adventurers, in creation order. */
export function retiredRecords(profile: Profile): AdventurerRecord[] {
  return withStatus(profile, 'retired').sort((a, b) => idNumber(a.id) - idNumber(b.id));
}

/** Fallen adventurers, newest death first (later run, then later id). */
export function fallenRecords(profile: Profile): AdventurerRecord[] {
  return withStatus(profile, 'fallen').sort(
    (a, b) => (b.death?.run ?? 0) - (a.death?.run ?? 0) || idNumber(b.id) - idNumber(a.id),
  );
}

/**
 * Issues the next id and adds an active record with an empty history and peak level 1. Returns
 * the new slice and the record.
 */
export function newRecord(slice: Adventurers, init: NewRecordInit): { slice: Adventurers; record: AdventurerRecord } {
  const record: AdventurerRecord = {
    id: adventurerId(slice.nextId),
    name: init.name,
    classId: init.classId,
    raceId: init.raceId,
    peakLevel: 1,
    traits: [...(init.traits ?? [])],
    status: 'active',
    born: init.born,
    history: { runs: 0, victories: 0, deepest: 0, kills: 0, turns: 0 },
    ...(init.origin === undefined ? {} : { origin: { ...init.origin } }),
  };
  return { slice: { nextId: slice.nextId + 1, records: { ...slice.records, [record.id]: record } }, record };
}

function existing(slice: Adventurers, id: AdventurerId): AdventurerRecord {
  const record = Object.hasOwn(slice.records, id) ? slice.records[id] : undefined;
  if (record === undefined) throw new RangeError(`No adventurer record "${id}"`);
  return record;
}

/** Adds a trait to a record. Does nothing if it already has it. Throws on an unknown id. */
export function addTrait(slice: Adventurers, id: AdventurerId, trait: string): Adventurers {
  const record = existing(slice, id);
  if (record.traits.includes(trait)) return slice;
  return { ...slice, records: { ...slice.records, [id]: { ...record, traits: [...record.traits, trait] } } };
}

/**
 * Moves a living adventurer between `active` and `retired`. The fallen can't be changed:
 * `fallen` is set only by a run's death. Throws on an unknown id or a fallen record.
 */
export function setStatus(slice: Adventurers, id: AdventurerId, status: 'active' | 'retired'): Adventurers {
  const record = existing(slice, id);
  if (record.status === 'fallen') throw new RangeError(`Adventurer "${id}" has fallen and can't be made ${status}`);
  if (record.status === status) return slice;
  return { ...slice, records: { ...slice.records, [id]: { ...record, status } } };
}
