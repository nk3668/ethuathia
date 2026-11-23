import { describe, expect, it } from 'vitest';
import { Rng } from '../../src/core';
import { DUNGEON_OLD_DELVE, MONSTER_BASALT_GIANT, MONSTER_GLOAM_RAT, MONSTERS } from '../../src/content';
import type { DungeonDef } from '../../src/content';
import {
  addEntity,
  checkInvariants,
  CHRONICLE_KINDS,
  CHRONICLE_OOD_SIGHTED,
  CHRONICLE_TRACKER,
  computeOodDanger,
  computeTemplateChance,
  createRun,
  deserialize,
  fillVitals,
  newMonster,
  planFloor,
  rollOodDanger,
  serialize,
  stateHash,
  step,
  templateChanceFor,
} from '../../src/sim';
import type { ChronicleEntry, SimEvent } from '../../src/sim';
import { COMBAT_MOMENT_TEXT, HIGHLIGHT_OOD_SIGHTED } from '../../src/ui/shell/logText/combat';
import { describe as describeEvent, highlightOf, momentLine } from '../../src/ui/shell/text';

const HERO = { name: 'Mira', classId: 'class.vanguard', raceId: 'race.human' };

const ofType = <K extends SimEvent['type']>(events: SimEvent[], type: K) =>
  events.filter((e): e is Extract<SimEvent, { type: K }> => e.type === type);

describe('templateChanceFor and computeTemplateChance', () => {
  it('stays at 0% on Danger 1–2 and ramps smoothly from Danger 3+ via dungeon.encounters.templateRamp', () => {
    expect(computeTemplateChance(DUNGEON_OLD_DELVE, 1)).toBe(0);
    expect(computeTemplateChance(DUNGEON_OLD_DELVE, 2)).toBe(0);
    expect(templateChanceFor(DUNGEON_OLD_DELVE, 1)).toBe(0);
    expect(templateChanceFor(DUNGEON_OLD_DELVE, 2)).toBe(0);

    const d3 = templateChanceFor(DUNGEON_OLD_DELVE, 3);
    const d5 = templateChanceFor(DUNGEON_OLD_DELVE, 5);
    const d8 = templateChanceFor(DUNGEON_OLD_DELVE, 8);
    const d15 = templateChanceFor(DUNGEON_OLD_DELVE, 15);
    expect(d3).toBeCloseTo(0.035);
    expect(d5).toBeGreaterThan(d3);
    expect(d8).toBeGreaterThan(d5);
    expect(d15).toBeCloseTo(0.35);

    expect(computeTemplateChance(undefined, 4, 0.2)).toBe(0.2);
    expect(computeTemplateChance(undefined, 4, 2)).toBe(1);
    expect(computeTemplateChance(undefined, 4, -1)).toBe(0);
  });
});

describe('rollOodDanger and computeOodDanger', () => {
  it('is 0% below Danger 3 (without drawing from rng) and ~5% from Danger 3+ for +2 Danger', () => {
    for (const danger of [1, 2]) {
      const rng = Rng.seeded(42, `d-${danger}`);
      const before = rng.saveState();
      expect(computeOodDanger(DUNGEON_OLD_DELVE, danger, rng)).toEqual({ danger, ood: false });
      expect(rollOodDanger(DUNGEON_OLD_DELVE, danger, rng)).toEqual({ danger, ood: false });
      expect(rng.state).toEqual(before);
    }

    const noOodRng = Rng.seeded(7, 'no-ood');
    const noOodBefore = noOodRng.saveState();
    expect(computeOodDanger(undefined, 5, noOodRng)).toEqual({ danger: 5, ood: false });
    expect(noOodRng.state).toEqual(noOodBefore);

    const trials = 2000;
    let hits = 0;
    const rng = Rng.seeded(101, 'ood-rate');
    for (let i = 0; i < trials; i++) {
      const rolled = rollOodDanger(DUNGEON_OLD_DELVE, 5, rng);
      if (rolled.ood) {
        hits++;
        expect(rolled.danger).toBe(7);
      } else {
        expect(rolled.danger).toBe(5);
      }
    }
    const rate = hits / trials;
    expect(rate).toBeGreaterThan(0.03);
    expect(rate).toBeLessThan(0.075);
  });

  it('never sets ood: true when no strictly deeper eligible monster exists at the elevated Danger', () => {
    const fungusOnly: DungeonDef = {
      ...DUNGEON_OLD_DELVE,
      id: 'dungeon.test_fungus_only',
      ecology: { allowTags: ['fungus'] },
      encounters: { ood: { minDanger: 2, chance: 1, boost: 2 } },
    };
    const rng = Rng.seeded(3, 'empty-ood');
    // Highest fungus monster min Danger is 3 (lantern_cap: 3..8), so Danger 4 -> 6 has no monster with min > 4.
    expect(computeOodDanger(fungusOnly, 4, rng)).toEqual({ danger: 4, ood: false });
    expect(rollOodDanger(fungusOnly, 4, rng)).toEqual({ danger: 4, ood: false });
    // Danger 2 -> 4 has monster.lantern_cap (min: 3 > 2, max: 8), so it elevates cleanly.
    expect(computeOodDanger(fungusOnly, 2, rng)).toEqual({ danger: 4, ood: true });
    expect(rollOodDanger(DUNGEON_OLD_DELVE, 10, Rng.seeded(5, 'cap-10'))).toEqual({ danger: 10, ood: false });
  });
});

