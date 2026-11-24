/**
 * Stat tooltips name a ranked upgrade once with its rank count (ETH-180). Test-only content: no
 * shipped node has ranks yet.
 */
import { describe, expect, it } from 'vitest';
import { defineBundle } from '../../src/content';
import { createRun, getEntity, getStat, groupLabel, groupStatParts } from '../../src/sim';
import type { ActorEntity, EntityId, StatPart, StatPartGroup } from '../../src/sim';

const RANKED = defineBundle({
  id: 'bundle.test_ranked',
  name: 'Hardy Test',
  description: 'A ranked test bundle.',
  tags: [],
  bundle: { modifiers: [{ stat: 'hp', op: 'add', value: 3 }] },
});
const SINGLE = defineBundle({
  id: 'bundle.test_single',
  name: 'Single Test',
  description: 'A test bundle.',
  tags: [],
  bundle: { modifiers: [{ stat: 'hp', op: 'add', value: 5 }] },
});

function parts(partyBundles: string[]): StatPart[] {
  const state = createRun(
    { party: [{ name: 'Mira', classId: 'class.vanguard', raceId: 'race.human' }], partyBundles, floorText: ['#####', '#@..#', '#####'] },
    1,
  );
  return getStat(state, getEntity(state, state.party[0] as EntityId) as ActorEntity, 'hp').parts;
}

describe('groupStatParts', () => {
  it('shows a rank-3 bundle once with x3 and the summed value', () => {
    const raw = parts([RANKED.id, RANKED.id, RANKED.id]);
    expect(raw.filter((p) => p.source.id === RANKED.id)).toHaveLength(3);
    const groups = groupStatParts(raw).filter((g) => g.source.id === RANKED.id);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ op: 'add', value: 9, count: 3 });
    expect(groupLabel(groups[0] as StatPartGroup)).toBe('Hardy Test ×3');
  });

  it('leaves a source that appears once unchanged, and keeps first-appearance order', () => {
    const raw = parts([SINGLE.id, RANKED.id, RANKED.id]);
    const groups = groupStatParts(raw);
    const single = groups.find((g) => g.source.id === SINGLE.id);
    expect(single).toMatchObject({ value: 5, count: 1 });
    expect(groupLabel(single as StatPartGroup)).toBe('Single Test');
    expect(groups.map((g) => g.source.id).filter((id) => id.startsWith('bundle.test_'))).toEqual([SINGLE.id, RANKED.id]);
    // The total is unchanged by grouping.
    expect(groups.reduce((n, g) => n + (g.op === 'add' ? g.value : 0), 0)).toBe(raw.reduce((n, p) => n + (p.op === 'add' ? p.value : 0), 0));
  });

  it('treats run modifier sources keyed id#n as the same source, and multiplies mul parts', () => {
    const source = (id: string) => ({ id, label: 'Gloom' });
    const groups = groupStatParts([
      { op: 'add', value: 1, source: source('upgrade.x') },
      { op: 'add', value: 1, source: source('upgrade.x#2') },
      { op: 'mul', value: 1.5, source: source('upgrade.x') },
      { op: 'mul', value: 2, source: source('upgrade.x#2') },
    ]);
    expect(groups).toEqual([
      { op: 'add', value: 2, count: 2, source: source('upgrade.x') },
      { op: 'mul', value: 3, count: 2, source: source('upgrade.x') },
    ]);
  });
});
