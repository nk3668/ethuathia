/**
 * The Guild Hall tree (ETH-132): the Long Muster gate on Tier II, what the rebuilt nodes do in a run
 * (Guild Chronicles' XP and the Mastery that follows, Contract Bounty, Seasoned Constitution, the
 * Medic's Satchel kit) and the save migration that refunds the nodes that left the tree.
 */
import { describe, expect, it } from 'vitest';
import { BUILDINGS, CONTRACT_LONG_MUSTER, CONTRACTS, tierGateId, UPGRADES } from '../../src/content';
import {
  applyRunResult,
  buildRunConfig,
  canPurchase,
  decodeSave,
  defaultRunChoices,
  describeGate,
  describeGrant,
  encodeSave,
  isMilestoneOpen,
  masteryShares,
  newProfile,
  purchase,
  questOffer,
  upgradeBonusModifiers,
  upgradeStartConfig,
} from '../../src/meta';
import type { Profile } from '../../src/meta';
import { checkInvariants, createRun, emptyRunResult, getEntity, getStat, grantKillXp, grantXp, runResult, snapshot, STAT_IDS, step, XP_TRACKER } from '../../src/sim';
import type { ActorEntity, Emit, Entity, EntityId, RunResult, SimEvent } from '../../src/sim';
import { REMOVED_GUILD_HALL_NODES } from '../../src/meta/slices/legacyUpgrades';
import { contractReward } from '../../src/sim/quests/contracts';
import { inventoryOf } from '../../src/sim/items/inventory';
import { soldOnExit } from '../../src/sim/items/sale';

const GATE = tierGateId('building.guild_hall', 4);

const own = (profile: Profile, ids: readonly string[], ranks: Record<string, number> = {}): Profile => ({
  ...profile,
  upgrades: { owned: [...profile.upgrades.owned, ...ids], ranks: { ...profile.upgrades.ranks, ...ranks } },
});
const rich = (renown = 100_000): Profile => {
  const p = newProfile();
  return { ...p, currencies: { ...p.currencies, renown } };
};
const longMuster = (outcome: RunResult['outcome']): RunResult => ({
  ...emptyRunResult(outcome),
  extras: { 'quests.objectives': [{ key: `contract:${CONTRACT_LONG_MUSTER.id}`, owner: { kind: 'contract', id: CONTRACT_LONG_MUSTER.id }, status: 'complete' }] },
});

/** A run config from `profile`'s upgrades, one adventurer. */
function runFor(profile: Profile, seed = 3) {
  const config = buildRunConfig(profile, defaultRunChoices(), seed);
  return createRun({ ...config, party: config.party.slice(0, 1) }, seed);
}

describe('Tier II and The Long Muster', () => {
  it('keeps rows 4 to 6 locked, however rich the player is, until the quest is done', () => {
    const p = rich();
    const check = canPurchase(p, 'upgrade.medics_satchel');
    expect(check).toMatchObject({ ok: false, status: 'locked' });
    expect(check.ok ? '' : check.reason).toMatch(/Tier 4 and up open when you/);
    // Tier I rows are open.
    expect(canPurchase(p, 'upgrade.second_berth')).toEqual({ ok: true });
    expect(isMilestoneOpen(p, GATE)).toBe(false);
  });

  it('opens on a retreat or a victory with the quest done, not on a wipe', () => {
    expect(isMilestoneOpen(applyRunResult(rich(), longMuster('wipe')), GATE)).toBe(false);
    for (const outcome of ['retreat', 'victory'] as const) {
      const after = applyRunResult(rich(), longMuster(outcome));
      expect(isMilestoneOpen(after, GATE), outcome).toBe(true);
      expect(canPurchase(after, 'upgrade.medics_satchel')).toEqual({ ok: true });
      expect(canPurchase(after, 'upgrade.rule_clerk')).toEqual({ ok: true });
    }
  });

  it('is a reach-floor-6 contract named in the gate text, offered once half of Tier I is bought', () => {
    expect(CONTRACTS.get(CONTRACT_LONG_MUSTER.id).objective).toEqual({ kind: 'reach', depth: 6 });
    const gate = BUILDINGS.get('building.guild_hall').tierGates?.[0];
    expect(gate && describeGate(gate)).toContain('Tier 4 and up open when you');
    const below = own(newProfile(), ['upgrade.second_berth', 'upgrade.outrider_training']);
    expect(questOffer(below, CONTRACT_LONG_MUSTER).state).toBe('locked');
    // Seven open nodes in Tier I (a ranked node counts by its ranks, a pick-one group as one): four bought is past half.
    expect(questOffer(own(below, ['upgrade.fenling_recruitment', 'upgrade.contract_board']), CONTRACT_LONG_MUSTER)).toEqual({ state: 'offered' });
  });
});

