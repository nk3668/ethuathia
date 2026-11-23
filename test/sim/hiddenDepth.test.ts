/**
 * ETH-133 & ETH-131 guards for extensible Danger, innate monster bundles, Ecology, and variable
 * hidden dungeon depth:
 * - `configDepthRange` / `resolveRunDepth` / `configDepth` validation, `clampRange` bounds, and
 *   Rematch seed determinism without shifting shared RNG streams
 * - `floorDanger`, `DungeonDef` / `MonsterDef` strict schema & ref validation, Wave-2 hooks
 * - Peak-weighted `monsterWeightAt`, `monstersForDanger`, `pickWeightedForDanger`, and ecology tags
 * - Innate `MonsterDef.bundle` via `SOURCE_MONSTER_INNATE`, `spawnHp`, `getStat`, and triggers
 * - Hidden depth secrecy (`FloorsSnapshot.depth === null`, `runStarted.depth === null`,
 *   non-spoiling `leftCause`, `debugDungeonDepth()`, reveal on bottom floor & `FLAG_REVEAL_DEPTH`)
 * - ETH-131 AI indistinguishability across floors 1..5 for `depth: 6` vs `depth: 10`
 */
import { describe, expect, it } from 'vitest';
import { Rng, seedStreams } from '../../src/core';
import {
  DUNGEON_KIND,
  DUNGEON_OLD_DELVE,
  defineDungeon,
  defineMonster,
  MONSTER_CAVERN_BRUTE,
  MONSTER_GLOAM_RAT,
  MONSTER_KIND,
  MONSTERS,
} from '../../src/content';
import type { DungeonDef, MonsterDef } from '../../src/content';
import {
  checkGame,
  checkInvariants,
  chooseRule,
  configDepth,
  configDepthRange,
  createRun,
  depthRevealed,
  deserialize,
  dungeonDepth,
  ensureFloor,
  fireTrigger,
  FLAG_REVEAL_DEPTH,
  floorDanger,
  forEachBundle,
  getEntity,
  getStat,
  monstersForDanger,
  pickWeightedForDanger,
  planFloor,
  resolveRunDepth,
  respawnFloor,
  RNG_STREAMS,
  rollOodDanger,
  runDungeon,
  serialize,
  SimSession,
  snapshot,
  spawnHp,
  spawnMonster,
  stateHash,
  statValue,
  step,
  templateChanceFor,
  monsterWeightAt,
} from '../../src/sim';
import type { ActorEntity, AiActor, Command, EntityId, RunConfig, RunState, SimEvent } from '../../src/sim';
import { describe as describeEvent } from '../../src/ui/shell/text';

const HERO = { name: 'Brannoc', classId: 'class.vanguard', raceId: 'race.human' };

const TEST_SPORE_TOAD = defineMonster({
  id: 'monster.test_spore_toad',
  name: 'Spore toad',
  description: 'A test creature carrying an innate bundle with bonus HP, armor, and an on-hit poison trigger.',
  hint: 'A test creature glowing faintly with toxic spores.',
  tags: ['beast', 'fungus'],
  glyph: { ch: 'T', color: '#88cc44' },
  stats: { hp: 5, damage: 1, accuracy: 1, evasion: 0, armor: 0, speed: 100 },
  role: 'brute',
  danger: { min: 2, peak: 4, max: 6 },
  bundle: {
    modifiers: [
      { stat: 'hp', op: 'add', value: 3 },
      { stat: 'armor', op: 'add', value: 2 },
    ],
    triggers: [{ on: 'trigger.hit', effects: [{ kind: 'applyStatus', status: 'status.poisoned', turns: 3, to: 'other' }] }],
  },
  weight: 8,
  threat: 3,
});

const TEST_FUNGAL_PIT = defineDungeon({
  id: 'dungeon.test_fungal_pit',
  name: 'Fungal Pit',
  description: 'A test dungeon variant with custom depth, Danger curve, and ecology rules.',
  hint: 'Damp cavern shafts overrun with fungal beasts.',
  tags: ['dungeon'],
  depth: { min: 4, max: 6 },
  danger: { start: 3, perFloor: 1.5 },
  floorType: 'floor.halls',
  ecology: {
    allowTags: ['beast', 'fungus'],
    denyTags: ['giant'],
    tagWeights: { fungus: 2 },
  },
});

