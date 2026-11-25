/**
 * The save format (docs/ARCHITECTURE.md §6.5): a versioned JSON envelope holding each profile
 * slice with its own version. The same string is written by autosave, exported and imported.
 *
 * ```json
 * { "format": "ethuathia.save", "version": 1, "savedAt": 1763337600000,
 *   "slices": { "currencies": { "version": 1, "data": { ... } }, ... } }
 * ```
 *
 * Two levels of versioning:
 * - `version` is the envelope's own layout. Change it only when the envelope itself changes,
 *   and add a step to `ENVELOPE_MIGRATIONS`.
 * - Each slice carries its own `version` and migration chain (`ProfileSlice.migrations`), so a
 *   feature changing its data never touches a shared version number.
 *
 * Loading runs every migration from the stored versions up to the current ones, then validates
 * each slice with its schema. A slice missing from the save (a feature newer than the save)
 * starts at its default; a slice the game no longer knows is dropped with a note.
 */
import { assertPlainData } from '../core';
import { SLICE_ENTRIES } from './profile';
import { refundRemovedNodes } from './slices/legacyUpgrades';
import type { Profile } from './profile';
import type { ProfileSlice } from './slice';

export const SAVE_FORMAT = 'ethuathia.save';

/** The envelope layout's version. */
export const SAVE_VERSION = 2;

/** Largest save text `decodeSave` accepts, so a wrong file can't hang the game. */
export const MAX_SAVE_LENGTH = 16 * 1024 * 1024;

type Envelope = Record<string, unknown>;

/** `ENVELOPE_MIGRATIONS[n]` turns an envelope at version `n - 1` into version `n`. */
const ENVELOPE_MIGRATIONS: Readonly<Record<number, (old: Envelope) => Envelope>> = {
  // v2 (ETH-132): the Guild Hall rebuild removed nodes; each owned one is refunded at its old price.
  2: refundRemovedNodes,
};

export interface StoredSlice {
  readonly version: number;
  readonly data: unknown;
}

export type DecodeResult<P> =
  | {
      readonly ok: true;
      readonly profile: P;
      /** When the save was written (ms since the epoch), as the save says. */
      readonly savedAt: number;
      /** Things worth telling the player or a developer, e.g. a slice that started fresh. */
      readonly notes: readonly string[];
    }
  | { readonly ok: false; readonly error: string };

/** The save string for `profile`. `savedAt` is passed in so meta stays free of the clock. */
export function encodeSave(profile: Profile, savedAt: number): string {
  assertPlainData(profile, 'profile');
  const slices: Record<string, StoredSlice> = {};
  for (const [key, slice] of SLICE_ENTRIES) slices[key] = { version: slice.version, data: profile[key] };
  return JSON.stringify({ format: SAVE_FORMAT, version: SAVE_VERSION, savedAt, slices });
}

/** Reads, migrates and validates a save string. Never throws: problems come back as `error`. */
export function decodeSave(text: string): DecodeResult<Profile> {
  return decodeSaveWith(text, Object.fromEntries(SLICE_ENTRIES)) as DecodeResult<Profile>;
}

/**
 * `decodeSave` against any set of slices and envelope migrations. Exported for tests, which
 * exercise the migration chains with slices of their own.
 */
export function decodeSaveWith(
  text: string,
  slices: Readonly<Record<string, ProfileSlice<unknown>>>,
  envelopeMigrations: Readonly<Record<number, (old: Envelope) => Envelope>> = ENVELOPE_MIGRATIONS,
  currentVersion = SAVE_VERSION,
): DecodeResult<Record<string, unknown>> {
  const fail = (error: string) => ({ ok: false as const, error });
  if (text.length > MAX_SAVE_LENGTH) return fail('This save is too large to be an Ethuathia save.');

  let raw: unknown;
  try {
    raw = JSON.parse(text.trim());
  } catch {
    return fail('This is not a save: it is not valid save text.');
  }
  if (!isRecord(raw) || raw.format !== SAVE_FORMAT) return fail('This is not an Ethuathia save.');

  let envelope: Envelope = raw;
  const version = envelope.version;
  if (!isVersion(version)) return fail('The save has no valid version number.');
  if (version > currentVersion) {
    return fail(`The save is from a newer version of the game (save format ${version}, this game reads up to ${currentVersion}).`);
  }
  for (let v = version + 1; v <= currentVersion; v++) {
    const step = envelopeMigrations[v];
    if (!step) return fail(`No way to upgrade the save format from ${v - 1} to ${v}.`);
    try {
      envelope = step(envelope);
    } catch (error) {
      return fail(`Upgrading the save format to ${v} failed: ${message(error)}`);
    }
  }

  const savedAt = typeof envelope.savedAt === 'number' && Number.isFinite(envelope.savedAt) ? envelope.savedAt : 0;
  const stored = envelope.slices;
  if (!isRecord(stored)) return fail('The save has no profile data.');

  const notes: string[] = [];
  const profile: Record<string, unknown> = {};
  for (const [key, slice] of Object.entries(slices)) {
    const entry = stored[key];
    if (entry === undefined) {
      profile[key] = slice.init();
      notes.push(`"${key}" was not in the save and starts fresh.`);
      continue;
    }
    const loaded = loadSlice(key, slice, entry);
    if (!loaded.ok) return fail(loaded.error);
    profile[key] = loaded.value;
  }
  for (const key of Object.keys(stored)) {
    if (!(key in slices)) notes.push(`"${key}" is not used by this version of the game and was dropped.`);
  }
  return { ok: true, profile, savedAt, notes };
}

function loadSlice(
  key: string,
  slice: ProfileSlice<unknown>,
  entry: unknown,
): { ok: true; value: unknown } | { ok: false; error: string } {
  if (!isRecord(entry) || !isVersion(entry.version) || !('data' in entry)) {
    return { ok: false, error: `The save's "${key}" data is damaged.` };
  }
  if (entry.version > slice.version) {
    return { ok: false, error: `The save's "${key}" data is from a newer version of the game.` };
  }
  let data = entry.data;
  for (let v = entry.version + 1; v <= slice.version; v++) {
    const step = slice.migrations?.[v];
    if (!step) return { ok: false, error: `No way to upgrade the save's "${key}" data from version ${v - 1} to ${v}.` };
    try {
      data = step(data);
    } catch (error) {
      return { ok: false, error: `Upgrading the save's "${key}" data to version ${v} failed: ${message(error)}` };
    }
  }
  const parsed = slice.schema.safeParse(data);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = [key, ...(issue?.path ?? [])].join('.');
    return { ok: false, error: `The save's "${key}" data is invalid (${where}: ${issue?.message ?? 'unknown problem'}).` };
  }
  return { ok: true, value: parsed.data };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isVersion(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