describe('Guild Chronicles: in-run XP, and the Mastery that follows', () => {
  const collect = (turn: number): { events: SimEvent[]; emit: Emit } => {
    const events: SimEvent[] = [];
    return { events, emit: (e) => events.push({ ...e, turn }) };
  };

  /** XP an adventurer ends a run with after 100 XP is granted, and the run result it leads to. */
  function earn(profile: Profile): { xp: number; result: RunResult } {
    const state = runFor(profile);
    const id = state.party[0] as EntityId;
    const hero = state.entities[id] as never;
    const { events, emit } = collect(state.turn);
    grantXp(state, hero, 100, 'kill', 'monster.gloam_rat', emit);
    const tracker = events.reduce((s, e) => XP_TRACKER.reduce(s, e), XP_TRACKER.init());
    const adventurer = (state.entities[id] as { adventurer: { name: string; classId: string; raceId: string } }).adventurer;
    const result: RunResult = {
      ...emptyRunResult('retreat'),
      extras: { 'run.party': [{ actor: id, ...adventurer }], 'track.xp': tracker },
    };
    return { xp: (tracker as { byActor: Record<number, { xp: number }> }).byActor[id]?.xp ?? 0, result };
  }

  it('multiplies the XP every grant gives by 10% per rank', () => {
    expect(earn(newProfile()).xp).toBe(100);
    expect(earn(own(newProfile(), ['upgrade.guild_chronicles'])).xp).toBe(110);
    expect(earn(own(newProfile(), ['upgrade.guild_chronicles'], { 'upgrade.guild_chronicles': 3 })).xp).toBe(130);
  });

  it('feeds class Mastery through the XP earned, and leaves the run-end bonus alone', () => {
    const plain = masteryShares(earn(newProfile()).result)[0];
    const boosted = masteryShares(earn(own(newProfile(), ['upgrade.guild_chronicles'], { 'upgrade.guild_chronicles': 3 })).result)[0];
    expect(plain?.members[0]?.gained).toBe(100);
    expect(boosted?.members[0]?.gained).toBe(130);
    expect(boosted?.bonus).toEqual(plain?.bonus);
  });

  it('changes nothing else: no XP bonus, no modifier', () => {
    expect(upgradeBonusModifiers(own(newProfile(), ['upgrade.second_berth', 'upgrade.hardy_recruits']))).toEqual([]);
    expect(upgradeBonusModifiers(own(newProfile(), ['upgrade.guild_chronicles'], { 'upgrade.guild_chronicles': 2 }))).toEqual([
      { key: 'upgrade.guild_chronicles:bonus', source: { id: 'upgrade.guild_chronicles', label: 'Guild Chronicles' }, scope: 'party', xpBonus: 0.2 },
    ]);
  });

  it('carries fractional XP across small threat-1 kills for both solo and multi-member parties', () => {
    const soloProfile = own(newProfile(), ['upgrade.guild_chronicles']);
    const solo = runFor(soloProfile);
    const hero = getEntity(solo, solo.party[0] as EntityId) as ActorEntity;
    const foe = { id: 999, def: 'monster.gloam_rat', floor: hero.floor, pos: { ...hero.pos } } as Entity;
    for (let i = 0; i < 10; i++) grantKillXp(solo, hero, foe, 1, () => undefined);
    expect(hero.growth?.xp).toBe(11);
    expect(hero.growth?.xpRemainder).toBeUndefined();
    expect(checkInvariants(solo)).toEqual([]);

    const duoProfile = own(newProfile(), ['upgrade.guild_chronicles', 'upgrade.second_berth']);
    const duoCfg = buildRunConfig(duoProfile, defaultRunChoices(), 3);
    const duo = createRun({ ...duoCfg, floorTexts: [['#####', '#<@.#', '#####']], depth: 1, monsters: false }, 3);
    const a = getEntity(duo, duo.party[0] as EntityId) as ActorEntity;
    const b = getEntity(duo, duo.party[1] as EntityId) as ActorEntity;
    const nearbyFoe = { id: 999, def: 'monster.gloam_rat', floor: a.floor, pos: { x: a.pos.x + 1, y: a.pos.y } } as Entity;
    for (let i = 0; i < 10; i++) grantKillXp(duo, a, nearbyFoe, 1, () => undefined);
    expect(a.growth?.xp).toBe(11);
    expect(b.growth?.xp).toBe(11);
    expect(checkInvariants(duo)).toEqual([]);
  });
});

