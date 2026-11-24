/** The Guild Hall's Mastery list shows the available classes plus any class with Mastery XP (ETH-160, ETH-087). */
import { describe, expect, it } from 'vitest';
import { defineClass, defineUpgrade } from '../../src/content';
import { masteryClasses, newProfile } from '../../src/meta';
import type { Profile } from '../../src/meta';

// A class an upgrade unlocks, so it is locked until the node is owned.
defineClass({
  id: 'class.test_sealed',
  name: 'Sealed',
  description: 'A test class behind an unlock.',
  hint: 'Locked away.',
  tags: [],
  attributes: { brawn: 10, finesse: 10, wits: 10, grit: 10 },
  growth: { brawn: { min: 1, max: 1 } },
});
defineUpgrade({
  id: 'upgrade.test_unseal',
  name: 'Test Unseal',
  description: 'Unlocks the sealed class.',
  tags: [],
  building: 'building.guild_hall',
  tier: 9,
  column: 1,
  cost: { renown: 1 },
  requires: [],
  grants: [{ kind: 'unlock', id: 'class.test_sealed' }],
});

const ids = (profile: Profile) => masteryClasses(profile).map((c) => c.id);

describe('masteryClasses', () => {
  it('hides a locked class that has no Mastery XP', () => {
    expect(ids(newProfile())).not.toContain('class.test_sealed');
    expect(ids(newProfile())).toContain('class.vanguard');
  });

  it('shows a class once its unlock is owned', () => {
    const p = newProfile();
    expect(ids({ ...p, upgrades: { ...p.upgrades, owned: ['upgrade.test_unseal'] } })).toContain('class.test_sealed');
  });

  it('keeps a locked class that already has Mastery XP', () => {
    const p = newProfile();
    expect(ids({ ...p, mastery: { classes: { 'class.test_sealed': { xp: 5, runs: 1 } } } })).toContain('class.test_sealed');
  });
});
