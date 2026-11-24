/**
 * The `adventurers` slice (ETH-119): a durable record for every adventurer who has been on a
 * run, with a stable id the run carries through (`AdventurerConfig.recordId`). It is data only:
 * identity, peak level, traits, status, lifetime history and, for the fallen, the death. The
 * roster, graveyard, quirks, Mastery and lineage items read it; `src/meta/adventurers.ts` is the
 * read and mutation API, and nothing else changes records.
 *
 * Levels reset to 1 every run (CLAUDE.md §4), so a record keeps who someone is and what they
 * did, not how strong they are. `startRun` (prepare/build.ts) issues ids for new recruits;
 * `onRunResult` folds a finished run into each member's record, and issues one on the fly for a
 * member who has none, so a run started from a bare config is recorded too.
 */
import { z } from 'zod';
import { newRecord, ADVENTURER_ID_PATTERN, idNumber } from '../adventurers';
import { defineSlice } from '../slice';
import type { RunResult } from '../../sim';

/** A record's id: `adv.<n>`, issued from `Adventurers.nextId`. */
export type AdventurerId = string;

export type AdventurerStatus = 'active' | 'fallen' | 'retired';

/** Where an adventurer came from, when not a plain recruit. */
export interface AdventurerOrigin {
  readonly kind: 'recruit' | 'found' | 'kin';
  readonly note?: string;
  /** The fallen adventurer this one is kin of (`kind: 'kin'`): an issued id, which may no longer exist. */
  readonly kin?: AdventurerId;
}

/** What killed a fallen adventurer: the content id and display name from the run's `Killer`. */
export interface AdventurerKiller {
  readonly def: string;
  readonly name: string;
}

export interface AdventurerDeath {
  /** The run number they fell in. */
  readonly run: number;
  readonly depth: number;
  /** The game turn of the fall. */
  readonly turn: number;
  /** In words: "was slain by a slate hound". */
  readonly cause: string;
  readonly killer?: AdventurerKiller;
}

export interface AdventurerHistory {
  /** Runs they went on, finished ones only. */
  readonly runs: number;
  /** Runs won, counting only those they survived. */
  readonly victories: number;
  /** The deepest floor the party reached on any of their runs. */
  readonly deepest: number;
  readonly kills: number;
  /** Game turns they lived through (to their fall, if they fell). */
  readonly turns: number;
}

export interface AdventurerRecord {
  readonly id: AdventurerId;
  readonly name: string;
  readonly classId: string;
  readonly raceId: string;
  /** The highest level they reached in any run. */
  readonly peakLevel: number;
  readonly traits: readonly string[];
  readonly status: AdventurerStatus;
  /** The run number they were recruited for. */
  readonly born: number;
  readonly history: AdventurerHistory;
  /** Set exactly when `status` is `fallen`. */
  readonly death?: AdventurerDeath;
  readonly origin?: AdventurerOrigin;
}

export interface Adventurers {
  /** The number the next issued id takes: `adv.<nextId>`. Never reused. */
  readonly nextId: number;
  readonly records: Readonly<Record<AdventurerId, AdventurerRecord>>;
}

/**
 * Fallen records kept (tunable). Past it the oldest fallen are trimmed, except any another
 * record names as kin. ETH-069 adds its own "has a grave or heirloom" protection.
 */
export const FALLEN_RECORD_CAP = 200;

const MAX_TEXT = 200;
const count = z.number().int().nonnegative();
const idString = z.string().regex(ADVENTURER_ID_PATTERN);

const recordSchema = z.object({
  id: idString,
  name: z.string().min(1).max(80),
  classId: z.string().min(1).max(80),
  raceId: z.string().min(1).max(80),
  peakLevel: z.number().int().positive(),
  traits: z.array(z.string().min(1).max(80)).max(64),
  status: z.enum(['active', 'fallen', 'retired']),
  born: z.number().int().positive(),
  history: z.object({ runs: count, victories: count, deepest: count, kills: count, turns: count }),
  death: z
    .object({
      run: z.number().int().positive(),
      depth: count,
      turn: count,
      cause: z.string().max(MAX_TEXT),
      killer: z.object({ def: z.string().max(80), name: z.string().max(80) }).optional(),
    })
    .optional(),
  origin: z
    .object({
      kind: z.enum(['recruit', 'found', 'kin']),
      note: z.string().max(MAX_TEXT).optional(),
      kin: idString.optional(),
    })
    .optional(),
});

const adventurersSchema = z
  .object({ nextId: z.number().int().positive(), records: z.record(z.string(), recordSchema) })
  .superRefine((slice, ctx) => {
    const problem = (path: (string | number)[], message: string) => ctx.addIssue({ code: 'custom', path, message });
    for (const [key, record] of Object.entries(slice.records)) {
      const at = ['records', key];
      if (record.id !== key) problem(at, `is stored under "${key}" but has id "${record.id}"`);
      if (idNumber(record.id) >= slice.nextId) problem(at, `has id "${record.id}", which nextId ${slice.nextId} has not issued`);
      if ((record.status === 'fallen') !== (record.death !== undefined)) problem(at, 'must have a death exactly when it is fallen');
      if (record.history.victories > record.history.runs) problem([...at, 'history'], 'has more victories than runs');
      if (new Set(record.traits).size !== record.traits.length) problem([...at, 'traits'], 'lists a trait twice');
      const kin = record.origin?.kin;
      if (kin !== undefined && idNumber(kin) >= slice.nextId) problem([...at, 'origin', 'kin'], `names "${kin}", which was never issued`);
    }
  });

