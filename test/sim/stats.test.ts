/**
 * The stats domain (ETH-057): `getStat` with sources, bundles, timed statuses and their stacking
 * rules, the effect interpreter, triggers, turn hooks and invariants.
 */
import { describe, expect, it } from 'vitest';
import { bundleRefs, defineBundle, defineStatus } from '../../src/content';
import type { EffectKind } from '../../src/content';
import {
  addEntity,
  applyStatus,
  attachBundle,
  BUNDLE_SOURCES,
  checkGame,
  checkInvariants,
  createRun,
  detachBundles,
  discoveriesOf,
  fieldOfView,
  fireTrigger,
  getEntity,
  getStat,
  newStatsPart,
  removeStatus,
  runEffect,
  snapshot,
  STAT_IDS,
  STAT_PROVIDERS,
  statValue,
  step,
  tickStatuses,
  TRIGGERS,
  waitDecide,
} from '../../src/sim';
import type { ActorEntity, Entity, EntityId, RunConfig, RunState, SimEvent, SimEventBody } from '../../src/sim';

// Test content: registered once for this file (each test file has its own module registry).
const MIGHT = defineBundle({
  id: 'bundle.test_might',
  name: 'Test Might',
  description: 'A test bundle.',
  tags: [],
  bundle: {
    modifiers: [
      { stat: 'hp', op: 'add', value: 10 },
      { stat: 'hp', op: 'mul', value: 1.5 },
      { stat: 'damage', op: 'add', value: 3 },
    ],
  },
});
const SMALL_FEAST = defineStatus({
  id: 'status.test_small_feast',
  name: 'Small Feast',
  description: 'A test food buff.',
  tags: [],
  bundle: { modifiers: [{ stat: 'hp', op: 'add', value: 2 }] },
  stacking: 'refresh',
  group: 'status.test_feast',
  harmful: false,
  glyph: { ch: 'f', color: '#ffffff' },
});
const BIG_FEAST = defineStatus({
  ...SMALL_FEAST,
  id: 'status.test_big_feast',
  name: 'Big Feast',
});
const THORNS = defineStatus({
  id: 'status.test_thorns',
  name: 'Thorns',
  description: 'A test trigger aimed at the other party.',
  tags: [],
  bundle: { triggers: [{ on: 'trigger.test_struck', effects: [{ kind: 'damage', amount: 2, to: 'other' }] }] },
  stacking: 'refresh',
  harmful: false,
  glyph: { ch: 't', color: '#ffffff' },
});

/** An emit that drops events. */
const noop = (): void => undefined;

const ROOM = ['#######', '#@....#', '#.....#', '#######'];
const CONFIG: RunConfig = { party: [{ name: 'Mira', classId: 'class.vanguard', raceId: 'race.human' }], floorText: ROOM };

function setup(config: RunConfig = CONFIG): { state: RunState; hero: ActorEntity; events: SimEventBody[]; emit: (e: SimEventBody) => void } {
  const state = createRun(config, 1);
  const hero = getEntity(state, state.party[0] as EntityId) as ActorEntity;
  // Start bare-handed: the Vanguard's class kit (ETH-176) is covered by classKit.test.ts.
  Reflect.deleteProperty(hero, 'inventory');
  const events: SimEventBody[] = [];
  return { state, hero, events, emit: (e) => events.push(e) };
}

function addDummy(state: RunState, hp = 10, speed = 0, pos = { x: 5, y: 2 }): ActorEntity {
  return addEntity(state, {
    def: 'monster.test',
    floor: 'd1',
    pos,
    actor: { energy: 0, hp, mp: 0, faction: 'monster' },
    stats: newStatsPart({ hp, speed }),
  }) as ActorEntity;
}

function statusesOf(entity: Entity): [string, number, number][] {
  return (entity.stats?.statuses ?? []).map((s) => [s.status, s.remaining, s.potency]);
}