describe('The Long Muster end-to-end', () => {
  it('completes on floor 6 at the descending adventurer’s position and wins on return', () => {
    const floorTexts = Array.from({ length: 6 }, (_, i) => [
      '#########',
      i === 0 ? '#<@....>#' : i === 5 ? '#<......#' : '#<.....>#',
      '#########',
    ]);
    const state = createRun(
      { party: [{ name: 'Brannoc', classId: 'class.vanguard', raceId: 'race.human' }], depth: 6, floorTexts, monsters: false, contracts: [CONTRACT_LONG_MUSTER.id] },
      1,
    );
    const events: SimEvent[] = [];
    for (let i = 0; i < 400 && state.domains.run.end === null; i++) {
      events.push(...step(state, []));
      expect(checkInvariants(state)).toEqual([]);
    }
    const done = events.find((e): e is Extract<SimEvent, { type: 'contractCompleted' }> => e.type === 'contractCompleted');
    expect(done).toMatchObject({ contract: CONTRACT_LONG_MUSTER.id, actor: state.party[0], floor: 'd6' });
    expect(done?.pos.x).toBeGreaterThan(0);
    expect(runResult(state).outcome).toBe('victory');
  });
});

describe('grantText stat coverage', () => {
  it('has human-readable names for every stat id', () => {
    for (const stat of STAT_IDS) {
      const text = describeGrant({ kind: 'bundle', scope: 'party', bundle: { modifiers: [{ stat, op: 'add', value: 1 }] } });
      expect(text).not.toMatch(/statusResist|trapSpot|forceDoor/);
    }
    for (const stat of ['identify', 'statusResist', 'trapSpot', 'disarm', 'flee', 'forceDoor'] as const) {
      const text = describeGrant({ kind: 'bundle', scope: 'party', bundle: { modifiers: [{ stat, op: 'add', value: 1 }] } });
      expect(text, stat).toContain('(%)');
    }
  });
});

describe('Contract Bounty', () => {
  it('adds 10% per rank to the pay of a contract, announced in the snapshot', () => {
    const base = contractReward('contract.recover_relic');
    const plain = runFor(newProfile());
    expect(contractReward('contract.recover_relic', plain)).toEqual(base);
    const bounty = runFor(own(newProfile(), ['upgrade.contract_bounty'], { 'upgrade.contract_bounty': 3 }));
    const boosted = contractReward('contract.recover_relic', bounty);
    for (const [currency, amount] of Object.entries(base)) expect(boosted[currency]).toBe(Math.floor(amount * 1.3 + 1e-9));
    expect(snapshot(bounty).domains.quests.contracts[0]?.reward).toEqual(boosted);
  });
});

describe('Seasoned Constitution', () => {
  it('adds 8 status resistance per rank', () => {
    const resist = (profile: Profile) => {
      const state = runFor(profile);
      return getStat(state, state.entities[state.party[0] as EntityId] as never, 'statusResist');
    };
    const plain = resist(newProfile());
    const seasoned = resist(own(newProfile(), ['upgrade.seasoned_constitution'], { 'upgrade.seasoned_constitution': 2 }));
    expect(seasoned.value).toBe(plain.value + 16);
    expect(seasoned.parts).toContainEqual({ op: 'add', value: 8, source: { id: 'upgrade.seasoned_constitution', label: 'Seasoned Constitution' } });
  });
});