const ofType = <K extends SimEvent['type']>(events: SimEvent[], type: K) =>
  events.filter((e): e is Extract<SimEvent, { type: K }> => e.type === type);

describe('content schemas for Danger, MonsterDef.bundle, and DungeonDef', () => {
  it('validates shipped content including test defs', () => {
    expect(checkGame()).toEqual([]);
  });

  it('rejects invalid MonsterDef danger ranges and invalid bundles, and collects bundle refs', () => {
    const base: MonsterDef = {
      id: 'monster.bad_check',
      name: 'Bad check',
      description: 'Validation check fixture for MonsterDef.',
      tags: ['beast'],
      glyph: { ch: 'x', color: '#ffffff' },
      stats: { hp: 5, damage: 0, accuracy: 0, evasion: 0, armor: 0, speed: 100 },
      role: 'brute',
      danger: { min: 2, max: 5 },
      weight: 5,
      threat: 2,
    };
    expect(MONSTER_KIND.schema.safeParse(base).success).toBe(true);
    expect(MONSTER_KIND.schema.safeParse({ ...base, danger: { min: 6, max: 4 } }).success).toBe(false);
    expect(MONSTER_KIND.schema.safeParse({ ...base, danger: { min: 2, peak: 1, max: 5 } }).success).toBe(false);
    expect(MONSTER_KIND.schema.safeParse({ ...base, danger: { min: 2, peak: 6, max: 5 } }).success).toBe(false);
    expect(MONSTER_KIND.schema.safeParse({ ...base, danger: { min: 0, max: 5 } }).success).toBe(false);
    expect(MONSTER_KIND.schema.safeParse({ ...base, bundle: { bogus: true } }).success).toBe(false);

    const refs = MONSTER_KIND.refs?.(TEST_SPORE_TOAD) ?? [];
    expect(refs).toEqual(
      expect.arrayContaining([
        { path: 'bundle.modifiers[0].stat', kind: 'stat', id: 'hp' },
        { path: 'bundle.modifiers[1].stat', kind: 'stat', id: 'armor' },
        { path: 'bundle.triggers[0].on', kind: 'trigger', id: 'trigger.hit' },
        { path: 'bundle.triggers[0].effects[0].status', kind: 'status', id: 'status.poisoned' },
      ]),
    );
  });

  it('strictly validates DungeonDef curves and ecology', () => {
    const valid: DungeonDef = {
      id: 'dungeon.valid_check',
      name: 'Valid check',
      description: 'Validation check fixture for DungeonDef.',
      tags: [],
      depth: { min: 3, max: 5 },
      danger: { start: 1, perFloor: 1 },
      floorType: 'floor.halls',
    };
    expect(DUNGEON_KIND.schema.safeParse(valid).success).toBe(true);
    expect(DUNGEON_KIND.schema.safeParse({ ...valid, depth: { min: 6, max: 4 } }).success).toBe(false);
    expect(DUNGEON_KIND.schema.safeParse({ ...valid, danger: { start: 0, perFloor: 1 } }).success).toBe(false);
    expect(DUNGEON_KIND.schema.safeParse({ ...valid, danger: { start: 1, perFloor: -0.5 } }).success).toBe(false);
    expect(DUNGEON_KIND.schema.safeParse({ ...valid, ecology: { allowTags: [] } }).success).toBe(false);
    expect(DUNGEON_KIND.schema.safeParse({ ...valid, ecology: { tagWeights: { beast: -1 } } }).success).toBe(false);
    expect(
      DUNGEON_KIND.schema.safeParse({
        ...valid,
        encounters: { templateRamp: { minDanger: 3, base: 0.5, perDanger: 0.05, max: 0.3 } },
      }).success,
    ).toBe(false);
    expect(DUNGEON_KIND.schema.safeParse({ ...valid, encounters: { extraCurve: 1 } }).success).toBe(false);
  });
});

