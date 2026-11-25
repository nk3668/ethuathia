/**
 * Tactic options at work (ETH-162) on a hand-built hall with a fixed seed: a Healer using its
 * healing, the tag fallback in the trace, swapping mid-run with `setTactics`, party stances, the
 * focus parameter reaching `act.attack_adjacent`, rejected commands, and that nothing ever
 * switches tactics on its own.
 */
import { describe, expect, it } from 'vitest';
import { FOCUS_STRONGEST, HABIT_QUICK_TO_QUAFF, ROLE_DAMAGE, ROLE_HEALER, STANCE_FALL_BACK } from '../../src/content';
import { checkInvariants, chooseRule, createRun, defaultPicks, deserialize, getEntity, serialize, spawnMonster, step } from '../../src/sim';
import type { ActorEntity, AdventurerConfig, AiActor, Command, EntityId, RunState, SimEvent } from '../../src/sim';

const HERO: AdventurerConfig = { name: 'Brannoc', classId: 'class.reaver', raceId: 'race.human' };
const ALLY: AdventurerConfig = { name: 'Mira', classId: 'class.outrider', raceId: 'race.human' };
const DRAUGHT = 'item.mending_draught';
const WALL = '#'.repeat(40);
// Long enough that most of it is unexplored, so the baseline explores rather than turns back.
const HALL = [WALL, '#<@' + '.'.repeat(36) + '#', '#' + '.'.repeat(38) + '#', WALL];

type RuleFired = Extract<SimEvent, { type: 'ruleFired' }>;
const fired = (events: SimEvent[]): RuleFired[] => events.filter((e): e is RuleFired => e.type === 'ruleFired');
const rejected = (events: SimEvent[]) => events.filter((e) => e.type === 'commandRejected');

function hall(party = [HERO], seed = 3): { state: RunState; hero: AiActor; maxHp: number } {
  const state = createRun({ party, floorText: HALL, depth: 1, monsters: false }, seed);
  const hero = getEntity(state, state.party[0] as EntityId) as AiActor;
  return { state, hero, maxHp: hero.actor.hp };
}

/** The hero's decision this step. */
function decide(state: RunState, hero: ActorEntity, commands: Command[] = []): RuleFired {
  const f = fired(step(state, commands)).find((e) => e.actor === hero.id);
  if (f === undefined) throw new Error('the hero did not decide');
  return f;
}

/** Below the Healer's 50% line but above the baseline's 35% quaff line, with one draught in the pack. */
function wound(hero: AiActor, maxHp: number): void {
  hero.actor.hp = Math.round(maxHp * 0.4);
  hero.inventory = { items: [{ def: DRAUGHT, qty: 1 }] };
}

const setRole = (hero: ActorEntity, role: string): Command => ({ type: 'setTactics', actor: hero.id, role });

describe('a Healer', () => {
  it('uses its best healing, and the trace names the option', () => {
    const { state, hero, maxHp } = hall([{ ...HERO, tactics: { role: ROLE_HEALER.id } }]);
    wound(hero, maxHp);
    const f = decide(state, hero);
    expect(f.rule).toEqual({ set: 'own', index: 0, option: ROLE_HEALER.id });
    expect(f.action).toBe('act.use_ability');
    expect(f.detail).toMatch(/^Healer: using .*Mending draught/);
    expect(hero.actor.hp).toBeGreaterThan(Math.round(maxHp * 0.4));
  });

  it('plays the baseline above the line, and a Damage role at 40% HP does not quaff early', () => {
    const { state, hero, maxHp } = hall([{ ...HERO, tactics: { role: ROLE_HEALER.id } }]);
    hero.actor.hp = maxHp;
    hero.inventory = { items: [{ def: DRAUGHT, qty: 1 }] };
    expect(decide(state, hero)).toMatchObject({ rule: { set: 'baseline' }, action: 'act.explore' });

    const plain = hall();
    wound(plain.hero, plain.maxHp);
    expect(decide(plain.state, plain.hero)).toMatchObject({ rule: { set: 'baseline' }, action: 'act.explore' });
  });

  it('says so in the trace when it has nothing to heal with, and falls back to the baseline', () => {
    const { state, hero, maxHp } = hall([{ ...HERO, tactics: { role: ROLE_HEALER.id } }]);
    wound(hero, maxHp);
    hero.inventory = { items: [] };
    const f = decide(state, hero);
    expect(f.rule.set).toBe('baseline');
    expect(f.action).toBe('act.explore');
    expect(f.skipped).toEqual(['Healer: no healing to use, carrying on as normal']);
    expect(f.detail).toContain('Healer: no healing to use, carrying on as normal');
  });
});