describe("Medic's Satchel", () => {
  it('starts every adventurer with a mending draught that is kit, so it is never sold', () => {
    const profile = own(newProfile(), ['upgrade.medics_satchel']);
    expect(upgradeStartConfig(newProfile()).startStock).toBeUndefined();
    expect(upgradeStartConfig(profile).startStock).toEqual([{ item: 'item.mending_draught', qty: 1, each: true }]);
    const state = createRun(buildRunConfig({ ...profile, upgrades: { ...profile.upgrades, owned: [...profile.upgrades.owned, 'upgrade.second_berth'] } }, defaultRunChoices(), 4), 4);
    expect(state.party.length).toBeGreaterThan(0);
    for (const id of state.party) {
      const pack = inventoryOf(state.entities[id] as never);
      const draught = pack.find((i) => i.def === 'item.mending_draught');
      expect(draught?.qty).toBe(1);
      expect(draught?.kit).toBe(true);
      expect(soldOnExit(draught as never)).toBe(false);
    }
    // A kit potion is a valid item state.
    expect(checkInvariants(state)).toEqual([]);
  });
});

describe('the roster ledger refund (save migration)', () => {
  const REMOVED = Object.keys(REMOVED_GUILD_HALL_NODES);

  it('refunds each removed node at its old price and keeps the nodes that kept their id', () => {
    const old = own(newProfile(), ['upgrade.second_berth', ...REMOVED, 'upgrade.hardy_recruits', 'upgrade.contract_board'], { 'upgrade.hardy_recruits': 3 });
    const saved = { ...old, currencies: { ...old.currencies, renown: 10 } };
    const envelope = JSON.parse(encodeSave(saved, 5)) as { version: number };
    envelope.version = 1;
    const decoded = decodeSave(JSON.stringify(envelope));
    if (!decoded.ok) throw new Error(decoded.error);
    const total = Object.values(REMOVED_GUILD_HALL_NODES).reduce((a, b) => a + b, 0);
    expect(total).toBe(80 + 250 + 600 + 400 + 400);
    expect(decoded.profile.currencies.renown).toBe(10 + total);
    expect(decoded.profile.upgrades.owned).toEqual(['upgrade.second_berth', 'upgrade.hardy_recruits', 'upgrade.contract_board']);
    expect(decoded.profile.upgrades.ranks).toEqual({ 'upgrade.hardy_recruits': 3 });
    for (const id of REMOVED) expect(UPGRADES.has(id), id).toBe(false);
  });

  it('leaves a current save alone, and a save with none of the removed nodes', () => {
    const p = purchase(rich(1000), 'upgrade.second_berth');
    const current = decodeSave(encodeSave(p, 1));
    expect(current.ok && current.profile).toEqual(p);
    const envelope = JSON.parse(encodeSave(p, 1)) as { version: number };
    envelope.version = 1;
    const migrated = decodeSave(JSON.stringify(envelope));
    expect(migrated.ok && migrated.profile).toEqual(p);
  });

  it('strips removed keys from ranks and creates currencies if missing during migration', () => {
    const p = rich(0);
    const env = JSON.parse(encodeSave(p, 1)) as { version: number; slices: Record<string, { version: number; data: Record<string, unknown> }> };
    env.version = 1;
    env.slices.upgrades = { version: 2, data: { owned: ['upgrade.drill_yard'], ranks: { 'upgrade.drill_yard': 2 } } };
    delete env.slices.currencies;
    const decoded = decodeSave(JSON.stringify(env));
    if (!decoded.ok) throw new Error(decoded.error);
    expect(decoded.profile.upgrades.owned).toEqual([]);
    expect(decoded.profile.upgrades.ranks).toEqual({});
    expect(decoded.profile.currencies.renown).toBe(REMOVED_GUILD_HALL_NODES['upgrade.drill_yard']);
  });
});
