import { describe, expect, it } from 'vitest';
import { findDef } from '../../src/content';
import {
  addDiscovery,
  CODEX_TRACKER,
  CORE_DISCOVERIES,
  createRun,
  DISCOVERY_RULES,
  discoveriesOf,
  mergeDiscoveries,
  step,
} from '../../src/sim';
import type { CodexDiscoveries, DiscoveryRules, RunConfig, SimEvent } from '../../src/sim';

const door: SimEvent = { type: 'doorOpened', actor: 1, door: 2, pos: { x: 3, y: 1 }, turn: 4 };
const wait: SimEvent = { type: 'waited', actor: 1, turn: 5 };

describe('discovery rules', () => {
  it('hold the core rules, keyed by event type', () => {
    expect(DISCOVERY_RULES.get('doorOpened')).toContain(CORE_DISCOVERIES.doorOpened);
    expect(DISCOVERY_RULES.has('waited')).toBe(false);
  });

  it('name only content ids that exist', () => {
    for (const [type, rules] of DISCOVERY_RULES) {
      // `runStarted` lists the party, so the sample carries one member; `floorEntered` names a floor type;
      // `contractsTaken` lists contracts and `contractCompleted` names one (ETH-024); `runModifierAdded` names its source (ETH-115).
      const sample = {
        type,
        turn: 0,
        floorType: 'floor.halls',
        party: [{ actor: 1, name: 'Mira', classId: 'class.vanguard', raceId: 'race.human' }],
        items: ['item.oak_cudgel'],
        contracts: [{ contract: 'contract.recover_relic', reward: {} }],
        contract: 'contract.recover_relic',
        source: { id: 'status.hasted', label: 'Hasted' },
      } as unknown as SimEvent;
      for (const rule of rules) for (const d of rule(sample)) expect(findDef(d.id), `${type} → ${d.id}`).toBeDefined();
    }
  });

  it('are typed per event type, so a rule only sees its own event', () => {
    const rules: DiscoveryRules = { doorOpened: (e) => (e.door > 0 ? [{ id: 'feature.door', mark: 'seen' }] : []) };
    // @ts-expect-error: `waited` events have no `door`.
    const bad: DiscoveryRules = { waited: (e) => (e.door > 0 ? [] : []) };
    expect([rules, bad]).toHaveLength(2);
  });

  it('turn an event into its discoveries', () => {
    expect(discoveriesOf(door)).toEqual([{ id: 'feature.door', mark: 'used' }]);
    expect(discoveriesOf(wait)).toEqual([]);
    // A domain's own map: the floors domain discovers the stairs taken.
    const stairs: SimEvent = { type: 'tookStairs', actor: 1, dir: 'down', from: 'd1', to: 'd2', depth: 2, pos: { x: 1, y: 1 }, turn: 9 };
    expect(discoveriesOf(stairs)).toEqual([{ id: 'feature.stairs_down', mark: 'used' }]);
    // Arriving on a floor discovers its floor type (ETH-064); a hand-built floor has none.
    const entered = { type: 'floorEntered', actor: 1, floor: 'd2', depth: 2, firstVisit: true, turn: 9 } as const;
    expect(discoveriesOf({ ...entered, floorType: 'floor.halls' })).toEqual([{ id: 'floor.halls', mark: 'seen' }]);
    expect(discoveriesOf({ ...entered, floorType: null })).toEqual([]);
    // Starting a run discovers the first floor's type too (ETH-079).
    const started = {
      type: 'runStarted' as const,
      party: [{ actor: 1, name: 'Mira', classId: 'class.vanguard', raceId: 'race.human' }],
      depth: 2,
      turn: 0,
    };
    expect(discoveriesOf({ ...started, floorType: 'floor.halls' })).toEqual([
      { id: 'class.vanguard', mark: 'seen' },
      { id: 'race.human', mark: 'seen' },
      { id: 'floor.halls', mark: 'seen' },
    ]);
    expect(discoveriesOf({ ...started, floorType: null })).toEqual([
      { id: 'class.vanguard', mark: 'seen' },
      { id: 'race.human', mark: 'seen' },
    ]);
  });
});

describe('addDiscovery and mergeDiscoveries', () => {
  it('keep marks in order without repeats, and return the same object when nothing is new', () => {
    const a = addDiscovery({}, { id: 'monster.rat', mark: 'killed' });
    const b = addDiscovery(a, { id: 'monster.rat', mark: 'seen' });
    expect(b).toEqual({ 'monster.rat': ['seen', 'killed'] });
    expect(addDiscovery(b, { id: 'monster.rat', mark: 'seen' })).toBe(b);
    expect(a).toEqual({ 'monster.rat': ['killed'] });
  });

  it('merge two sets, keeping the first unchanged', () => {
    const a: CodexDiscoveries = { 'feature.door': ['used'] };
    const merged = mergeDiscoveries(a, { 'feature.door': ['seen'], 'monster.rat': ['killed'] });
    expect(merged).toEqual({ 'feature.door': ['seen', 'used'], 'monster.rat': ['killed'] });
    expect(a).toEqual({ 'feature.door': ['used'] });
    expect(mergeDiscoveries(merged, { 'feature.door': ['used'] })).toBe(merged);
  });
});

describe('CODEX_TRACKER', () => {
  it('starts empty and reduces events into discoveries without changing its state in place', () => {
    const start = CODEX_TRACKER.init();
    expect(start).toEqual({});
    const after = CODEX_TRACKER.reduce(start, door);
    expect(after).toEqual({ 'feature.door': ['used'] });
    expect(start).toEqual({});
    expect(CODEX_TRACKER.reduce(after, door)).toBe(after);
    expect(CODEX_TRACKER.reduce(after, wait)).toBe(after);
  });

  it('discovers the door an adventurer opens on a hand-built map (fixed seed)', () => {
    const config: RunConfig = {
      party: [{ name: 'Mira', classId: 'class.vanguard', raceId: 'race.human' }],
      floorText: ['#########', '#@..+...#', '#######.#', '#######.#', '#########'],
    };
    const state = createRun(config, 3);
    let codex = CODEX_TRACKER.init();
    for (let i = 0; i < 30; i++) for (const event of step(state, [])) codex = CODEX_TRACKER.reduce(codex, event);
    // The party's class and race are met at the start (`runStarted`), the door when it is opened.
    // The Vanguard's kit (ETH-176) is worn from the start, so its items count as used.
    expect(codex).toEqual({
      'class.vanguard': ['seen'],
      'race.human': ['seen'],
      'item.oak_cudgel': ['used'],
      'item.round_shield': ['used'],
      'feature.door': ['used'],
    });
  });

  it('discovers the first floor type on step 1 for a generated run (ETH-079)', () => {
    const state = createRun({ party: [{ name: 'Mira', classId: 'class.vanguard', raceId: 'race.human' }], depth: 2 }, 3);
    let codex = CODEX_TRACKER.init();
    for (const event of step(state, [])) codex = CODEX_TRACKER.reduce(codex, event);
    expect(codex).toMatchObject({ 'class.vanguard': ['seen'], 'race.human': ['seen'], 'floor.halls': ['seen'] });
  });
});