describe('configDepthRange, resolveRunDepth, and Danger curves', () => {
  it('resolves defaults from dungeonId and clamps partial ranges via clampRange', () => {
    expect(configDepthRange({ party: [HERO] })).toEqual({ min: 6, max: 10 });
    expect(configDepth({ party: [HERO] })).toBe(10);
    expect(configDepthRange({ party: [HERO], dungeonId: TEST_FUNGAL_PIT.id })).toEqual({ min: 4, max: 6 });
    expect(configDepthRange({ party: [HERO], depth: { min: 8 } })).toEqual({ min: 8, max: 10 });
    expect(configDepthRange({ party: [HERO], depth: { max: 4 } })).toEqual({ min: 4, max: 4 });
    expect(configDepthRange({ party: [HERO], depth: { min: 12 } })).toEqual({ min: 12, max: 12 });
    expect(configDepthRange({ party: [HERO], depth: 3 })).toEqual({ min: 3, max: 3 });
  });

  it('throws RangeError on invalid depth numbers, bounds, or unknown dungeonId', () => {
    const bad: RunConfig[] = [
      { party: [HERO], dungeonId: 'dungeon.missing' },
      { party: [HERO], depth: 0 },
      { party: [HERO], depth: -2 },
      { party: [HERO], depth: 2.5 },
      { party: [HERO], depth: 100 },
      { party: [HERO], depth: { min: 0 } },
      { party: [HERO], depth: { max: 0 } },
      { party: [HERO], depth: { min: 1.5 } },
      { party: [HERO], depth: { max: 100 } },
      { party: [HERO], depth: { min: 8, max: 5 } },
    ];
    for (const cfg of bad) {
      expect(() => configDepthRange(cfg)).toThrow(RangeError);
      expect(() => configDepth(cfg)).toThrow(RangeError);
    }
  });

  it('rolls depth deterministically from seed without shifting shared RNG streams (Rematch ETH-084)', () => {
    const depths = new Set<number>();
    for (let seed = 1; seed <= 40; seed++) {
      const cfg: RunConfig = { party: [HERO] };
      const d1 = resolveRunDepth(cfg, seed);
      const d2 = resolveRunDepth(cfg, seed);
      expect(d1).toBe(d2);
      expect(d1).toBeGreaterThanOrEqual(6);
      expect(d1).toBeLessThanOrEqual(10);
      depths.add(d1);
    }
    expect(depths.size).toBeGreaterThan(1);

    // Rematch with extra party/upgrades preserves exact rolled depth and shared RNG stream positions.
    const a = createRun({ party: [HERO], floorText: ['#####', '#@>.#', '#####'] }, 17);
    const b = createRun({ party: [HERO, { ...HERO, name: 'Mira' }], partyBundles: ['upgrade.hardy_recruits'], floorText: ['#####', '#@>.#', '#####'] }, 17);
    expect(dungeonDepth(a)).toBe(dungeonDepth(b));
    expect(a.rng).toEqual(seedStreams(17, RNG_STREAMS));
    expect(b.rng).toEqual(seedStreams(17, RNG_STREAMS));
  });

  it('computes floorDanger and passes danger & dungeon into planFloor / FloorDraft', () => {
    const state = createRun({ party: [HERO], dungeonId: TEST_FUNGAL_PIT.id }, 3);
    expect(runDungeon(state).id).toBe(TEST_FUNGAL_PIT.id);
    expect(floorDanger(state, 1)).toBe(3);
    expect(floorDanger(state, 3)).toBe(6);

    const plan = planFloor(state, 'd1');
    for (const s of plan.spawns ?? []) {
      const def = MONSTERS.get(s.def);
      expect(def.danger.min).toBeLessThanOrEqual(3);
      expect(def.danger.max).toBeGreaterThanOrEqual(3);
      expect(def.tags.some((t) => t === 'beast' || t === 'fungus')).toBe(true);
    }
  });

  it('enforces dungeonDepth within configDepthRange in floors.graph invariant', () => {
    const state = createRun({ party: [HERO], depth: { min: 4, max: 6 } }, 5);
    expect(checkInvariants(state)).toEqual([]);
    state.config.depth = { min: 8, max: 10 };
    expect(checkInvariants(state).some((p) => p.startsWith('[floors.graph]'))).toBe(true);
  });

  it('provides pure Wave-2 extension hooks templateChanceFor and rollOodDanger', () => {
    expect(templateChanceFor(DUNGEON_OLD_DELVE, 1)).toBe(0);
    expect(templateChanceFor(DUNGEON_OLD_DELVE, 2)).toBe(0);
    expect(templateChanceFor(DUNGEON_OLD_DELVE, 3)).toBeCloseTo(0.035);
    expect(templateChanceFor(DUNGEON_OLD_DELVE, 5)).toBeCloseTo(0.105);
    expect(templateChanceFor(DUNGEON_OLD_DELVE, 20)).toBeCloseTo(0.35);
    expect(templateChanceFor(undefined, 4, 0.25)).toBe(0.25);

    const rng = Rng.seeded(9, 'test-ood');
    const before = rng.saveState();
    // Below minDanger (3), OOD never triggers and never draws from rng.
    expect(rollOodDanger(DUNGEON_OLD_DELVE, 2, rng)).toEqual({ danger: 2, ood: false });
    expect(rng.state).toEqual(before);
    // At minDanger+, rollOodDanger delegates cleanly to computeOodDanger.
    const rolled = rollOodDanger(DUNGEON_OLD_DELVE, 5, rng);
    expect([5, 7]).toContain(rolled.danger);
    expect(rolled.ood).toBe(rolled.danger > 5);
  });
});

