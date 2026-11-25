import { describe, expect, it } from 'vitest';
import {
  BUILDING_KIND,
  BUILDINGS,
  buildingNodes,
  checkKinds,
  CLASS_KIND,
  CONTENT_KINDS,
  DEITY_KIND,
  DOCTRINE_KIND,
  ITEMS,
  UPGRADE_KIND,
  UPGRADES,
} from '../../src/content';
import type { ContentKind, UpgradeNodeDef } from '../../src/content';
import { Registry } from '../../src/core';
import type { Def } from '../../src/core';

function withDefs<T extends Def>(kind: ContentKind<T>, defs: unknown[]): ContentKind<T> {
  const registry = new Registry<T>(kind.registry.kind);
  for (const def of defs) registry.register(def as T);
  return { ...kind, registry };
}

const hall = { id: 'building.hall', name: 'Hall', description: 'A test hall.', tags: [], kind: 'foundations' };
const other = { id: 'building.other', name: 'Other', description: 'Another hall.', tags: [], kind: 'tactics' };

function node(id: string, fields: Partial<UpgradeNodeDef> = {}): UpgradeNodeDef {
  return {
    id: `upgrade.${id}`,
    name: id,
    description: `Test node ${id}.`,
    tags: [],
    building: hall.id,
    tier: 1,
    column: 0,
    cost: { renown: 10 },
    requires: [],
    grants: [{ kind: 'capacity', key: 'partySize', amount: 1 }],
    ...fields,
  };
}

const stats = { kind: 'stat', has: (id: string) => id === 'hp' };

/** Problems with `nodes` in a world holding the two test buildings and the shipped classes and deities. */
function check(nodes: unknown[]): string[] {
  return checkKinds(
    [withDefs(BUILDING_KIND, [hall, other]), withDefs(UPGRADE_KIND, nodes), CLASS_KIND, DEITY_KIND],
    [stats, ITEMS],
  );
}