describe('getStat', () => {
  it('derives an adventurer from its attributes and race, with each source labeled', () => {
    const { state, hero } = setup();
    expect(getStat(state, hero, 'hp')).toEqual({
      stat: 'hp',
      value: 20,
      parts: [
        { op: 'add', value: 14, source: { id: 'attribute.grit', label: 'Grit 14' } },
        { op: 'add', value: 6, source: { id: 'attribute.brawn', label: 'Brawn 12' } },
      ],
    });
    expect(getStat(state, hero, 'speed').parts).toEqual([{ op: 'add', value: 100, source: { id: 'race.human', label: 'Human' } }]);
    expect(getStat(state, hero, 'speed').value).toBe(100);
    expect(getStat(state, hero, 'sight')).toMatchObject({ value: 8, parts: [{ op: 'add', value: 8, source: { label: 'Base' } }] });
  });

  it('sums add parts, then applies mul parts, whatever order they come in', () => {
    const { state, hero } = setup();
    attachBundle(state, hero, MIGHT.id, 'class.vanguard');
    // (14 + 6 + 10) × 1.5
    const hp = getStat(state, hero, 'hp');
    expect(hp.value).toBe(45);
    expect(hp.parts.map((p) => [p.op, p.value, p.source.label])).toEqual([
      ['add', 14, 'Grit 14'],
      ['add', 6, 'Brawn 12'],
      ['add', 10, 'Vanguard'],
      ['mul', 1.5, 'Vanguard'],
    ]);
    // Brawn 12: +1, then the bundle's +3.
    expect(statValue(state, hero, 'damage')).toBe(4);
  });

  it('agrees with statValue for every stat', () => {
    const { state, hero, emit } = setup();
    attachBundle(state, hero, MIGHT.id);
    applyStatus(state, hero, 'status.hasted', 3, emit);
    applyStatus(state, hero, 'status.dazzled', 3, emit, 0.5);
    for (const stat of STAT_IDS) expect(statValue(state, hero, stat)).toBe(getStat(state, hero, stat).value);
  });

  it('rounds and clamps to each stat minimum', () => {
    const { state, hero } = setup();
    const stats = hero.stats as NonNullable<Entity['stats']>;
    stats.base.sight = -20;
    expect(statValue(state, hero, 'sight')).toBe(0);
    stats.base.hp = -100;
    expect(statValue(state, hero, 'hp')).toBe(1);
    stats.base.hp = 0.6;
    expect(statValue(state, hero, 'hp')).toBe(21);
  });

  it('is fed by the stats domain providers and bundle sources, in order', () => {
    expect(STAT_PROVIDERS.map((p) => p.id)).toEqual(['stats.base', 'stats.class_race', 'stats.attributes', 'combat.overlay']);
    expect(BUNDLE_SOURCES.map((s) => s.id)).toEqual([
      'stats.attached',
      'stats.statuses',
      'stats.run',
      'combat.innate',
      'combat.templates',
      'items.equipped',
    ]);
    expect(TRIGGERS.has('trigger.turn_start') && TRIGGERS.has('trigger.turn_end')).toBe(true);
  });
});

describe('bundles', () => {
  it('attach without healing and detach by source, clamping HP back down', () => {
    const { state, hero } = setup();
    attachBundle(state, hero, MIGHT.id, 'item.test_ring');
    expect(hero.actor.hp).toBe(20);
    hero.actor.hp = 45;
    expect(detachBundles(state, hero, 'item.test_ring')).toBe(1);
    expect(hero.actor.hp).toBe(20);
    expect(hero.stats?.bundles).toEqual([]);
  });

  it('refuse an id that carries no bundle', () => {
    const { state, hero } = setup();
    expect(() => attachBundle(state, hero, 'class.vanguard')).toThrow(/has no bundle/);
    expect(() => attachBundle(state, hero, 'bundle.nope')).toThrow(/Unknown bundle/);
  });

  it('can be given to the party by the run config', () => {
    const { state, hero } = setup({ ...CONFIG, partyBundles: [MIGHT.id], partyStatuses: [{ status: 'status.hasted', turns: 4 }] });
    expect(hero.actor.hp).toBe(statValue(state, hero, 'hp'));
    expect(hero.actor.hp).toBe(45);
    expect(statusesOf(hero)).toEqual([['status.hasted', 4, 1]]);
    expect(() => setup({ ...CONFIG, partyStatuses: [{ status: 'status.nope', turns: 1 }] })).toThrow(/Unknown party status/);
  });

  it('list the ids they mention for validation', () => {
    expect(bundleRefs('bundle', THORNS.bundle).map((r) => `${r.kind}:${r.id}`)).toEqual(['trigger:trigger.test_struck']);
    // The shipped content and its stats, statuses and trigger kinds all check out.
    expect(checkGame().filter((p) => !p.includes('test_'))).toEqual([]);
  });
});