describe('GEN_MONSTERS OOD and template integration', () => {
  it('produces zero templates and zero OOD spawns on Danger 1–2, and spawns both on Danger 3+', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const state = createRun({ party: [HERO], depth: 10 }, seed);
      for (const floorId of ['d1', 'd2']) {
        const plan = planFloor(state, floorId);
        for (const s of plan.spawns ?? []) {
          expect(s.monster?.ood).toBeUndefined();
          expect(s.monster?.overlay).toBeUndefined();
        }
      }
    }

    let seenOod = 0;
    let seenTemplate = 0;
    for (let seed = 1; seed <= 40 && (seenOod === 0 || seenTemplate === 0); seed++) {
      const state = createRun({ party: [HERO], depth: 10 }, seed);
      for (const depth of [4, 5, 6, 7]) {
        const plan = planFloor(state, `d${depth}`);
        for (const s of plan.spawns ?? []) {
          if ((s.monster?.overlay?.templates?.length ?? 0) > 0) seenTemplate++;
          if (s.monster?.ood === true) {
            seenOod++;
            const def = MONSTERS.get(s.def);
            expect(def.danger.min).toBeGreaterThan(depth);
            expect(def.danger.max).toBeGreaterThanOrEqual(depth + 2);
          }
        }
      }
    }
    expect(seenOod).toBeGreaterThan(0);
    expect(seenTemplate).toBeGreaterThan(0);
  });
});

describe('OOD sighting highlight, log text, chronicle, and save/load determinism', () => {
  const HALL = ['###########', '#@........#', '###########'];

  it('emits ood on monsterSighted, highlights the log warning, records a chronicle moment, and round-trips saves', () => {
    const state = createRun({ party: [HERO], floorText: HALL, depth: 5, monsters: false }, 12);
    const oodSpawn = addEntity(state, { ...newMonster(MONSTER_BASALT_GIANT, { x: 4, y: 1 }, undefined, { ood: true }), floor: 'd1' });
    fillVitals(state, oodSpawn);
    const normalSpawn = addEntity(state, { ...newMonster(MONSTER_GLOAM_RAT, { x: 6, y: 1 }), floor: 'd1' });
    fillVitals(state, normalSpawn);
    expect(checkInvariants(state)).toEqual([]);

    // Save before sighting, then step both original and loaded runs.
    const saved = serialize(state);
    const loaded = deserialize(saved);
    expect(stateHash(loaded)).toBe(stateHash(state));
    expect(loaded.entities[oodSpawn.id]?.monster?.ood).toBe(true);
    expect(loaded.entities[normalSpawn.id]?.monster?.ood).toBeUndefined();
    expect(checkInvariants(loaded)).toEqual([]);

    const eventsA = step(state, []);
    const eventsB = step(loaded, []);
    expect(eventsB).toEqual(eventsA);
    expect(stateHash(loaded)).toBe(stateHash(state));

    const sightings = ofType(eventsA, 'monsterSighted');
    const oodEvent = sightings.find((e) => e.monster === oodSpawn.id);
    const normalEvent = sightings.find((e) => e.monster === normalSpawn.id);
    expect(oodEvent).toBeDefined();
    expect(oodEvent?.ood).toBe(true);
    expect(normalEvent).toBeDefined();
    expect(normalEvent?.ood).toBeUndefined();

    // Highlight + log text
    expect(highlightOf(oodEvent as SimEvent)).toEqual({
      kind: HIGHLIGHT_OOD_SIGHTED,
      place: { floor: 'd1', pos: { x: 4, y: 1 } },
    });
    expect(describeEvent(oodEvent as SimEvent, () => 'Mira').text).toBe(
      'Mira spots the basalt giant — far above its usual depth!',
    );
    expect(highlightOf(normalEvent as SimEvent)).toBeUndefined();
    expect(describeEvent(normalEvent as SimEvent, () => 'Mira').text).toBe('Mira spots the gloam rat.');

    // Chronicle entry + moment wording
    expect(CHRONICLE_KINDS.get(CHRONICLE_OOD_SIGHTED.id)).toEqual(CHRONICLE_OOD_SIGHTED);
    const chronicle = state.domains.run.trackers[CHRONICLE_TRACKER.id] as { entries: ChronicleEntry[] };
    expect(chronicle.entries).toHaveLength(1);
    expect(chronicle.entries[0]).toMatchObject({
      kind: 'oodSighted',
      floor: 'd1',
      pos: { x: 4, y: 1 },
      depth: 1,
      actors: [state.party[0], oodSpawn.id],
      ids: [MONSTER_BASALT_GIANT.id],
    });
    expect(COMBAT_MOMENT_TEXT.oodSighted?.kind).toBe(HIGHLIGHT_OOD_SIGHTED);
    expect(momentLine(chronicle.entries[0] as ChronicleEntry, 0, () => 'Mira').text).toBe(
      'Mira spotted the basalt giant far above its usual depth on floor 1.',
    );
  });
});