describe('upgrade node content', () => {
  it('is a registered content kind alongside buildings', () => {
    expect(CONTENT_KINDS).toContain(UPGRADE_KIND);
    expect(CONTENT_KINDS).toContain(BUILDING_KIND);
  });

  it('requires every building to be a Foundations or Tactics tree', () => {
    const problems = (defs: unknown[]) => checkKinds([withDefs(BUILDING_KIND, defs)], []);
    const noKind: Record<string, unknown> = { ...hall };
    delete noKind.kind;
    expect(problems([hall, other])).toEqual([]);
    expect(problems([noKind])).toEqual([expect.stringContaining('building "building.hall": kind')]);
    expect(problems([{ ...hall, kind: 'basics' }])).toEqual([expect.stringContaining('building "building.hall": kind')]);
  });

  it('gives the shipped buildings their kinds', () => {
    expect(BUILDINGS.all().map((b) => [b.id, b.kind])).toEqual([
      ['building.guild_hall', 'foundations'],
      ['building.smithy', 'foundations'],
    ]);
  });

  it('accepts a well-formed tree with every grant kind', () => {
    expect(
      check([
        node('a', { cost: { renown: 5, trophies: 2 } }),
        node('b', {
          tier: 2,
          requires: ['upgrade.a'],
          exclusiveGroup: 'hall.t2',
          grants: [{ kind: 'bundle', scope: 'party', bundle: { modifiers: [{ stat: 'hp', op: 'add', value: 2 }] } }],
        }),
        node('c', { tier: 2, column: 1, requires: ['upgrade.a'], exclusiveGroup: 'hall.t2', grants: [{ kind: 'unlock', id: 'class.vanguard' }] }),
      ]),
    ).toEqual([]);
  });

  it('rejects malformed shapes', () => {
    const problems = check([
      node('nocost', { cost: {} }),
      node('badcur', { column: 1, cost: { gold: 5 } }),
      node('nogrant', { column: 2, grants: [] }),
      node('badcap', { column: 3, grants: [{ kind: 'capacity', key: 'nope', amount: 1 } as never] }),
    ]);
    expect(problems).toEqual(
      expect.arrayContaining([
        expect.stringContaining('upgrade "upgrade.nocost": cost: must cost something'),
        expect.stringContaining('upgrade "upgrade.badcur": cost'),
        expect.stringContaining('upgrade "upgrade.nogrant": grants: must grant something'),
        expect.stringContaining('upgrade "upgrade.badcap": grants[0].key'),
      ]),
    );
  });

  it('reports refs to unknown buildings, nodes, stats, deities and unlock targets', () => {
    const problems = check([
      node('a', {
        building: 'building.nowhere',
        requires: ['upgrade.ghost'],
        cost: { 'favor:deity.nobody': 3 },
        grants: [
          { kind: 'unlock', id: 'class.nobody' },
          { kind: 'unlock', id: 'thing.x' },
          { kind: 'bundle', scope: 'run', bundle: { modifiers: [{ stat: 'luck', op: 'add', value: 1 }] } },
        ],
      }),
    ]);
    expect(problems).toEqual([
      'upgrade "upgrade.a": building refers to unknown building "building.nowhere"',
      'upgrade "upgrade.a": requires[0] refers to unknown upgrade "upgrade.ghost"',
      'upgrade "upgrade.a": cost.favor:deity.nobody refers to unknown deity "deity.nobody"',
      'upgrade "upgrade.a": grants[0].id refers to unknown class "class.nobody"',
      'upgrade "upgrade.a": grants[1].id refers to a thing, but there is no thing registry to check it in',
      'upgrade "upgrade.a": grants[2].bundle.modifiers[0].stat refers to unknown stat "luck"',
    ]);
  });

  it('grants the shared Bundle: triggers are checked, and an empty bundle is refused', () => {
    const problems = check([
      node('t', { grants: [{ kind: 'bundle', scope: 'party', bundle: { triggers: [{ on: 'trigger.nope', effects: [{ kind: 'heal', amount: 1 }] }] } }] }),
      node('e', { column: 1, grants: [{ kind: 'bundle', scope: 'party', bundle: {} }] }),
    ]);
    expect(problems).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^upgrade "upgrade\.e": grants\[0\]\.bundle: must change at least one stat or have a trigger/),
        expect.stringMatching(/^upgrade "upgrade\.t": grants\[0\]\.bundle\.triggers\[0\]\.on refers to .*trigger/),
      ]),
    );
  });

  it('expresses a doctrine choice as a pick-one pair of doctrine unlocks', () => {
    const doctrines = withDefs(DOCTRINE_KIND, [
      { id: 'doctrine.clear_floors', name: 'Clear floors', description: 'Explore every floor fully.', tags: [] },
      { id: 'doctrine.find_stairs', name: 'Find the stairs', description: 'Head down as soon as possible.', tags: [] },
    ]);
    const nodes = [
      node('a', { exclusiveGroup: 'hall.doctrine', grants: [{ kind: 'unlock', id: 'doctrine.clear_floors' }] }),
      node('b', { column: 1, exclusiveGroup: 'hall.doctrine', grants: [{ kind: 'unlock', id: 'doctrine.find_stairs' }] }),
    ];
    const kinds = [withDefs(BUILDING_KIND, [hall]), withDefs(UPGRADE_KIND, nodes)];
    expect(checkKinds([...kinds, doctrines], [stats])).toEqual([]);
    expect(checkKinds([...kinds, withDefs(DOCTRINE_KIND, [])], [stats])).toEqual([
      'upgrade "upgrade.a": grants[0].id refers to unknown doctrine "doctrine.clear_floors"',
      'upgrade "upgrade.b": grants[0].id refers to unknown doctrine "doctrine.find_stairs"',
    ]);
  });

  it('rules out cycles: a prerequisite must be on an earlier tier', () => {
    const problems = check([
      node('a', { tier: 2, requires: ['upgrade.b'] }),
      node('b', { tier: 2, column: 1, requires: ['upgrade.a'] }),
    ]);
    expect(problems).toHaveLength(2);
    for (const p of problems) expect(p).toMatch(/must be on an earlier tier .* rules out cycles/);
  });

  it('keeps prerequisites in the same building', () => {
    expect(check([node('a'), node('b', { building: other.id, tier: 2, requires: ['upgrade.a'] })])).toEqual([
      'upgrade "upgrade.b": requires[0] "upgrade.a" is in another building (building.hall)',
    ]);
  });

  it('checks pick-one groups and layout cells', () => {
    expect(
      check([
        node('a', { exclusiveGroup: 'hall.solo' }),
        node('b', { column: 1, exclusiveGroup: 'hall.split' }),
        node('c', { tier: 2, column: 1, exclusiveGroup: 'hall.split' }),
        node('d', { tier: 2, column: 1 }),
      ]),
    ).toEqual([
      'upgrade "upgrade.d": tier 2 column 1 is already taken by "upgrade.c"',
      'upgrade "upgrade.a": pick-one group "hall.solo" has no other node to choose between',
      'upgrade "upgrade.c": pick-one group "hall.split" must be on one tier of one building, like "upgrade.b"',
    ]);
  });
});

