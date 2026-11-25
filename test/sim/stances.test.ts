/**
 * The party stances (ETH-071) on hand-built halls with a fixed seed: Steady is the baseline, Delve
 * and Reckless head down early, Plunder detours far for loot and gets more turns per floor, Cautious
 * flees sooner and turns the party back when it is worn down, Fall back heads home, and every one
 * of them leaves the baseline's urgent business (fighting, fleeing, healing) to the baseline.
 */
import { describe, expect, it } from 'vitest';
import {
  CAUTIOUS_FLEE_BELOW,
  CAUTIOUS_WORN_PERCENT,
  DELVE_DESCEND_PERCENT,
  PLUNDER_FLOOR_CAP_PERCENT,
  stanceParamProblems,
  STANCE_CAUTIOUS,
  STANCE_DELVE,
  STANCE_FALL_BACK,
  STANCE_PLUNDER,
  STANCE_RECKLESS,
  tacticsOn,
} from '../../src/content';
import { checkInvariants, CONDITIONS, createRun, FLOOR_TURN_CAP, getEntity, getFloor, getMemory, moveEntity, placeItem, spawnMonster, step } from '../../src/sim';
import type { ActorEntity, AiActor, AiCtx, Command, EntityId, Rule, RunState, SimEvent } from '../../src/sim';

const HERO = { name: 'Brannoc', classId: 'class.vanguard', raceId: 'race.human' };
const DRAUGHT = 'item.mending_draught';
const POTION = 'item.mending_draught';
const W = 80;
const WALL = '#'.repeat(W);
// A lit hall with the way up at the west end and the way down close by. Depth 2, so there is a floor below.
const HALL = [WALL, `#<@${'.'.repeat(3)}>${'.'.repeat(W - 8)}#`, `#${'.'.repeat(W - 2)}#`, WALL];

type RuleFired = Extract<SimEvent, { type: 'ruleFired' }>;
const fired = (events: SimEvent[]): RuleFired[] => events.filter((e): e is RuleFired => e.type === 'ruleFired');

/** A hall run with `stance`, no monsters, and `seen` of its floor remembered (the columns up to `seenX`). */
function hall(stance: string | undefined, seenX = 20, depth = 2): { state: RunState; hero: AiActor; maxHp: number } {
  const config = { party: [HERO], floorText: HALL, depth, monsters: false, ...(stance === undefined ? {} : { tactics: { stance } }) };
  const state = createRun(config, 5);
  const hero = getEntity(state, state.party[0] as EntityId) as AiActor;
  const terrain = getFloor(state, 'd1').terrain.cells;
  const memory = getMemory(state, 'd1').terrain.cells;
  for (let i = 0; i < terrain.length; i++) memory[i] = i % W <= seenX ? (terrain[i] as number) + 1 : 0;
  return { state, hero, maxHp: hero.actor.hp };
}

/** Steps until the hero decides and returns its choice. */
function decide(state: RunState, hero: ActorEntity, commands: Command[] = []): RuleFired {
  for (let i = 0; i < 20; i++) {
    const f = fired(step(state, i === 0 ? commands : [])).find((e) => e.actor === hero.id);
    if (f !== undefined) return f;
  }
  throw new Error('the hero never decided');
}

const still = (state: RunState, def: string, x: number, y: number): ActorEntity => {
  const m = spawnMonster(state, def, 'd1', { x, y }) as AiActor;
  m.ai.rules = [];
  return m;
};

const hpTo = (hero: ActorEntity, maxHp: number, percent: number): void => {
  hero.actor.hp = Math.max(1, Math.round((maxHp * percent) / 100));
};

describe('Steady', () => {
  it('plays exactly the baseline: explicit picks and no picks make the same decisions', () => {
    const a = hall(undefined);
    const b = hall('tactic.steady');
    const run = (s: ReturnType<typeof hall>) => Array.from({ length: 40 }, () => fired(step(s.state, [])).map((e) => `${e.actor}:${e.action}:${e.detail}`));
    expect(tacticsOn('stance')[0]?.id).toBe('tactic.steady');
    expect(run(a)).toEqual(run(b));
    expect(a.hero.pos).toEqual(b.hero.pos);
  });
});