describe('peak-weighted monster selection and ecology', () => {
  it('tapers monsterWeightAt from 1.0 at peak down to 0.25 at furthest edge and 0 outside', () => {
    // Symmetric range [2, 6] without explicit peak -> peak = 4, span = 2.
    const sym: MonsterDef = { ...MONSTER_GLOAM_RAT, danger: { min: 2, max: 6 }, weight: 10 };
    expect(monsterWeightAt(sym, 1)).toBe(0);
    expect(monsterWeightAt(sym, 2)).toBeCloseTo(2.5);
    expect(monsterWeightAt(sym, 3)).toBeCloseTo(6.25);
    expect(monsterWeightAt(sym, 4)).toBeCloseTo(10);
    expect(monsterWeightAt(sym, 5)).toBeCloseTo(6.25);
    expect(monsterWeightAt(sym, 6)).toBeCloseTo(2.5);
    expect(monsterWeightAt(sym, 7)).toBe(0);

    // Cavern brute has peak 9 over [7, 99] so it centers near 9 instead of (7+99)/2 = 53.
    expect(monsterWeightAt(MONSTER_CAVERN_BRUTE, 6)).toBe(0);
    expect(monsterWeightAt(MONSTER_CAVERN_BRUTE, 9)).toBeCloseTo(4);
    expect(monsterWeightAt(MONSTER_CAVERN_BRUTE, 7)).toBeGreaterThan(3.9);
    expect(monsterWeightAt(MONSTER_CAVERN_BRUTE, 99)).toBeCloseTo(1);
  });

  it('filters by ecology allowTags / denyTags and scales by tagWeights', () => {
    const ecology = TEST_FUNGAL_PIT.ecology;
    const pool = monstersForDanger(3, ecology);
    expect(pool.some((m) => m.id === TEST_SPORE_TOAD.id)).toBe(true);
    expect(pool.every((m) => m.tags.some((t) => t === 'beast' || t === 'fungus') && !m.tags.includes('giant'))).toBe(true);
    // Fungus tagWeight: 2 doubles Test Spore Toad's weight at its peak (4).
    expect(monsterWeightAt(TEST_SPORE_TOAD, 4, ecology)).toBeCloseTo(16);
    expect(monsterWeightAt(MONSTER_CAVERN_BRUTE, 9, ecology)).toBe(0);
  });

  it('selects peak-aligned monsters more often via pickWeightedForDanger', () => {
    const lowPeak: MonsterDef = { ...MONSTER_GLOAM_RAT, id: 'monster.test_low', danger: { min: 1, peak: 1, max: 10 }, weight: 10 };
    const highPeak: MonsterDef = { ...MONSTER_GLOAM_RAT, id: 'monster.test_high', danger: { min: 1, peak: 10, max: 10 }, weight: 10 };
    const rng = Rng.seeded(12, 'peak-test');
    let highCount = 0;
    for (let i = 0; i < 400; i++) {
      if (pickWeightedForDanger([lowPeak, highPeak], 10, rng).id === highPeak.id) highCount++;
    }
    expect(highCount).toBeGreaterThan(280);
  });

  it('uses floorDanger + depthShift and dungeon ecology in respawnFloor', () => {
    const state = createRun(
      {
        party: [HERO],
        dungeonId: TEST_FUNGAL_PIT.id,
        floorText: ['##################', '#@...............#', '##################'],
        monsters: false,
      },
      7,
    );
    const placed = respawnFloor(state, 'd1', { x: 1, y: 1 }, 1, { min: 3, max: 3, depthShift: 2, stairsDistance: 4 });
    expect(placed).toBe(3);
    // Floor 1 of TEST_FUNGAL_PIT has Danger 3; + depthShift 2 = Danger 5 (only beast/fungus allowed, no giant).
    const monsters = Object.values(state.entities).filter((e) => e.monster !== undefined);
    expect(monsters).toHaveLength(3);
    for (const m of monsters) {
      const def = MONSTERS.get(m.def);
      expect(def.danger.min).toBeLessThanOrEqual(5);
      expect(def.danger.max).toBeGreaterThanOrEqual(5);
      expect(def.tags.some((t) => t === 'beast' || t === 'fungus')).toBe(true);
      expect(def.tags).not.toContain('giant');
    }
  });
});