describe('swapping tactics mid-run', () => {
  it('applies at the next decision, and swapping back restores the baseline', () => {
    const { state, hero, maxHp } = hall();
    expect(decide(state, hero).rule.set).toBe('baseline');
    wound(hero, maxHp);

    const events = step(state, [setRole(hero, ROLE_HEALER.id)]);
    expect(events).toContainEqual(expect.objectContaining({ type: 'tacticsSet', actor: hero.id, axis: 'role', options: [ROLE_HEALER.id] }));
    const f = fired(events).find((e) => e.actor === hero.id);
    expect(f).toMatchObject({ rule: { set: 'own', option: ROLE_HEALER.id }, action: 'act.use_ability' });
    expect(hero.ai.tactics?.role).toBe(ROLE_HEALER.id);
    expect(hero.ai.rules.map((r) => r.option)).toEqual(Array(ROLE_HEALER.rows?.length).fill(ROLE_HEALER.id));

    expect(decide(state, hero, [setRole(hero, ROLE_DAMAGE.id)]).rule.set).toBe('baseline');
    expect(hero.ai.rules).toEqual([]);
    expect(checkInvariants(state)).toEqual([]);
  });

  it('forgets what pointed into the old rule list, so a swap never reads as stuck', () => {
    const { state, hero } = hall();
    hero.ai.memory.still = 7;
    hero.ai.memory.dropped = { rule: { set: 'own', index: 0 }, action: 'act.explore', floor: 'd1', pos: { x: 2, y: 1 }, since: 0, until: 99 };
    step(state, [setRole(hero, ROLE_HEALER.id)]);
    expect(hero.ai.memory.dropped).toBeNull();
  });

  it('changes the whole party with a party stance, ahead of the baseline', () => {
    const { state, hero } = hall([HERO, ALLY]);
    const ally = getEntity(state, state.party[1] as EntityId) as AiActor;
    const events = step(state, [{ type: 'setTactics', stance: STANCE_FALL_BACK.id }]);
    expect(events).toContainEqual(expect.objectContaining({ type: 'tacticsSet', actor: null, axis: 'stance', options: [STANCE_FALL_BACK.id] }));
    for (const member of [hero, ally]) {
      expect(member.ai.tactics?.stance).toBe(STANCE_FALL_BACK.id);
      expect(member.ai.rules[0]).toMatchObject({ option: STANCE_FALL_BACK.id, action: { id: 'act.retreat_run' } });
    }
    const f = fired(events).find((e) => e.actor === hero.id);
    expect(f).toMatchObject({ rule: { set: 'own', option: STANCE_FALL_BACK.id }, action: 'act.retreat_run' });
    expect(f?.detail.startsWith('Fall back: ')).toBe(true);
  });

  it('puts habits before the role, in pick order, and the first rule that can act wins', () => {
    const { state, hero, maxHp } = hall([{ ...HERO, tactics: { role: ROLE_HEALER.id, habits: [HABIT_QUICK_TO_QUAFF.id] } }]);
    hero.actor.hp = Math.round(maxHp * 0.55); // above the Healer's line, below the habit's
    hero.inventory = { items: [{ def: DRAUGHT, qty: 1 }] };
    expect(decide(state, hero).rule.option).toBe(HABIT_QUICK_TO_QUAFF.id);
  });
});

describe('focus', () => {
  /** A hero next to two foes that stand still: the nearer-id one has 2 HP, the other 9. */
  function melee(focus?: string) {
    const { state, hero } = hall([{ ...HERO, ...(focus === undefined ? {} : { tactics: { focus } }) }]);
    const low = spawnMonster(state, 'monster.gloam_rat', 'd1', { x: 3, y: 1 });
    const high = spawnMonster(state, 'monster.gloam_rat', 'd1', { x: 3, y: 2 });
    for (const m of [low, high]) (m as AiActor).ai.rules = [];
    (low as ActorEntity).actor.hp = 2;
    (high as ActorEntity).actor.hp = 9;
    return { state, hero, low, high };
  }

  it('strikes the weakest adjacent enemy by default', () => {
    const { state, hero, low } = melee();
    const choice = chooseRule({ state, actor: hero });
    expect(choice?.action).toBe('act.attack_adjacent');
    expect(choice?.goal).toEqual(low.pos);
  });

  it('strikes the strongest with the Strongest focus, and swapping mid-run changes the next target', () => {
    const { state, hero, low, high } = melee(FOCUS_STRONGEST.id);
    expect(chooseRule({ state, actor: hero })?.goal).toEqual(high.pos);
    step(state, [{ type: 'setTactics', actor: hero.id, focus: 'tactic.weakest' }]);
    expect(chooseRule({ state, actor: hero })?.goal).toEqual(low.pos);
  });
});

