/**
 * Attributes and the stats derived from them (ETH-033): the formula table, class + race + own
 * points, tooltip parts, monsters with attributes, the snapshot and the invariants.
 */
import { describe, expect, it } from 'vitest';
import { ATTRIBUTE_IDS, ATTRIBUTES, attributeDefId, CLASS_VANGUARD, defineClass, RACE_HUMAN } from '../../src/content';
import {
  addEntity,
  ATTRIBUTE_FORMULAS,
  ATTRIBUTE_NEUTRAL,
  attributeValue,
  checkInvariants,
  createRun,
  formulasFor,
  getAttribute,
  getEntity,
  getStat,
  getStats,
  newStatsPart,
  snapshot,
  STAT_IDS,
  statValue,
} from '../../src/sim';
import type { ActorEntity, EntityId, RunConfig, RunState, StatId } from '../../src/sim';

// A class at exactly neutral attributes, plus one far from it: registered once for this file.
const PLAIN = defineClass({
  id: 'class.test_plain',
  name: 'Plain',
  description: 'A test class with every attribute at 10.',
  tags: [],
  attributes: { brawn: 10, finesse: 10, wits: 10, grit: 10 },
  growth: { grit: { min: 1, max: 1 } },
});
const ODD = defineClass({
  id: 'class.test_odd',
  name: 'Odd',
  description: 'A test class with uneven attributes.',
  tags: [],
  attributes: { brawn: 5, finesse: 15, wits: 20, grit: 7 },
  growth: { wits: { min: 1, max: 1 } },
});

const ROOM = ['#######', '#@....#', '#.....#', '#######'];

function hero(classId = CLASS_VANGUARD.id): { state: RunState; hero: ActorEntity } {
  const config: RunConfig = { party: [{ name: 'Mira', classId, raceId: RACE_HUMAN.id }], floorText: ROOM };
  const state = createRun(config, 1);
  const entity = getEntity(state, state.party[0] as EntityId) as ActorEntity;
  // These tests are about attributes alone, so the class kit (ETH-176) is taken off.
  Reflect.deleteProperty(entity, 'inventory');
  return { state, hero: entity };
}

/** What the formula table says `stat` gains from `values`, worked by hand. */
function derived(values: Record<string, number>, stat: StatId): number {
  return ATTRIBUTE_FORMULAS.filter((f) => f.stat === stat).reduce((sum, f) => sum + ((values[f.attribute] ?? 0) - f.from) * f.perPoint, 0);
}

describe('attributes', () => {
  it('have one def each, with Codex text, an abbreviation and at least one derived stat', () => {
    expect(ATTRIBUTES.all().map((d) => d.key)).toEqual([...ATTRIBUTE_IDS]);
    for (const a of ATTRIBUTE_IDS) {
      const def = ATTRIBUTES.get(attributeDefId(a));
      expect(def.description.length).toBeGreaterThan(10);
      expect(def.abbr).toMatch(/^[A-Z]{3}$/);
      expect(formulasFor(a).length).toBeGreaterThan(0);
    }
  });

  it('sum the class, the race and the actor’s own points, each part labeled', () => {
    const { hero: h } = hero();
    expect(getAttribute(h, 'grit')).toEqual({
      attribute: 'grit',
      value: 14,
      parts: [
        { value: 13, source: { id: 'class.vanguard', label: 'Vanguard' } },
        { value: 1, source: { id: 'race.human', label: 'Human' } },
      ],
    });
    (h.stats as NonNullable<typeof h.stats>).attributes = { grit: 2 };
    expect(attributeValue(h, 'grit')).toBe(16);
    expect(getAttribute(h, 'grit').parts[2]).toEqual({ value: 2, source: { id: h.def, label: 'Trained' } });
  });
});