describe('timed statuses', () => {
  it('refresh: one per group, the longer duration and the stronger potency win', () => {
    const { state, hero, emit, events } = setup();
    applyStatus(state, hero, SMALL_FEAST.id, 5, emit, 1);
    applyStatus(state, hero, BIG_FEAST.id, 3, emit, 2);
    expect(statusesOf(hero)).toEqual([['status.test_big_feast', 5, 2]]);
    applyStatus(state, hero, SMALL_FEAST.id, 9, emit, 1);
    expect(statusesOf(hero)).toEqual([['status.test_big_feast', 9, 2]]);
    expect(events.map((e) => (e.type === 'statusApplied' ? e.mode : e.type))).toEqual(['new', 'refreshed', 'refreshed']);
    // Potency 2 doubles the +2 HP.
    expect(statValue(state, hero, 'hp')).toBe(24);
  });

  it('different groups stack side by side', () => {
    const { state, hero, emit } = setup();
    applyStatus(state, hero, SMALL_FEAST.id, 5, emit);
    applyStatus(state, hero, 'status.hasted', 5, emit);
    expect(statusesOf(hero).map((s) => s[0])).toEqual(['status.test_small_feast', 'status.hasted']);
    expect(statValue(state, hero, 'speed')).toBe(150);
  });

  it('extend: adds the turns', () => {
    const { state, hero, emit } = setup();
    // Not resistible: these tests are about stacking, not Grit (ETH-081).
    applyStatus(state, hero, 'status.dazzled', 4, emit, 1, false);
    applyStatus(state, hero, 'status.dazzled', 3, emit, 1, false);
    expect(statusesOf(hero)).toEqual([['status.dazzled', 7, 1]]);
  });

  it('stack: separate instances up to maxStacks, then the shortest is replaced', () => {
    const { state, hero, emit } = setup();
    for (const turns of [5, 2, 7, 4]) applyStatus(state, hero, 'status.poisoned', turns, emit, 1, false);
    expect(statusesOf(hero)).toEqual([
      ['status.poisoned', 5, 1],
      ['status.poisoned', 4, 1],
      ['status.poisoned', 7, 1],
    ]);
  });

  it('tick down once per holder turn and expire with an event', () => {
    const { state, hero } = setup();
    applyStatus(state, hero, 'status.hasted', 2, noop);
    const all: SimEvent[] = [];
    for (let i = 0; i < 3; i++) all.push(...step(state, [], { decide: waitDecide }));
    const expired = all.filter((e) => e.type === 'statusExpired');
    expect(expired).toEqual([{ type: 'statusExpired', actor: hero.id, status: 'status.hasted', turn: expired[0]?.turn }]);
    expect(statusesOf(hero)).toEqual([]);
  });

  it('change how often the holder acts and how far it sees', () => {
    const { state, hero } = setup();
    const before = fieldOfView(state, hero).length;
    applyStatus(state, hero, 'status.dazzled', 50, noop);
    expect(fieldOfView(state, hero).length).toBeLessThanOrEqual(before);
    expect(statValue(state, hero, 'sight')).toBe(5);

    const plain = addDummy(state, 10, 100, { x: 5, y: 1 });
    const hasted = addDummy(state, 10, 100);
    applyStatus(state, hasted, 'status.hasted', 500, noop);
    const turns = new Map<EntityId, number>();
    for (let i = 0; i < 40; i++) {
      for (const e of step(state, [], { decide: waitDecide })) {
        if (e.type === 'waited') turns.set(e.actor, (turns.get(e.actor) ?? 0) + 1);
      }
    }
    // Speed 150 against 100: half again as many turns, give or take the step boundary.
    expect(Math.abs((turns.get(hasted.id) ?? 0) - 1.5 * (turns.get(plain.id) ?? 0))).toBeLessThanOrEqual(2);
  });

  it('are cured by group, and never land on the dead', () => {
    const { state, hero, emit, events } = setup();
    applyStatus(state, hero, SMALL_FEAST.id, 5, emit);
    expect(removeStatus(state, hero, BIG_FEAST.id, emit)).toBe(1);
    expect(events.at(-1)).toEqual({ type: 'statusRemoved', actor: hero.id, status: SMALL_FEAST.id });
    hero.actor.hp = 0;
    expect(applyStatus(state, hero, 'status.hasted', 3, emit)).toBe(false);
    expect(() => applyStatus(state, hero, 'status.hasted', 0, emit)).toThrow(/whole turns/);
  });

  it('expire while the holder waits, leaving nothing behind', () => {
    const { state, hero } = setup();
    applyStatus(state, hero, 'status.poisoned', 1, noop);
    tickStatuses(state, hero, noop);
    expect(hero.stats?.statuses).toEqual([]);
  });
});