describe('innate MonsterDef.bundle (SOURCE_MONSTER_INNATE)', () => {
  it('applies HP modifiers without an overlay, credits stats to the monster def, fires triggers, and round-trips saves', () => {
    // spawnHp includes innate HP (+3 over base 5 = 8) even when overlay is undefined, and adds before mul like getStat.
    expect(spawnHp(TEST_SPORE_TOAD, undefined)).toBe(8);
    expect(spawnHp(TEST_SPORE_TOAD, { templates: ['template.hulking'] })).toBe(Math.round((5 + 3) * 1.5));

    const state = createRun({ party: [HERO], depth: 1, floorText: ['#######', '#@....#', '#######'], monsters: false }, 1);
    const hero = getEntity(state, state.party[0] as EntityId) as ActorEntity;
    const toad = spawnMonster(state, TEST_SPORE_TOAD.id, 'd1', { x: 3, y: 1 }) as ActorEntity;
    expect(toad.actor.hp).toBe(8);
    expect(statValue(state, toad, 'hp')).toBe(8);
    expect(statValue(state, toad, 'armor')).toBe(2);
    expect(getStat(state, toad, 'hp').parts).toContainEqual({
      op: 'add',
      value: 3,
      source: { id: TEST_SPORE_TOAD.id, label: TEST_SPORE_TOAD.name },
    });

    const hulkingToad = spawnMonster(state, TEST_SPORE_TOAD.id, 'd1', { x: 5, y: 1 }, { templates: ['template.hulking'] }) as ActorEntity;
    expect(hulkingToad.actor.hp).toBe(12);
    expect(statValue(state, hulkingToad, 'hp')).toBe(12);

    // Innate bundle visits before template bundles.
    const templated = spawnMonster(state, TEST_SPORE_TOAD.id, 'd1', { x: 4, y: 1 }, { templates: ['template.venomous'] });
    const sources: string[] = [];
    forEachBundle(state, templated, (_b, sourceId) => sources.push(sourceId));
    expect(sources).toEqual([TEST_SPORE_TOAD.id, 'template.venomous']);

    // Innate trigger fires on hit.
    fireTrigger(state, toad, 'trigger.hit', () => undefined, hero.id);
    expect(hero.stats?.statuses.some((s) => s.status === 'status.poisoned' && s.by?.id === toad.id)).toBe(true);

    // Save/load preserves innate stats cleanly.
    const loaded = deserialize(serialize(state));
    expect(stateHash(loaded)).toBe(stateHash(state));
    expect(statValue(loaded, getEntity(loaded, toad.id), 'hp')).toBe(8);
    expect(checkInvariants(loaded)).toEqual([]);
  });
});

