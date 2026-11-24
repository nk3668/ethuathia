import { describe, expect, it } from 'vitest';
import { Registry } from '../../src/core';
import { checkKinds, killTiersFor, MONSTER_KILL_TIERS, MONSTER_KIND, MONSTERS } from '../../src/content';
import type { MonsterDef } from '../../src/content';

const rat = MONSTERS.all()[0] as MonsterDef;

/** Problems `checkKinds` finds for a monster with these `codexTiers` (cast: malformed is the point). */
function problemsFor(codexTiers: unknown): string[] {
  const registry = new Registry<MonsterDef>(MONSTER_KIND.registry.kind);
  registry.register({ ...rat, codexTiers } as MonsterDef);
  return checkKinds([{ ...MONSTER_KIND, registry, refs: () => [] }]);
}

describe('monster Codex kill tiers (ETH-144)', () => {
  it('falls back to the global 1 / 10 / 50 tiers when a def has no codexTiers', () => {
    expect(MONSTER_KILL_TIERS).toEqual({ basics: 1, stats: 10, lore: 50 });
    expect(killTiersFor(rat)).toBe(MONSTER_KILL_TIERS);
  });

  it("reads a def's own codexTiers", () => {
    expect(killTiersFor({ ...rat, codexTiers: { basics: 1, stats: 2, lore: 3 } })).toEqual({ basics: 1, stats: 2, lore: 3 });
  });

  it('accepts strictly increasing tiers', () => {
    expect(problemsFor({ basics: 1, stats: 2, lore: 3 })).toEqual([]);
  });

  it('names a def whose tiers are not strictly increasing', () => {
    for (const bad of [
      { basics: 1, stats: 1, lore: 3 },
      { basics: 5, stats: 2, lore: 3 },
      { basics: 1, stats: 4, lore: 3 },
    ]) {
      expect(problemsFor(bad)).toEqual([expect.stringContaining('codexTiers: codexTiers must be strictly increasing')]);
    }
  });

  it('rejects a zero or missing tier', () => {
    expect(problemsFor({ basics: 0, stats: 2, lore: 3 })).toHaveLength(1);
    expect(problemsFor({ basics: 1, stats: 2 })).toHaveLength(1);
  });
});
