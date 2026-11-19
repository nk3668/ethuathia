/**
 * Monster templates and overlays (ETH-117), on a hand-built room with fixed seeds: templated stats
 * with credited tooltip parts, names, threat, template bundles and role changes, a profile-style
 * overlay with a name and a carried item, generation with `templateChance`, Codex discoveries
 * and a save/load round-trip.
 */
import { describe, expect, it } from 'vitest';
import { Rng } from '../../src/core';
import { CASTER_RULES, FLOOR_HALLS, MONSTER_TEMPLATE_KIND, MONSTER_TEMPLATES, MONSTERS, templateFits } from '../../src/content';
import type { FloorTypeDef } from '../../src/content';
import {
  checkGame,
  checkInvariants,
  createRun,
  deathPredicate,
  deserialize,
  discoveriesOf,
  forEachBundle,
  generateFloor,
  getEntity,
  getStat,
  itemsAt,
  killActor,
  killerOf,
  monsterLootTier,
  monsterName,
  monsterThreat,
  newItem,
  planToText,
  rolePowers,
  serialize,
  shownName,
  snapshot,
  spawnMonster,
  stateHash,
  statValue,
  templateMetKey,
  templatesMet,
} from '../../src/sim';
import type { ActorEntity, MonsterOverlay, RunState, SimEvent } from '../../src/sim';
import { fireTrigger } from '../../src/sim/stats/effects';

const HERO = { name: 'Brannoc', classId: 'class.vanguard', raceId: 'race.human' };
const ROOM = ['###########', '#@........#', '#.........#', '#.........#', '###########'];

function setup(seed = 1): { state: RunState; hero: ActorEntity } {
  const state = createRun({ party: [HERO], floorText: ROOM, depth: 1 }, seed);
  return { state, hero: getEntity(state, state.party[0] as number) as ActorEntity };
}

/** Collects emitted events (with a dummy turn) for direct calls to sim helpers. */
function collector(): { events: SimEvent[]; emit: (e: Omit<SimEvent, 'turn'>) => void } {
  const events: SimEvent[] = [];
  return { events, emit: (e) => events.push({ ...e, turn: 0 } as SimEvent) };
}

describe('template content', () => {
  it('is valid, and every template has Codex text and a name part', () => {
    expect(checkGame()).toEqual([]);
    expect(MONSTER_TEMPLATES.all().length).toBeGreaterThanOrEqual(4);
    for (const t of MONSTER_TEMPLATES.all()) {
      expect(t.description.length).toBeGreaterThan(20);
      expect(t.prefix ?? t.suffix).toBeDefined();
    }
  });

  it('rejects a caster template without a bolt and a template without a name part', () => {
    const base = { id: 'template.bad', name: 'Bad', description: 'Bad.', tags: [], threatMul: 1, lootTier: 0, weight: 1 };
    expect(MONSTER_TEMPLATE_KIND.schema.safeParse({ ...base, prefix: 'Bad', role: 'caster' }).success).toBe(false);
    expect(MONSTER_TEMPLATE_KIND.schema.safeParse(base).success).toBe(false);
    expect(MONSTER_TEMPLATE_KIND.schema.safeParse({ ...base, prefix: 'Bad' }).success).toBe(true);
  });
});