describe('setTactics checking', () => {
  const bad: [string, (hero: ActorEntity) => Command][] = [
    ['an unknown option', (h) => ({ type: 'setTactics', actor: h.id, role: 'tactic.nope' })],
    ['an option on the wrong axis', (h) => ({ type: 'setTactics', actor: h.id, role: 'tactic.weakest' })],
    ['a party stance that is not a stance', () => ({ type: 'setTactics', stance: 'tactic.healer' })],
    ['an adventurer pick without an actor', () => ({ type: 'setTactics', role: ROLE_HEALER.id })],
    ['a party pick with an actor', (h) => ({ type: 'setTactics', actor: h.id, stance: STANCE_FALL_BACK.id })],
    ['an actor that is not in the party', () => ({ type: 'setTactics', actor: 9999, role: ROLE_HEALER.id })],
    ['the same habit twice', (h) => ({ type: 'setTactics', actor: h.id, habits: [HABIT_QUICK_TO_QUAFF.id, HABIT_QUICK_TO_QUAFF.id] })],
    ['habits that are not a list', (h) => ({ type: 'setTactics', actor: h.id, habits: 'tactic.quick_to_quaff' }) as unknown as Command],
    ['nothing to set', (h) => ({ type: 'setTactics', actor: h.id })],
    ['an unknown field', (h) => ({ type: 'setTactics', actor: h.id, mood: 'sulky' }) as unknown as Command],
  ];

  it.each(bad)('rejects %s and changes nothing', (_name, make) => {
    const { state, hero } = hall([HERO, ALLY]);
    const before = JSON.stringify(state.entities);
    const events = step(state, [make(hero)]);
    expect(rejected(events)).toHaveLength(1);
    expect(events.filter((e) => e.type === 'tacticsSet')).toEqual([]);
    expect(hero.ai.tactics).toEqual(defaultPicks('class.reaver'));
    expect(hero.ai.rules).toEqual([]);
    // Nothing but the turn's own play changed: no rule list was touched anywhere.
    for (const id of state.party) expect((getEntity(state, id) as AiActor).ai.rules).toEqual([]);
    void before;
  });

  it('accepts a command whose fields are all valid, with several axes at once', () => {
    const { state, hero } = hall();
    const events = step(state, [{ type: 'setTactics', actor: hero.id, role: ROLE_HEALER.id, focus: FOCUS_STRONGEST.id, habits: [HABIT_QUICK_TO_QUAFF.id] }]);
    expect(rejected(events)).toEqual([]);
    expect(events.filter((e) => e.type === 'tacticsSet').map((e) => (e as { axis: string }).axis)).toEqual(['role', 'focus', 'habit']);
    expect(hero.ai.rules.map((r) => r.option)).toEqual([HABIT_QUICK_TO_QUAFF.id, ...Array(ROLE_HEALER.rows?.length).fill(ROLE_HEALER.id)]);
  });
});

describe('no automatic switching', () => {
  it('never changes picks on its own, however hurt the party gets', () => {
    const { state, hero, maxHp } = hall([HERO, ALLY]);
    const before = state.party.map((id) => JSON.stringify((getEntity(state, id) as AiActor).ai.tactics));
    for (let i = 0; i < 150; i++) {
      if (i % 10 === 0) hero.actor.hp = Math.max(1, Math.round(maxHp * 0.2));
      step(state, []);
    }
    expect(state.party.map((id) => JSON.stringify((getEntity(state, id) as AiActor).ai.tactics))).toEqual(before);
  });
});

describe('tactics in saves', () => {
  it('survives a save and load, rules and picks together, and the invariant catches rules that do not match', () => {
    const { state, hero } = hall();
    step(state, [setRole(hero, ROLE_HEALER.id)]);
    const loaded = deserialize(serialize(state));
    const again = getEntity(loaded, hero.id) as AiActor;
    expect(again.ai.tactics).toEqual(hero.ai.tactics);
    expect(again.ai.rules).toEqual(hero.ai.rules);
    expect(checkInvariants(loaded)).toEqual([]);

    again.ai.rules = [];
    expect(checkInvariants(loaded).join()).toContain('do not match its tactics');
  });
});