describe('derived stats', () => {
  it('give a starting Human Vanguard the same HP and MP as before attributes, plus damage and carry', () => {
    const { state, hero: h } = hero();
    const values = Object.fromEntries(STAT_IDS.map((s) => [s, statValue(state, h, s)]));
    expect(values).toEqual({
      hp: 20,
      mp: 5,
      accuracy: 0,
      evasion: 0,
      damage: 1,
      armor: 0,
      speed: 100,
      sight: 8,
      carry: 24,
      // Skills (ETH-081): Wits 5, Grit 14, Finesse 10, Brawn 12.
      identify: 15,
      trapSpot: 25,
      statusResist: 28,
      disarm: 50,
      flee: 70,
      forceDoor: 48,
    });
    expect(h.actor).toMatchObject({ hp: 20, mp: 5 });
  });

  it('follow the formula table for every stat, matching getStat', () => {
    for (const cls of [PLAIN, ODD, CLASS_VANGUARD]) {
      const { state, hero: h } = hero(cls.id);
      const values = Object.fromEntries(ATTRIBUTE_IDS.map((a) => [a, attributeValue(h, a)]));
      for (const stat of ['hp', 'mp', 'accuracy', 'evasion', 'damage', 'carry'] as const) {
        expect(statValue(state, h, stat)).toBe(Math.max(stat === 'hp' ? 1 : 0, Math.round(derived(values, stat))));
        expect(getStat(state, h, stat).value).toBe(statValue(state, h, stat));
      }
    }
  });

  it('add nothing at the neutral value for formulas measured from it', () => {
    const { state, hero: h } = hero(PLAIN.id);
    // Human +1 everywhere puts Plain one point above neutral.
    expect(ATTRIBUTE_NEUTRAL).toBe(10);
    expect(getStat(state, h, 'accuracy').parts).toEqual([{ op: 'add', value: 1, source: { id: 'attribute.finesse', label: 'Finesse 11' } }]);
  });

  it('can go below zero from a low attribute, and the stat clamps at its minimum', () => {
    const { state, hero: h } = hero(ODD.id);
    // Brawn 6: (6 − 10) × 0.5 = −2 damage, clamped to 0.
    expect(getStat(state, h, 'damage').parts).toEqual([{ op: 'add', value: -2, source: { id: 'attribute.brawn', label: 'Brawn 6' } }]);
    expect(statValue(state, h, 'damage')).toBe(0);
    // Finesse 16: +6 accuracy and evasion. Wits 21: 21 MP.
    expect([statValue(state, h, 'accuracy'), statValue(state, h, 'evasion'), statValue(state, h, 'mp')]).toEqual([6, 6, 21]);
  });

  it('rise with points the actor gains (leveling)', () => {
    const { state, hero: h } = hero();
    (h.stats as NonNullable<typeof h.stats>).attributes = { brawn: 2, grit: 3 };
    // Grit 17 + Brawn 14 × 0.5 = 24 HP; damage (14 − 10) × 0.5 = 2; carry 28.
    expect([statValue(state, h, 'hp'), statValue(state, h, 'damage'), statValue(state, h, 'carry')]).toEqual([24, 2, 28]);
  });

  it('leave an actor without a class or points alone, and derive a monster given points', () => {
    const { state } = hero();
    const plain = addEntity(state, {
      def: 'monster.test',
      floor: 'd1',
      pos: { x: 5, y: 2 },
      actor: { energy: 0, hp: 6, mp: 0, faction: 'monster' },
      stats: newStatsPart({ hp: 6, damage: 2 }),
    }) as ActorEntity;
    expect([statValue(state, plain, 'hp'), statValue(state, plain, 'damage'), statValue(state, plain, 'carry')]).toEqual([6, 2, 0]);

    const brute = addEntity(state, {
      def: 'monster.test',
      floor: 'd1',
      pos: { x: 4, y: 2 },
      actor: { energy: 0, hp: 6, mp: 0, faction: 'monster' },
      stats: { ...newStatsPart({ hp: 6 }), attributes: { brawn: 14 } },
    }) as ActorEntity;
    expect(getStat(state, brute, 'damage').parts).toEqual([{ op: 'add', value: 2, source: { id: 'attribute.brawn', label: 'Brawn 14' } }]);
    expect(getAttribute(brute, 'brawn').parts).toEqual([{ value: 14, source: { id: 'monster.test', label: 'Base' } }]);
    // Absolute formulas add to the base too: 6 + Brawn 14 × 0.5.
    expect(statValue(state, brute, 'hp')).toBe(13);
  });
});

describe('snapshot and invariants', () => {
  it('show each member’s attributes with their parts', () => {
    const { state, hero: h } = hero();
    const view = snapshot(state).domains.stats.members[h.id];
    expect(view?.attributes.brawn).toEqual(getAttribute(h, 'brawn'));
    expect(view?.stats).toEqual(getStats(state, h));
  });

  it('flag points in an unknown attribute or a fractional point', () => {
    const { state, hero: h } = hero();
    (h.stats as NonNullable<typeof h.stats>).attributes = { brawn: 1.5, luck: 2 } as never;
    const problems = checkInvariants(state).join('\n');
    expect(problems).toContain('has brawn points 1.5');
    expect(problems).toContain('unknown attribute "luck"');
  });
});