describe('hidden dungeon depth secrecy & ETH-131 AI indistinguishability', () => {
  const F_STAIRS = [
    '#############',
    '#<@..+.....>#',
    '#############',
  ];
  const F_BOTTOM = [
    '#######',
    '#<....#',
    '#######',
  ];

  const makeFloors = (total: number) => Array.from({ length: total }, (_, i) => (i === total - 1 ? F_BOTTOM : F_STAIRS));

  it('hides depth in Snapshot and runStarted until bottom floor or FLAG_REVEAL_DEPTH, and omits "of N" in early leftCause', () => {
    const state = createRun({ party: [HERO], depth: 6, floorTexts: makeFloors(6), monsters: false }, 2);
    expect(depthRevealed(state)).toBe(false);
    expect(snapshot(state).domains.floors).toEqual({ depth: null, deepest: 1, depthRange: { min: 6, max: 6 } });

    const startEvents = step(state, []);
    const started = ofType(startEvents, 'runStarted')[0];
    expect(started?.depth).toBeNull();
    if (started !== undefined) {
      const log = describeEvent(started, () => 'Brannoc').text;
      expect(log).not.toContain('6');
      expect(log).not.toContain('floors deep');
    }

    // SimSession.debugDungeonDepth() exposes truth to headless tools without leaking onto Snapshot.
    const session = new SimSession({ party: [HERO], depth: 6, floorTexts: makeFloors(6), monsters: false }, 2);
    expect(session.debugDungeonDepth()).toBe(6);
    expect(session.snapshot().domains.floors.depth).toBeNull();

    // Early retreat omits `of 6` in runEnded cause.
    step(state, [{ type: 'retreat' }]);
    for (let i = 0; i < 60 && state.domains.run.end === null; i++) step(state, []);
    expect(state.domains.run.end?.outcome).toBe('retreat');
    expect(state.domains.run.end?.cause).toBe('The party reached floor 1, was ordered to retreat and walked out of the dungeon.');
  });

  it('reveals depth upon reaching the bottom floor or when FLAG_REVEAL_DEPTH is set', () => {
    const state = createRun({ party: [HERO], depth: 3, floorTexts: makeFloors(3), monsters: false }, 4);
    expect(snapshot(state).domains.floors.depth).toBeNull();
    for (let i = 0; i < 200 && state.domains.floors.deepest < 3; i++) step(state, []);
    expect(state.domains.floors.deepest).toBe(3);
    expect(depthRevealed(state)).toBe(true);
    expect(snapshot(state).domains.floors.depth).toBe(3);

    const revealedEarly = createRun(
      {
        party: [HERO],
        depth: 6,
        floorTexts: makeFloors(6),
        monsters: false,
        runModifiers: [{ key: 'cartographer.map', source: { id: 'bundle.test', label: 'Map' }, scope: 'party', flags: [FLAG_REVEAL_DEPTH] }],
      },
      4,
    );
    expect(depthRevealed(revealedEarly)).toBe(true);
    expect(snapshot(revealedEarly).domains.floors.depth).toBe(6);
    const startEv = ofType(step(revealedEarly, []), 'runStarted')[0];
    expect(startEv?.depth).toBe(6);

    step(revealedEarly, [{ type: 'retreat' }]);
    for (let i = 0; i < 60 && revealedEarly.domains.run.end === null; i++) step(revealedEarly, []);
    expect(revealedEarly.domains.run.end?.cause).toContain('reached floor 1 of 6');
  });

  it('makes identical AI chooseRule decisions across floors 1..5 for depth: 6 vs depth: 10 (ETH-131)', () => {
    const run6 = createRun({ party: [HERO], depth: 6, floorTexts: makeFloors(10), monsters: false }, 9);
    const run10 = createRun({ party: [HERO], depth: 10, floorTexts: makeFloors(10), monsters: false }, 9);
    const decisionOf = (state: RunState) => {
      const hero = getEntity(state, state.party[0] as EntityId) as AiActor;
      const choice = chooseRule({ state, actor: hero });
      return choice === null ? null : { action: choice.action, request: choice.request, detail: choice.detail };
    };

    for (let floor = 1; floor <= 5; floor++) {
      // Compare decisions throughout exploration and descent on each floor 1..5.
      for (let t = 0; t < 40; t++) {
        expect(decisionOf(run6), `floor ${floor} step ${t}`).toEqual(decisionOf(run10));
        const h6 = getEntity(run6, run6.party[0] as EntityId);
        const h10 = getEntity(run10, run10.party[0] as EntityId);
        expect(h6.floor).toBe(h10.floor);
        if (h6.floor === `d${floor + 1}`) break;
        const cmds: Command[] = [];
        step(run6, cmds);
        step(run10, cmds);
      }
      expect(getEntity(run6, run6.party[0] as EntityId).floor).toBe(`d${floor + 1}`);
      expect(getEntity(run10, run10.party[0] as EntityId).floor).toBe(`d${floor + 1}`);
    }

    // Also test identical chooseRule when retreating or hurt on floor 5 of depth 6 vs depth 10.
    const h6 = getEntity(run6, run6.party[0] as EntityId) as ActorEntity;
    const h10 = getEntity(run10, run10.party[0] as EntityId) as ActorEntity;
    ensureFloor(run6, 'd5');
    ensureFloor(run10, 'd5');
    h6.actor.hp = 4;
    h10.actor.hp = 4;
    expect(decisionOf(run6)).toEqual(decisionOf(run10));
  });
});