describe('Delve', () => {
  it('heads down once the stairs are known and enough of the floor is seen', () => {
    const { state, hero } = hall(STANCE_DELVE.id, 40);
    const f = decide(state, hero);
    expect(f).toMatchObject({ rule: { set: 'own', option: STANCE_DELVE.id }, action: 'act.descend' });
    expect(f.detail).toMatch(/^Delve: heading for the stairs down/);
    expect(f.detail).toContain('stairs known');
  });

  it('keeps exploring below the threshold, and Steady keeps exploring at any share', () => {
    expect(DELVE_DESCEND_PERCENT).toBeGreaterThan(8);
    const low = hall(STANCE_DELVE.id, 2);
    expect(decide(low.state, low.hero)).toMatchObject({ rule: { set: 'baseline' }, action: 'act.explore' });
    const steady = hall(undefined, 40);
    expect(decide(steady.state, steady.hero)).toMatchObject({ rule: { set: 'baseline' }, action: 'act.explore' });
  });

  it('does not descend on the bottom floor', () => {
    const { state, hero } = hall(STANCE_DELVE.id, 40, 1);
    expect(decide(state, hero).rule.set).toBe('baseline');
  });

  it('leaves fighting, healing and fleeing to the baseline', () => {
    const fight = hall(STANCE_DELVE.id, 40);
    still(fight.state, 'monster.pit_badger', fight.hero.pos.x + 1, fight.hero.pos.y);
    expect(decide(fight.state, fight.hero)).toMatchObject({ rule: { set: 'baseline' }, action: 'act.attack_adjacent' });

    const hurt = hall(STANCE_DELVE.id, 40);
    hpTo(hurt.hero, hurt.maxHp, 30);
    hurt.hero.inventory = { items: [{ def: DRAUGHT, qty: 1 }] };
    expect(decide(hurt.state, hurt.hero)).toMatchObject({ rule: { set: 'baseline' }, action: 'act.quaff_healing' });

    const near = hall(STANCE_DELVE.id, 40);
    still(near.state, 'monster.pit_badger', near.hero.pos.x + 7, near.hero.pos.y);
    expect(decide(near.state, near.hero).rule.set).toBe('baseline');
  });
});

describe('Reckless', () => {
  it('walks up to an enemy in sight, where Steady carries on exploring', () => {
    const r = hall(STANCE_RECKLESS.id, 2);
    still(r.state, 'monster.pit_badger', r.hero.pos.x + 7, r.hero.pos.y);
    const f = decide(r.state, r.hero);
    expect(f).toMatchObject({ rule: { set: 'own', option: STANCE_RECKLESS.id }, action: 'act.charge' });
    expect(f.detail).toMatch(/^Reckless: charging the pit badger/);

    const s = hall(undefined, 2);
    still(s.state, 'monster.pit_badger', s.hero.pos.x + 7, s.hero.pos.y);
    expect(decide(s.state, s.hero)).toMatchObject({ rule: { set: 'baseline' }, action: 'act.explore' });
  });

  it('fights on at 25% HP where Steady runs, and runs at 15%', () => {
    const r = hall(STANCE_RECKLESS.id, 2);
    still(r.state, 'monster.pit_badger', r.hero.pos.x + 7, r.hero.pos.y);
    hpTo(r.hero, r.maxHp, 25);
    expect(decide(r.state, r.hero).action).toBe('act.charge');

    const s = hall(undefined, 2);
    still(s.state, 'monster.pit_badger', s.hero.pos.x + 7, s.hero.pos.y);
    hpTo(s.hero, s.maxHp, 25);
    expect(decide(s.state, s.hero).action).toBe('act.flee');

    const scared = hall(STANCE_RECKLESS.id, 2);
    still(scared.state, 'monster.pit_badger', scared.hero.pos.x + 7, scared.hero.pos.y);
    hpTo(scared.hero, scared.maxHp, 15);
    expect(decide(scared.state, scared.hero).action).toBe('act.flee');
  });

  it('heads down earlier than Steady once the stairs are known', () => {
    const { state, hero } = hall(STANCE_RECKLESS.id, 65);
    expect(decide(state, hero)).toMatchObject({ rule: { option: STANCE_RECKLESS.id }, action: 'act.descend' });
  });
});

