/**
 * The killer named in a death (ETH-075): the `fell` event carries what struck an adventurer down
 * (a monster's blow, a caster's bolt, a status and who inflicted it), the log line names it, and a
 * wipe's cause and run summary do too. Fixed seeds and hand-built floors; the hero is held in
 * place (a single wait rule) at low HP.
 */
import { describe, expect, it } from 'vitest';
import { applyStatus, checkInvariants, createRun, deathPredicate, getEntity, removeEntity, runResult, spawnMonster, step } from '../../src/sim';
import type { ActorEntity, Emit, FallenRecord, RunState, SimEvent } from '../../src/sim';
import { describe as describeEvent } from '../../src/ui/shell/text';

const HERO = { name: 'Brannoc', classId: 'class.vanguard', raceId: 'race.human' };
const MIRA = { name: 'Mira', classId: 'class.vanguard', raceId: 'race.human' };

const ROOM = ['###########', '#@........#', '#.........#', '#.........#', '###########'];

function setup(party = [HERO], seed = 1): { state: RunState; hero: ActorEntity } {
  const state = createRun({ party, floorText: ROOM, depth: 1 }, seed);
  for (const id of state.party) {
    const e = getEntity(state, id);
    if (e.ai !== undefined) e.ai.rules = [{ condition: { id: 'cond.always' }, action: { id: 'act.wait' }, enabled: true }];
  }
  return { state, hero: getEntity(state, state.party[0] as number) as ActorEntity };
}

/** Steps until the run ends (at most `max` steps), checking invariants; returns every event. */
function runToEnd(state: RunState, max = 200): SimEvent[] {
  const all: SimEvent[] = [];
  for (let i = 0; i < max && state.domains.run.end === null; i++) {
    all.push(...step(state, []));
    expect(checkInvariants(state)).toEqual([]);
  }
  return all;
}

const fellOf = (events: SimEvent[]) => events.filter((e): e is Extract<SimEvent, { type: 'fell' }> => e.type === 'fell');
const logText = (e: SimEvent) => describeEvent(e, (id) => `#${id}`).text;
const fallen = (state: RunState) => (runResult(state).extras['track.deaths'] as { fallen: FallenRecord[] }).fallen;

describe('the killer of a fallen adventurer', () => {
  it('names the monster whose blow killed them, in the event, the log, the wipe cause and the summary', () => {
    const { state, hero } = setup();
    const hound = spawnMonster(state, 'monster.slate_hound', 'd1', { x: 2, y: 1 }) as ActorEntity;
    hero.actor.hp = 1;
    const events = runToEnd(state);
    const [fell] = fellOf(events);
    expect(fell).toMatchObject({ actor: hero.id, name: 'Brannoc', depth: 1 });
    expect(fell?.killer).toEqual({ kind: 'monster', id: hound.id, def: 'monster.slate_hound', name: 'Slate hound' });
    expect(logText(fell as SimEvent)).toBe('Brannoc is slain by a slate hound on floor 1.');
    expect(state.domains.run.end).toMatchObject({ outcome: 'wipe', cause: 'Brannoc was slain by a slate hound on floor 1.' });
    expect(fallen(state)).toEqual([
      { actor: hero.id, name: 'Brannoc', depth: 1, turn: fell?.turn, killer: fell?.killer, how: 'was slain by a slate hound' },
    ]);
  });

  it('names a caster’s bolt', () => {
    const { state, hero } = setup();
    const toad = spawnMonster(state, 'monster.mire_toad', 'd1', { x: 5, y: 1 }) as ActorEntity;
    hero.actor.hp = 1;
    const events = runToEnd(state);
    const [fell] = fellOf(events);
    expect(fell?.killer).toEqual({
      kind: 'monster',
      id: toad.id,
      def: 'monster.mire_toad',
      name: 'Mire toad',
      ranged: true,
      bolt: 'gob of bog-slime',
    });
    expect(events.find((e) => e.type === 'killed')).toMatchObject({ victim: hero.id, ranged: true });
    expect(logText(fell as SimEvent)).toBe('Brannoc is slain by a mire toad’s gob of bog-slime on floor 1.');
    expect(state.domains.run.end?.cause).toBe('Brannoc was slain by a mire toad’s gob of bog-slime on floor 1.');
  });

  it('names a status and who inflicted it, even after the inflicter is gone', () => {
    const { state, hero } = setup();
    const emit: Emit = () => undefined;
    const biter = spawnMonster(state, 'monster.slate_hound', 'd1', { x: 8, y: 3 }) as ActorEntity;
    applyStatus(state, hero, 'status.poisoned', 5, emit, 1, true, biter);
    expect(hero.stats?.statuses[0]?.by).toEqual({ id: biter.id, def: 'monster.slate_hound' });
    removeEntity(state, biter.id);
    hero.actor.hp = 1;
    const events = runToEnd(state);
    const [fell] = fellOf(events);
    expect(fell?.killer).toEqual({
      kind: 'status',
      id: null,
      def: 'status.poisoned',
      name: 'Poisoned',
      source: { id: biter.id, def: 'monster.slate_hound', name: 'Slate hound', kind: 'monster' },
    });
    expect(logText(fell as SimEvent)).toBe('Brannoc dies poisoned by a slate hound on floor 1.');
    expect(state.domains.run.end?.cause).toBe('Brannoc died poisoned by a slate hound on floor 1.');
  });

  it('names a status alone when nobody inflicted it, and says only “fell” when nothing is known', () => {
    const { state, hero } = setup([HERO, MIRA]);
    const mira = getEntity(state, state.party[1] as number) as ActorEntity;
    applyStatus(state, hero, 'status.poisoned', 5, () => undefined);
    expect(hero.stats?.statuses[0]?.by).toBeUndefined();
    hero.actor.hp = 1;
    const first = runToEnd(state, 3);
    expect(fellOf(first)[0]?.killer).toEqual({ kind: 'status', id: null, def: 'status.poisoned', name: 'Poisoned' });
    expect(logText(fellOf(first)[0] as SimEvent)).toBe('Brannoc dies poisoned on floor 1.');
    mira.actor.hp = 0;
    const rest = runToEnd(state);
    expect(fellOf(rest)[0]?.killer).toBeNull();
    expect(logText(fellOf(rest)[0] as SimEvent)).toBe('Mira falls on floor 1.');
    expect(state.domains.run.end?.cause).toBe('Mira fell on floor 1, the last of the party standing.');
    expect(fallen(state).map((f) => f.how)).toEqual(['died poisoned', 'fell']);
  });

  it('words every kind of killer', () => {
    expect(deathPredicate({ kind: 'adventurer', id: 3, def: 'adventurer', name: 'Mira' }, 'present')).toBe('is slain by Mira');
    expect(deathPredicate({ kind: 'monster', id: 3, def: 'monster.ashmite_swarm', name: 'Ashmite swarm' })).toBe('was slain by an ashmite swarm');
    expect(deathPredicate({ kind: 'trap', id: null, def: 'trap.dart', name: 'Dart trap' })).toBe('was killed by a dart trap');
    expect(deathPredicate({ kind: 'other', id: null, def: 'item.x', name: 'Cursed ring' })).toBe('was killed by cursed ring');
  });
});