describe('a templated monster', () => {
  it('has the template’s stats, credited in tooltips, spawns at full HP, and is named and weighed by it', () => {
    const { state } = setup();
    const rat = spawnMonster(state, 'monster.gloam_rat', 'd1', { x: 8, y: 2 }, { templates: ['template.hulking'] }) as ActorEntity;
    // 3 HP × 1.5 = 4.5, rounded to 5; damage 0 + 1.
    expect(statValue(state, rat, 'hp')).toBe(5);
    expect(rat.actor.hp).toBe(5);
    expect(statValue(state, rat, 'damage')).toBe(1);
    const hp = getStat(state, rat, 'hp');
    expect(hp.parts).toContainEqual({ op: 'mul', value: 1.5, source: { id: 'template.hulking', label: 'Hulking' } });
    expect(getStat(state, rat, 'damage').parts).toContainEqual({ op: 'add', value: 1, source: { id: 'template.hulking', label: 'Hulking' } });
    expect(monsterName(rat)).toBe('Hulking gloam rat');
    expect(shownName(rat)).toEqual({ name: 'Hulking gloam rat' });
    expect(monsterThreat(rat)).toBe(2);
    expect(monsterLootTier(rat)).toBe(1);
    expect(checkInvariants(state)).toEqual([]);
  });

  it('names two templates as two prefixes and multiplies their threat', () => {
    const { state } = setup();
    const hound = spawnMonster(state, 'monster.slate_hound', 'd1', { x: 8, y: 2 }, { templates: ['template.swift', 'template.venomous'] });
    expect(monsterName(hound)).toBe('Swift venomous slate hound');
    // 4 × 1.5 × 1.5 = 9.
    expect(monsterThreat(hound)).toBe(9);
    expect(statValue(state, hound, 'speed')).toBe(Math.round(110 * 1.3));
  });

  it('carries its template’s bundle, whose hit trigger poisons the one it struck', () => {
    const { state, hero } = setup();
    const rat = spawnMonster(state, 'monster.gloam_rat', 'd1', { x: 2, y: 1 }, { templates: ['template.venomous'] });
    const sources: string[] = [];
    forEachBundle(state, rat, (_b, source, _p, label) => sources.push(`${source}:${label ?? ''}`));
    expect(sources).toEqual(['template.venomous:Venomous']);
    const { emit } = collector();
    fireTrigger(state, rat, 'trigger.hit', emit, hero.id);
    expect(hero.stats?.statuses.map((s) => [s.status, s.by?.id])).toEqual([['status.poisoned', rat.id]]);
  });

  it('fights by the role a template gives it, with the template’s powers', () => {
    const { state } = setup();
    const gnawer = spawnMonster(state, 'monster.bone_gnawer', 'd1', { x: 8, y: 2 }, { templates: ['template.hexspitting'] });
    expect(gnawer.ai?.rules.map((r) => r.action.id)).toEqual(CASTER_RULES.map((r) => r.action.id));
    expect(rolePowers(gnawer).bolt).toEqual({ range: 4, name: 'sour hex' });
  });

  it('refuses a malformed overlay', () => {
    const { state } = setup();
    const at = { x: 8, y: 2 };
    expect(() => spawnMonster(state, 'monster.gloam_rat', 'd1', at, { templates: ['template.nope'] })).toThrow(/unknown template/);
    expect(() =>
      spawnMonster(state, 'monster.gloam_rat', 'd1', at, { templates: ['template.swift', 'template.hulking', 'template.venomous'] }),
    ).toThrow(/at most 2/);
    expect(() => spawnMonster(state, 'monster.mossling', 'd1', at, { templates: ['template.venomous'] })).toThrow(/doesn't fit/);
    expect(() => spawnMonster(state, 'monster.gloam_rat', 'd1', at, { stats: { add: { luck: 2 } } } as unknown as MonsterOverlay)).toThrow(
      /unknown stat/,
    );
  });
});

describe('a profile-style overlay', () => {
  const VELL: MonsterOverlay = {
    name: 'Vell',
    title: 'the Unbowed',
    stats: { add: { hp: 5 } },
    threatMul: 3,
    lootTier: 2,
    carries: [newItem('item.mending_draught')],
  };

  it('names the monster, credits its own stats to it, and shows it to the party by name', () => {
    const { state } = setup();
    const vell = spawnMonster(state, 'monster.gloam_rat', 'd1', { x: 3, y: 1 }, VELL) as ActorEntity;
    expect(monsterName(vell)).toBe('Vell the Unbowed');
    expect(shownName(vell)).toEqual({ name: 'Vell the Unbowed', proper: true });
    expect(vell.actor.hp).toBe(8);
    expect(getStat(state, vell, 'hp').parts).toContainEqual({ op: 'add', value: 5, source: { id: 'monster.gloam_rat', label: 'Vell the Unbowed' } });
    expect(monsterThreat(vell)).toBe(3);
    expect(monsterLootTier(vell)).toBe(2);
    expect(snapshot(state).floor.actors.find((a) => a.id === vell.id)?.name).toBe('Vell the Unbowed');
    expect(checkInvariants(state)).toEqual([]);
  });

  it('drops what it carries where it dies, and its kill weighs its threat', () => {
    const { state, hero } = setup();
    const vell = spawnMonster(state, 'monster.gloam_rat', 'd1', { x: 3, y: 1 }, VELL) as ActorEntity;
    const { events, emit } = collector();
    vell.actor.hp = 0;
    killActor(state, vell, emit, { cause: hero.def, killer: hero });
    const killed = events.find((e) => e.type === 'killed');
    expect(killed).toMatchObject({ threat: 3, names: { [vell.id]: { name: 'Vell the Unbowed', proper: true } } });
    expect(events.find((e) => e.type === 'died')).toMatchObject({
      name: 'Vell the Unbowed',
      proper: true,
      drops: [{ item: 'item.mending_draught', qty: 1 }],
    });
    expect(itemsAt(state, 'd1', { x: 3, y: 1 }).map((e) => e.item.def)).toEqual(['item.mending_draught']);
    expect(checkInvariants(state)).toEqual([]);
  });

  it('is named as the killer of an adventurer it strikes down', () => {
    const { state, hero } = setup();
    const vell = spawnMonster(state, 'monster.gloam_rat', 'd1', { x: 2, y: 1 }, VELL);
    const { events, emit } = collector();
    hero.actor.hp = 0;
    killActor(state, hero, emit, { cause: vell.def, killer: vell });
    const killer = killerOf(state, hero, events, 0);
    expect(killer).toMatchObject({ kind: 'monster', name: 'Vell the Unbowed', proper: true });
    expect(deathPredicate(killer)).toBe('was slain by Vell the Unbowed');
  });

  it('survives a save and load', () => {
    const { state } = setup();
    spawnMonster(state, 'monster.gloam_rat', 'd1', { x: 3, y: 1 }, VELL);
    spawnMonster(state, 'monster.slate_hound', 'd1', { x: 6, y: 2 }, { templates: ['template.swift'] });
    const loaded = deserialize(serialize(state));
    expect(stateHash(loaded)).toBe(stateHash(state));
    const names = Object.values(loaded.entities)
      .filter((e) => e.monster !== undefined)
      .map(monsterName);
    expect(names).toEqual(['Vell the Unbowed', 'Swift slate hound']);
    expect(checkInvariants(loaded)).toEqual([]);
  });
});

describe('generation', () => {
  const halls = (templateChance?: number): FloorTypeDef => ({
    ...FLOOR_HALLS,
    steps: FLOOR_HALLS.steps.map((s) =>
      s.step === 'gen.monsters' ? { step: 'gen.monsters', params: { base: 6, ...(templateChance === undefined ? {} : { templateChance }) } } : s,
    ),
  });

  it('leaves floors as they were without templateChance', () => {
    const plain = generateFloor(halls(), Rng.seeded(7, 'dungeon'), { depth: 4 });
    const zero = generateFloor(halls(0), Rng.seeded(7, 'dungeon'), { depth: 4 });
    expect(planToText(zero)).toEqual(planToText(plain));
    expect(zero.spawns).toEqual(plain.spawns);
    expect(plain.spawns?.every((s) => s.monster?.overlay === undefined)).toBe(true);
  });

  it('puts one or two fitting templates on monsters when asked, at full HP', () => {
    const plan = generateFloor(halls(1), Rng.seeded(7, 'dungeon'), { depth: 4 });
    expect(plan.spawns?.length).toBeGreaterThan(0);
    for (const s of plan.spawns ?? []) {
      const templates = s.monster?.overlay?.templates ?? [];
      expect(templates.length).toBeGreaterThanOrEqual(1);
      expect(templates.length).toBeLessThanOrEqual(2);
      for (const t of templates) expect(templateFits(MONSTER_TEMPLATES.get(t), MONSTERS.get(s.def))).toBe(true);
    }
  });
});

describe('Codex', () => {
  it('discovers a sighted monster’s templates and records them as met on its kind', () => {
    const found = discoveriesOf({
      type: 'monsterSighted',
      turn: 1,
      actor: 1,
      monster: 2,
      def: 'monster.gloam_rat',
      floor: 'd1',
      pos: { x: 1, y: 1 },
      templates: ['template.swift'],
    });
    expect(found).toEqual([
      { id: 'monster.gloam_rat', mark: 'seen' },
      { id: 'template.swift', mark: 'seen' },
      { id: templateMetKey('monster.gloam_rat', 'template.swift'), mark: 'seen' },
    ]);
    const discovered = Object.fromEntries(found.map((d) => [d.id, [d.mark]]));
    expect(templatesMet(discovered, 'monster.gloam_rat').map((t) => t.id)).toEqual(['template.swift']);
    expect(templatesMet(discovered, 'monster.slate_hound')).toEqual([]);
  });
});