describe('Cautious', () => {
  it('flees at 45% HP, where Steady does not', () => {
    const c = hall(STANCE_CAUTIOUS.id, 2);
    still(c.state, 'monster.pit_badger', c.hero.pos.x + 7, c.hero.pos.y);
    hpTo(c.hero, c.maxHp, CAUTIOUS_FLEE_BELOW - 5);
    expect(decide(c.state, c.hero).action).toBe('act.flee');

    const s = hall(undefined, 2);
    still(s.state, 'monster.pit_badger', s.hero.pos.x + 7, s.hero.pos.y);
    hpTo(s.hero, s.maxHp, CAUTIOUS_FLEE_BELOW - 5);
    expect(decide(s.state, s.hero).action).not.toBe('act.flee');
  });

  it('turns the party for home when it is worn down and nothing is in sight, and the run ends as a retreat', () => {
    const { state, hero, maxHp } = hall(STANCE_CAUTIOUS.id, 2);
    hpTo(hero, maxHp, CAUTIOUS_WORN_PERCENT - 4);
    const f = decide(state, hero);
    expect(f).toMatchObject({ rule: { option: STANCE_CAUTIOUS.id }, action: 'act.retreat_run' });
    expect(f.detail).toMatch(/^Cautious: heading for the stairs up/);
    expect(f.condition).toBe('cond.party_worn');
    const events: SimEvent[] = [];
    for (let i = 0; i < 12 && state.domains.run.end === null; i++) events.push(...step(state, []));
    expect(events).toContainEqual(expect.objectContaining({ type: 'runEnded', outcome: 'retreat' }));
  });

  it('stays put above the line, and with a threat in sight', () => {
    const above = hall(STANCE_CAUTIOUS.id, 2);
    hpTo(above.hero, above.maxHp, CAUTIOUS_WORN_PERCENT + 10);
    expect(decide(above.state, above.hero).rule.set).toBe('baseline');

    const seen = hall(STANCE_CAUTIOUS.id, 2);
    still(seen.state, 'monster.pit_badger', seen.hero.pos.x + 7, seen.hero.pos.y);
    hpTo(seen.hero, seen.maxHp, CAUTIOUS_WORN_PERCENT - 10);
    expect(decide(seen.state, seen.hero).action).not.toBe('act.retreat_run');
  });
});

describe('Plunder', () => {
  it('detours far for remembered loot that Steady leaves', () => {
    const remembered = (stance: string | undefined) => {
      const s = hall(stance, 60);
      placeItem(s.state, 'd1', { x: 8, y: 2 }, { def: POTION, qty: 1 });
      step(s.state, []);
      moveEntity(s.state, s.hero.id, 'd1', { x: 40, y: 1 });
      return decide(s.state, s.hero).action;
    };
    expect(remembered(undefined)).not.toBe('act.pick_up');
    expect(remembered(STANCE_PLUNDER.id)).toBe('act.pick_up');
  });

  it('gets the stance’s share of the per-floor turn cap more than Steady', () => {
    const turnsOn = Math.round((FLOOR_TURN_CAP * PLUNDER_FLOOR_CAP_PERCENT) / 100) - 100;
    const overstayed = (stance: string | undefined) => {
      const { state, hero } = hall(stance);
      state.domains.floors.arrived['d1'] = state.turn - turnsOn;
      return CONDITIONS.get('cond.floor_overstayed').evaluate({ state, actor: hero } as AiCtx, undefined).ok;
    };
    expect(overstayed(undefined)).toBe(true);
    expect(overstayed(STANCE_PLUNDER.id)).toBe(false);
  });
});