describe('the Guild Hall tree (ETH-132)', () => {
  const nodes = buildingNodes('building.guild_hall');
  const hasCapacity = (n: UpgradeNodeDef, key: string) => n.grants.some((g) => g.kind === 'capacity' && g.key === key);

  it('has no roster upgrades: the roster is a flat 50, and only the Second Berth widens the party here', () => {
    expect(nodes.some((n) => n.grants.some((g) => g.kind === 'capacity' && (g.key as string) === 'rosterSize'))).toBe(false);
    expect(nodes.filter((n) => hasCapacity(n, 'partySize')).map((n) => n.id)).toEqual(['upgrade.second_berth']);
    for (const id of ['upgrade.roster_ledger', 'upgrade.open_muster', 'upgrade.drill_yard', 'upgrade.third_berth', 'upgrade.fourth_berth']) {
      expect(UPGRADES.has(id), id).toBe(false);
    }
  });

  it('is two tiers of three rows, with Tier II gated by The Long Muster', () => {
    const hall = BUILDINGS.get('building.guild_hall');
    expect(hall.tierGates).toHaveLength(1);
    expect(hall.tierGates?.[0]?.fromTier).toBe(4);
    expect(Math.min(...nodes.map((n) => n.tier))).toBe(1);
    expect(Math.max(...nodes.map((n) => n.tier))).toBe(6);
    expect(hall.tierGates?.[0]?.unlock).toMatchObject({ kind: 'objectiveDone', owner: { kind: 'contract', id: 'contract.long_muster' }, exited: true });
  });

  it('offers a capability beside the numeric nodes in each tier', () => {
    for (const [from, to] of [
      [1, 3],
      [4, 6],
    ] as const) {
      const tier = nodes.filter((n) => n.tier >= from && n.tier <= to);
      expect(tier.some((n) => n.tags.includes('numeric')), `rows ${from}-${to} numeric`).toBe(true);
      expect(tier.some((n) => n.tags.includes('capability') || n.grants.some((g) => g.kind === 'unlock')), `rows ${from}-${to} capability`).toBe(true);
    }
  });

  it('puts the row 6 pick between a contract slot and an inert rule slot, and says the rule slot does nothing yet', () => {
    const pick = nodes.filter((n) => n.exclusiveGroup === 'guild_hall.row6');
    expect(pick.map((n) => n.id).sort()).toEqual(['upgrade.rule_clerk', 'upgrade.second_contract_board']);
    expect(pick.every((n) => n.tier === 6 && n.cost.renown === 3600)).toBe(true);
    expect(UPGRADES.get('upgrade.rule_clerk').description).toMatch(/does nothing until/);
  });

  it('ranks the numeric nodes at the specced prices', () => {
    const ranks = (id: string) => UPGRADES.get(id).ranks;
    expect(ranks('upgrade.hardy_recruits')).toEqual({ max: 5, costGrowth: 1.5 });
    expect(ranks('upgrade.contract_bounty')).toEqual({ max: 3, costGrowth: 1.5 });
    expect(ranks('upgrade.guild_chronicles')).toEqual({ max: 3, costGrowth: 1.6 });
    expect(ranks('upgrade.seasoned_constitution')).toEqual({ max: 3, costGrowth: 1.5 });
    expect(UPGRADES.get('upgrade.hardy_recruits').cost).toEqual({ renown: 120 });
    expect(UPGRADES.get('upgrade.second_berth').cost).toEqual({ renown: 1200 });
  });

  it('keeps the ids of surviving nodes under their new names', () => {
    expect(UPGRADES.get('upgrade.outrider_training').name).toBe("Scout's Charter");
    expect(UPGRADES.get('upgrade.lorekeeper_training').name).toBe('Library Ties');
    expect(UPGRADES.get('upgrade.fenling_recruitment').name).toBe('Marsh Envoy');
    expect(UPGRADES.get('upgrade.contract_board').exclusiveGroup).toBe('guild_hall.row3');
  });
});
