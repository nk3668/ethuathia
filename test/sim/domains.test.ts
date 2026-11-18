import { describe, expect, it } from 'vitest';
import {
  ACTIONS,
  COMMANDS,
  CONDITIONS,
  CORE_ACTIONS,
  CORE_COMMANDS,
  createRun,
  DOMAIN_KEYS,
  DOMAINS,
  GEN_STEPS,
  isStatId,
  RULE_ACTIONS,
  RUN_TRACKERS,
  snapshot,
  STAT_IDS,
  STATE_VERSION,
} from '../../src/sim';
import type { ActionRecord, CommandRecord, DomainTypes, RunConfig, SimEventBody, StatId } from '../../src/sim';

const CONFIG: RunConfig = {
  party: [{ name: 'Mira', classId: 'class.vanguard', raceId: 'race.human' }],
  floorText: ['#####', '#@..#', '#####'],
};

describe('domain modules', () => {
  it('are composed in a fixed order', () => {
    expect(DOMAIN_KEYS).toEqual(['stats', 'floors', 'combat', 'items', 'quests', 'run']);
    expect(Object.keys(DOMAINS)).toEqual(DOMAIN_KEYS);
  });

  it('give every run a state slice per domain, starting with no at-risk rewards', () => {
    const state = createRun(CONFIG, 1);
    expect(state.version).toBe(STATE_VERSION);
    expect(Object.keys(state.domains)).toEqual(DOMAIN_KEYS);
    expect(state.domains.run.rewards.atRisk).toEqual({});
  });

  it('give every snapshot a slice per domain', () => {
    expect(Object.keys(snapshot(createRun(CONFIG, 1)).domains)).toEqual(DOMAIN_KEYS);
  });

  it('build ACTIONS and COMMANDS from the core records and every domain record', () => {
    const actionIds = [CORE_ACTIONS, ...DOMAIN_KEYS.map((k) => DOMAINS[k].actions)].flatMap((r) => Object.keys(r));
    expect(Object.keys(ACTIONS)).toEqual(actionIds);
    const commandTypes = [CORE_COMMANDS, ...DOMAIN_KEYS.map((k) => DOMAINS[k].commands)].flatMap((r) => Object.keys(r));
    expect(Object.keys(COMMANDS)).toEqual(commandTypes);
    for (const [id, def] of Object.entries(ACTIONS)) expect(def.id).toBe(id);
    for (const [type, def] of Object.entries(COMMANDS)) expect(def.type).toBe(type);
  });

  it('register the core conditions, rule actions and generation steps first, in order', () => {
    expect(CONDITIONS.all().slice(0, 2).map((d) => d.id)).toEqual(['cond.always', 'cond.stuck']);
    expect(RULE_ACTIONS.all().slice(0, 3).map((d) => d.id)).toEqual(['act.explore', 'act.back_off', 'act.wait']);
    expect(GEN_STEPS.all().slice(0, 4).map((d) => d.id)).toEqual(['gen.rooms', 'gen.corridors', 'gen.doors', 'gen.stairs']);
    expect(RUN_TRACKERS.map((t) => t.id)).toEqual(['track.codex']);
  });

  it('keep ACTIONS and COMMANDS exhaustive at compile time', () => {
    // A request or command type without a definition, or a definition for no type, fails to compile.
    // @ts-expect-error: `zap` has no definition.
    const missing: ActionRecord<{ id: 'zap' }> = {};
    // @ts-expect-error: `zap` is not a request type.
    const extra: ActionRecord<{ id: 'wait' }> = { wait: CORE_ACTIONS.wait, zap: CORE_ACTIONS.wait };
    // @ts-expect-error: `ring` has no definition.
    const noCommand: CommandRecord<{ type: 'ring' }> = {};
    expect([missing, extra, noCommand]).toHaveLength(3);
  });

  it('compose the root unions from DomainTypes', () => {
    // Each domain's event union is part of `SimEventBody`; with no domain events yet, only core ones.
    const body: SimEventBody = { type: 'waited', actor: 1 };
    const events: DomainTypes['combat']['event'][] = [];
    expect([body, events]).toHaveLength(2);
  });
});

describe('stat ids', () => {
  it('are the fixed list ETH-057 builds on', () => {
    const ids: readonly StatId[] = STAT_IDS;
    expect(ids).toEqual(['hp', 'mp', 'accuracy', 'evasion', 'damage', 'armor', 'speed', 'sight', 'carry']);
    expect(isStatId('sight')).toBe(true);
    expect(isStatId('luck')).toBe(false);
    expect(isStatId(3)).toBe(false);
  });
});