describe('effects and triggers', () => {
  it('regeneration heals and poison hurts at the start of each turn, scaled by potency', () => {
    const { state, hero } = setup();
    hero.actor.hp = 10;
    applyStatus(state, hero, 'status.regenerating', 3, noop);
    const events = step(state, [], { decide: waitDecide });
    expect(events.find((e) => e.type === 'healed')).toMatchObject({ actor: hero.id, amount: 1, source: 'status.regenerating' });
    expect(hero.actor.hp).toBe(11);

    applyStatus(state, hero, 'status.poisoned', 3, noop, 3);
    const next = step(state, [], { decide: waitDecide });
    expect(next.find((e) => e.type === 'damaged')).toMatchObject({ actor: hero.id, amount: 3, source: 'status.poisoned' });
  });

  it('never heals above max HP, and lethal damage stops the actor before it acts', () => {
    const { state, hero, emit, events } = setup();
    runEffect({ state, emit, self: hero.id, source: 'test', potency: 1 }, { kind: 'heal', amount: 5 });
    expect(events).toEqual([]);
    hero.actor.hp = 1;
    hero.actor.queued = { id: 'wait' };
    applyStatus(state, hero, 'status.poisoned', 3, emit);
    const stepped = step(state, []);
    expect(hero.actor.hp).toBe(0);
    expect(hero.actor.queued).toBeUndefined();
    // The run domain notices the fall (ETH-062): the lone hero's death ends the run as a wipe.
    expect(stepped.filter((e) => 'actor' in e && e.actor === hero.id && e.type !== 'kitIssued').map((e) => e.type)).toEqual(['damaged', 'fell']);
    expect(stepped.at(-1)).toMatchObject({ type: 'runEnded', outcome: 'wipe' });
    expect(checkInvariants(state)).toEqual([]);
  });

  it('fire for the kind asked, with effects aimed at the other party', () => {
    const { state, hero, emit, events } = setup();
    const foe = addDummy(state, 10);
    applyStatus(state, hero, THORNS.id, 5, emit);
    expect(fireTrigger(state, hero, 'trigger.turn_start', emit, foe.id)).toBe(0);
    expect(fireTrigger(state, hero, 'trigger.test_struck', emit, foe.id)).toBe(1);
    expect(foe.actor.hp).toBe(8);
    expect(hero.actor.hp).toBe(20);
    // With no other party, an effect aimed at it does nothing.
    fireTrigger(state, hero, 'trigger.test_struck', emit);
    expect(events.filter((e) => e.type === 'damaged')).toHaveLength(1);
  });

  it('applyStatus effects land on their target', () => {
    const { state, hero, emit } = setup();
    runEffect({ state, emit, self: hero.id, source: 'test', potency: 1 }, { kind: 'applyStatus', status: 'status.hasted', turns: 2, potency: 2 });
    expect(statusesOf(hero)).toEqual([['status.hasted', 2, 2]]);
    expect(statValue(state, hero, 'speed')).toBe(200);
  });
});