describe('Fall back', () => {
  it('heads for the stairs up and the run ends as a retreat', () => {
    const { state, hero } = hall(STANCE_FALL_BACK.id, 40);
    const f = decide(state, hero);
    expect(f).toMatchObject({ rule: { option: STANCE_FALL_BACK.id }, action: 'act.retreat_run', condition: 'cond.fall_back_ready' });
    expect(f.detail).toMatch(/^Fall back: /);
    const events: SimEvent[] = [];
    for (let i = 0; i < 12 && state.domains.run.end === null; i++) events.push(...step(state, []));
    expect(events).toContainEqual(expect.objectContaining({ type: 'runEnded', outcome: 'retreat' }));
    expect(checkInvariants(state)).toEqual([]);
  });

  it('fights off an enemy next to the party first', () => {
    const { state, hero } = hall(STANCE_FALL_BACK.id, 40);
    still(state, 'monster.pit_badger', hero.pos.x + 1, hero.pos.y);
    expect(decide(state, hero)).toMatchObject({ rule: { set: 'baseline' }, action: 'act.attack_adjacent' });
  });

  it('is one-way: once the party has turned for home, picking Steady does not turn it back', () => {
    const { state, hero } = hall(STANCE_FALL_BACK.id, 40);
    decide(state, hero);
    expect(state.domains.run.leaving).not.toBeNull();
    const f = decide(state, hero, [{ type: 'setTactics', stance: 'tactic.steady' }]);
    expect(f).toMatchObject({ rule: { set: 'baseline' }, action: 'act.retreat_run' });
    expect(state.domains.run.leaving).not.toBeNull();
  });
});

describe('swapping stances', () => {
  it('applies at the next decision, and never switches by itself', () => {
    const { state, hero } = hall(undefined, 40);
    expect(decide(state, hero).action).toBe('act.explore');
    expect(decide(state, hero, [{ type: 'setTactics', stance: STANCE_DELVE.id }])).toMatchObject({ action: 'act.descend', rule: { option: STANCE_DELVE.id } });
    expect(hero.ai.tactics?.stance).toBe(STANCE_DELVE.id);
    expect(checkInvariants(state)).toEqual([]);
  });
});

describe('stance content', () => {
  const stances = tacticsOn('stance');

  it('offers the six stances, Steady first and neutral', () => {
    expect(stances.map((s) => s.name).sort()).toEqual(['Cautious', 'Delve', 'Fall back', 'Plunder', 'Reckless', 'Steady']);
    expect(stances.length).toBe(6);
    expect(stances[0]).toMatchObject({ id: 'tactic.steady' });
    expect(stances[0]?.rows).toBeUndefined();
    expect(stances[0]?.params).toBeUndefined();
  });

  it('has valid params, and the one-way note on the retreating stances', () => {
    for (const s of stances) expect(stanceParamProblems(s.params), s.id).toEqual([]);
    expect(stanceParamProblems({ fleeBelow: 0 })).not.toEqual([]);
    expect(stanceParamProblems({ fleeBelow: 50, fleeRelease: 40 })).not.toEqual([]);
    expect(stanceParamProblems({ nonsense: 1 })).not.toEqual([]);
    for (const s of [STANCE_CAUTIOUS, STANCE_FALL_BACK]) expect(s.description).toContain('doesn’t turn back');
  });

  it('states its numbers in its description', () => {
    expect(STANCE_CAUTIOUS.description).toContain(`${CAUTIOUS_FLEE_BELOW}%`);
    expect(STANCE_DELVE.description).toContain(`${DELVE_DESCEND_PERCENT}%`);
    expect(STANCE_PLUNDER.description).toContain(`${PLUNDER_FLOOR_CAP_PERCENT}%`);
  });

  it('every row names a registered condition and rule action', () => {
    const rules: Rule[] = stances.flatMap((s) => (s.rows ?? []).map((r) => ({ ...r, enabled: true })));
    for (const r of rules) {
      expect(CONDITIONS.has(r.condition.id), r.condition.id).toBe(true);
      expect(CONDITIONS.get(r.condition.id).check(r.condition.params)).toBeNull();
    }
  });
});