// What the update reads from `RunResult.extras`. A missing or odd value leaves its part out, as the
// history slice does: records are for showing, and a bad tracker must not lose a run's banking.
const partyExtras = z.array(
  z.object({ actor: z.number(), name: z.string(), classId: z.string(), raceId: z.string(), recordId: z.string().optional() }),
);
const xpExtras = z.object({ byActor: z.record(z.string(), z.object({ level: z.number() })) });
const killsExtras = z.object({ byActor: z.record(z.string(), z.number()).optional() });
const deathsExtras = z.object({
  fallen: z.array(
    z.object({
      actor: z.number(),
      depth: count,
      turn: count,
      how: z.string().optional(),
      killer: z.object({ def: z.string(), name: z.string() }).nullable().optional(),
    }),
  ),
});

/** The numeric order of two ids (`adv.2` before `adv.10`). */
function byIdNumber(a: AdventurerId, b: AdventurerId): number {
  return idNumber(a) - idNumber(b);
}

/**
 * Drops the oldest fallen records (by `death.run`, then id) until at most `FALLEN_RECORD_CAP`
 * remain, never one another record names as kin.
 */
export function trimFallen(slice: Adventurers): Adventurers {
  const fallen = Object.values(slice.records).filter((r) => r.status === 'fallen');
  if (fallen.length <= FALLEN_RECORD_CAP) return slice;
  const protectedIds = new Set(Object.values(slice.records).flatMap((r) => (r.origin?.kin === undefined ? [] : [r.origin.kin])));
  const oldestFirst = [...fallen].sort((a, b) => (a.death?.run ?? 0) - (b.death?.run ?? 0) || byIdNumber(a.id, b.id));
  const dropped = new Set<AdventurerId>();
  let excess = fallen.length - FALLEN_RECORD_CAP;
  for (const record of oldestFirst) {
    if (excess === 0) break;
    if (protectedIds.has(record.id)) continue;
    dropped.add(record.id);
    excess--;
  }
  return { ...slice, records: Object.fromEntries(Object.entries(slice.records).filter(([id]) => !dropped.has(id))) };
}

/**
 * Folds a finished run into the records of everyone in its party. `run` is the run's number.
 * A member with no record (or an unknown id) gets a fresh one first.
 */
export function recordRun(slice: Adventurers, result: RunResult, run: number): Adventurers {
  const party = partyExtras.safeParse(result.extras['run.party']);
  if (!party.success) return slice;
  const xp = xpExtras.safeParse(result.extras['track.xp']);
  const kills = killsExtras.safeParse(result.extras['track.kills']);
  const deaths = deathsExtras.safeParse(result.extras['track.deaths']);
  let next = slice;
  for (const member of party.data) {
    let record = member.recordId === undefined ? undefined : next.records[member.recordId];
    if (record === undefined) {
      const made = newRecord(next, { name: member.name, classId: member.classId, raceId: member.raceId, born: run });
      next = made.slice;
      record = made.record;
    }
    const level = xp.success ? xp.data.byActor[member.actor]?.level : undefined;
    const fell = deaths.success ? deaths.data.fallen.find((f) => f.actor === member.actor) : undefined;
    const killed = kills.success ? (kills.data.byActor?.[member.actor] ?? 0) : 0;
    const history = record.history;
    const updated: AdventurerRecord = {
      ...record,
      peakLevel: Math.max(record.peakLevel, Math.floor(level ?? 1)),
      history: {
        runs: history.runs + 1,
        victories: history.victories + (result.outcome === 'victory' && fell === undefined ? 1 : 0),
        deepest: Math.max(history.deepest, result.deepestDepth),
        kills: history.kills + killed,
        turns: history.turns + (fell?.turn ?? result.turns),
      },
      ...(fell === undefined
        ? {}
        : {
            status: 'fallen' as const,
            death: {
              run,
              depth: fell.depth,
              turn: fell.turn,
              cause: (fell.how ?? 'fell').slice(0, MAX_TEXT),
              ...(fell.killer ? { killer: { def: fell.killer.def.slice(0, 80), name: fell.killer.name.slice(0, 80) } } : {}),
            },
          }),
    };
    next = { ...next, records: { ...next.records, [record.id]: updated } };
  }
  return trimFallen(next);
}

export const adventurersSlice = defineSlice<Adventurers>({
  version: 1,
  schema: adventurersSchema,
  init: () => ({ nextId: 1, records: {} }),
  onRunResult: (adventurers, result, before) => recordRun(adventurers, result, before.history.totals.runs + 1),
});