describe('snapshot and invariants', () => {
  it('show each party member with statuses and stats with sources', () => {
    const { state, hero } = setup();
    applyStatus(state, hero, 'status.hasted', 4, noop);
    const view = snapshot(state).domains.stats.members[hero.id];
    expect(view?.statuses).toEqual([{ status: 'status.hasted', remaining: 4, potency: 1 }]);
    expect(view?.stats.speed.parts.map((p) => p.source.label)).toEqual(['Human', 'Hasted']);
    expect(snapshot(state).party[0]).toMatchObject({ hp: 20, maxHp: 20 });
  });

  it('discover a status for the Codex when it lands', () => {
    expect(
      discoveriesOf({ type: 'statusApplied', turn: 1, actor: 1, status: 'status.poisoned', turns: 3, potency: 1, mode: 'new' }),
    ).toEqual([{ id: 'status.poisoned', mark: 'seen' }]);
  });

  it('catch statuses out of turns, unknown ids and non-finite values', () => {
    const { state, hero, emit } = setup();
    applyStatus(state, hero, 'status.hasted', 4, emit);
    const stats = hero.stats as NonNullable<Entity['stats']>;
    (stats.statuses[0] as { remaining: number }).remaining = 0;
    stats.bundles.push({ bundle: 'bundle.nope' });
    stats.base.speed = Number.POSITIVE_INFINITY;
    const problems = checkInvariants(state);
    expect(problems).toContainEqual(expect.stringMatching(/^\[stats\.parts\] .*status "status\.hasted" with 0 turns left/));
    expect(problems).toContainEqual(expect.stringMatching(/^\[stats\.parts\] .*unknown bundle "bundle\.nope"/));
  });
});

describe('exhaustive Effect potency contract (ETH-131)', () => {
  const EFFECT_POTENCY_CASES: Record<EffectKind, () => void> = {
    heal: () => {
      for (const [potency, expected] of [[0.5, 5], [1, 10], [1.5, 15]] as const) {
        const { state, hero, emit } = setup();
        if (hero.stats !== undefined) hero.stats.base.hp = 40;
        hero.actor.hp = 1;
        runEffect({ state, emit, self: hero.id, source: 'test', potency }, { kind: 'heal', amount: 10 });
        expect(hero.actor.hp, `heal @ ${potency}`).toBe(1 + expected);
      }
    },
    damage: () => {
      for (const [potency, expected] of [[0.5, 5], [1, 10], [1.5, 15]] as const) {
        const { state, hero, emit } = setup();
        hero.actor.hp = 20;
        runEffect({ state, emit, self: hero.id, source: 'test', potency }, { kind: 'damage', amount: 10 });
        expect(hero.actor.hp, `damage @ ${potency}`).toBe(20 - expected);
      }
    },
    applyStatus: () => {
      for (const [potency, expected] of [[0.5, 4], [1, 8], [1.5, 12], [2, 16]] as const) {
        const { state, hero, emit } = setup();
        runEffect({ state, emit, self: hero.id, source: 'test', potency }, { kind: 'applyStatus', status: 'status.hasted', turns: 8 });
        expect(statusesOf(hero), `applyStatus @ ${potency}`).toEqual([['status.hasted', expected, 1]]);
      }
    },
    identify: () => {
      for (const [potency, expectedIdentified] of [[0.5, 1], [1, 1], [1.5, 2]] as const) {
        const { state, hero, emit, events } = setup();
        hero.inventory = {
          items: [
            { def: 'item.iron_hatchet', qty: 1, enchant: 1, identified: false },
            { def: 'item.arming_sword', qty: 1, enchant: 1, identified: false },
          ],
        };
        runEffect({ state, emit, self: hero.id, source: 'test', potency }, { kind: 'identify' });
        expect(events.filter((e) => e.type === 'itemIdentified'), `identify @ ${potency}`).toHaveLength(expectedIdentified);
      }
    },
    uncurse: () => {
      for (const [potency, expectedUncursed] of [[0.5, 1], [1, 1], [1.5, 2]] as const) {
        const { state, hero, emit, events } = setup();
        hero.inventory = {
          items: [{ def: 'item.arming_sword', qty: 1, blessing: 'cursed' }],
          equipped: { mainHand: { def: 'item.iron_hatchet', qty: 1, blessing: 'cursed' } },
        };
        runEffect({ state, emit, self: hero.id, source: 'test', potency }, { kind: 'uncurse' });
        expect(events.filter((e) => e.type === 'itemUncursed'), `uncurse @ ${potency}`).toHaveLength(expectedUncursed);
      }
    },
  };

  for (const [kind, verify] of Object.entries(EFFECT_POTENCY_CASES)) {
    it(`honors ctx.potency for "${kind}"`, verify);
  }
});
