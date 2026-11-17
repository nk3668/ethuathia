import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { applyRunResult, decodeSave, decodeSaveWith, defineSlice, encodeSave, newProfile, SAVE_FORMAT, SAVE_VERSION } from '../../src/meta';
import type { ProfileSlice } from '../../src/meta';
import { emptyRunResult, favorKey } from '../../src/sim';

function envelope(slices: Record<string, unknown>, version = 1): string {
  return JSON.stringify({ format: SAVE_FORMAT, version, savedAt: 1000, slices });
}

describe('encodeSave / decodeSave', () => {
  it('round-trips a profile', () => {
    const profile = applyRunResult(newProfile(), {
      ...emptyRunResult('victory'),
      atRisk: { renown: 1234, trophies: 5, [favorKey('deity.dawn')]: 3 },
      turns: 300,
      deepestDepth: 4,
    });
    const decoded = decodeSave(encodeSave(profile, 42));
    expect(decoded).toEqual({ ok: true, profile, savedAt: 42, notes: [] });
  });

  it('writes the format, version and each slice with its version', () => {
    const raw = JSON.parse(encodeSave(newProfile(), 7)) as Record<string, unknown>;
    expect(raw).toMatchObject({ format: SAVE_FORMAT, version: SAVE_VERSION, savedAt: 7 });
    expect(raw.slices).toMatchObject({ currencies: { version: 1 }, history: { version: 1 } });
  });

  it('loads a hand-written v1 save of the current slices', () => {
    const text = envelope({
      currencies: { version: 1, data: { renown: 50, trophies: 2, favor: { 'deity.dawn': 1 } } },
      history: {
        version: 1,
        data: { totals: { runs: 1, victories: 0, retreats: 1, wipes: 0, turns: 90, deepestDepth: 2 }, recent: [] },
      },
    });
    const decoded = decodeSave(text);
    if (!decoded.ok) throw new Error(decoded.error);
    expect(decoded.profile.currencies).toEqual({ renown: 50, trophies: 2, favor: { 'deity.dawn': 1 } });
    expect(decoded.profile.history.totals.runs).toBe(1);
  });

  it('starts a slice missing from the save at its default, and drops unknown slices, with notes', () => {
    const decoded = decodeSave(envelope({ currencies: { version: 1, data: { renown: 1, trophies: 0, favor: {} } }, oldThing: { version: 1, data: 1 } }));
    if (!decoded.ok) throw new Error(decoded.error);
    expect(decoded.profile.history).toEqual(newProfile().history);
    expect(decoded.notes).toEqual([
      '"history" was not in the save and starts fresh.',
      '"oldThing" is not used by this version of the game and was dropped.',
    ]);
  });

  it.each([
    ['not JSON', 'hello', /not valid save text/],
    ['another format', JSON.stringify({ format: 'other', version: 1 }), /not an Ethuathia save/],
    ['no version', JSON.stringify({ format: SAVE_FORMAT, slices: {} }), /no valid version/],
    ['a newer envelope', envelope({}, SAVE_VERSION + 1), /newer version of the game/],
    ['a newer slice', envelope({ currencies: { version: 99, data: {} } }), /"currencies" data is from a newer version/],
    ['a damaged slice', envelope({ currencies: 3 }), /"currencies" data is damaged/],
    ['an invalid slice', envelope({ currencies: { version: 1, data: { renown: -5, trophies: 0, favor: {} } } }), /currencies\.renown/],
    ['a bad deity id', envelope({ currencies: { version: 1, data: { renown: 0, trophies: 0, favor: { Bob: 1 } } } }), /currencies\.favor/],
    ['no slices', JSON.stringify({ format: SAVE_FORMAT, version: 1 }), /no profile data/],
  ])('refuses %s', (_name, text, error) => {
    const decoded = decodeSave(text);
    expect(decoded.ok).toBe(false);
    if (!decoded.ok) expect(decoded.error).toMatch(error);
  });

  it('refuses text too large to be a save', () => {
    expect(decodeSave(' '.repeat(16 * 1024 * 1024 + 1))).toMatchObject({ ok: false });
  });
});

describe('migrations', () => {
  // A slice whose shape changed twice: v1 { gold }, v2 { coins }, v3 { coins, gems }.
  const wallet: ProfileSlice<{ coins: number; gems: number }> = defineSlice({
    version: 3,
    schema: z.object({ coins: z.number(), gems: z.number() }),
    init: () => ({ coins: 0, gems: 0 }),
    migrations: {
      2: (old) => ({ coins: (old as { gold: number }).gold }),
      3: (old) => ({ ...(old as object), gems: 0 }),
    },
  });
  const slices = { wallet } as Record<string, ProfileSlice<unknown>>;

  it('upgrades a v1 slice to the current version step by step', () => {
    const decoded = decodeSaveWith(envelope({ wallet: { version: 1, data: { gold: 12 } } }), slices);
    expect(decoded).toMatchObject({ ok: true, profile: { wallet: { coins: 12, gems: 0 } } });
  });

  it('starts from the stored version, not v1', () => {
    const decoded = decodeSaveWith(envelope({ wallet: { version: 2, data: { coins: 4 } } }), slices);
    expect(decoded).toMatchObject({ ok: true, profile: { wallet: { coins: 4, gems: 0 } } });
  });

  it('fails cleanly when a step is missing or throws', () => {
    const gap = { wallet: { ...wallet, migrations: { 3: wallet.migrations?.[3] } } } as Record<string, ProfileSlice<unknown>>;
    expect(decodeSaveWith(envelope({ wallet: { version: 1, data: { gold: 1 } } }), gap)).toMatchObject({
      ok: false,
      error: expect.stringMatching(/from version 1 to 2/),
    });
    expect(decodeSaveWith(envelope({ wallet: { version: 1, data: null } }), slices)).toMatchObject({
      ok: false,
      error: expect.stringMatching(/to version 2 failed/),
    });
  });

  it('runs envelope migrations from a v1 envelope to the current one', () => {
    // A v2 envelope renamed `slices` to `parts`, then v3 renamed it back: exercises the chain.
    const steps = {
      2: (old: Record<string, unknown>) => ({ ...old, parts: old.slices, slices: undefined }),
      3: (old: Record<string, unknown>) => ({ ...old, slices: old.parts }),
    };
    const decoded = decodeSaveWith(envelope({ wallet: { version: 3, data: { coins: 1, gems: 2 } } }), slices, steps, 3);
    expect(decoded).toMatchObject({ ok: true, profile: { wallet: { coins: 1, gems: 2 } } });
  });
});
