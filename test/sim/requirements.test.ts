/**
 * Shared conditions (ETH-121): run-scope conditions, the data `Requirement`, its wording, its
 * validation, `track.requirements` and the `metInRun` milestone. Fixed seeds, hand-built floors.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BUILDING_KIND, BUILDINGS, checkKinds, describeMilestone, describeMilestoneMet, ENCHANT_KEEN, requirementKey, requirementSchema, UPGRADES } from '../../src/content';
import type { BuildingDef, ContentKind, Requirement } from '../../src/content';
import { Registry } from '../../src/core';
import { applyRunResult, buildRunConfig, defaultRunChoices, isMilestoneOpen, milestoneRequirements, newProfile } from '../../src/meta';
import {
  checkInvariants,
  checkRequirement,
  chooseRule,
  CONDITION_TARGET,
  CONDITIONS,
  createRun,
  describeRequirement,
  deserialize,
  getEntity,
  IDENTIFIED_TRACKER_ID,
  identifiedCount,
  KILLS_TRACKER,
  metRequirements,
  placeItem,
  requirementProblems,
  requirementScope,
  runIdentified,
  runKills,
  runResult,
  serialize,
  spawnMonster,
  step,
  waitDecide,
} from '../../src/sim';
import type { ActorEntity, AiActor, AiCtx, EntityId, ItemInstance, RunConfig, RunState } from '../../src/sim';

const HERO = { name: 'Brannoc', classId: 'class.vanguard', raceId: 'race.human' };
const D1 = ['##########', '#<@.....>#', '##########'];
const D2 = ['##########', '#<......>#', '##########'];
const D3 = ['##########', '#<.......#', '##########'];
const CONFIG: RunConfig = { party: [HERO], depth: 3, floorTexts: [D1, D2, D3], monsters: false };

const AT_3: Requirement = { cond: 'cond.at_depth', params: { depth: 3 } };

function aiCtx(state: RunState): AiCtx {
  return { state, actor: getEntity(state, state.party[0] as number) as AiActor };
}

/** Steps until `done` holds or the run ends, checking invariants. */
function stepUntil(state: RunState, done: () => boolean, cap = 400): void {
  for (let i = 0; i < cap && state.domains.run.end === null && !done(); i++) {
    step(state, []);
    expect(checkInvariants(state)).toEqual([]);
  }
}

describe('condition scopes', () => {
  it('mark the run-level conditions run and leave the rest actor', () => {
    for (const id of ['cond.always', 'cond.heading_out', 'cond.bottom_floor', 'cond.contracts_complete', 'cond.at_depth', 'cond.run_kills', 'cond.run_identified']) {
      expect(CONDITIONS.get(id).scope, id).toBe('run');
    }
    expect(CONDITIONS.get('cond.hp_below').scope).toBe('actor');
    expect(CONDITIONS.get('cond.stuck').scope).toBe('actor');
  });

  it('give a run-scope condition the same answer in a rule and in a requirement', () => {
    const state = createRun(CONFIG, 1);
    const check = () => {
      for (const id of ['cond.bottom_floor', 'cond.heading_out', 'cond.always']) {
        const inRule = CONDITIONS.get(id).evaluate(aiCtx(state), undefined);
        expect(checkRequirement({ state }, { cond: id })).toEqual(inRule);
      }
    };
    check();
    stepUntil(state, () => getEntity(state, state.party[0] as number).floor === 'd3');
    expect(checkRequirement({ state }, { cond: 'cond.bottom_floor' }).ok).toBe(true);
    check();
    stepUntil(state, () => state.domains.run.leaving !== null);
    expect(checkRequirement({ state }, { cond: 'cond.heading_out' }).ok).toBe(true);
    check();
  });

  it('never let an actor condition hold without an actor', () => {
    const state = createRun(CONFIG, 1);
    expect(checkRequirement({ state }, { cond: 'cond.hp_below', params: { percent: 99 } })).toEqual({
      ok: false,
      detail: 'needs an adventurer to check',
    });
  });
});

describe('requirements', () => {
  const state = createRun(CONFIG, 1);
  const always: Requirement = { cond: 'cond.always' };
  const never: Requirement = { not: always };

  it('combine with all, any and not', () => {
    expect(checkRequirement({ state }, always).ok).toBe(true);
    expect(checkRequirement({ state }, never).ok).toBe(false);
    expect(checkRequirement({ state }, { all: [always, always] }).ok).toBe(true);
    expect(checkRequirement({ state }, { all: [always, never] }).ok).toBe(false);
    expect(checkRequirement({ state }, { any: [never, always] }).ok).toBe(true);
    expect(checkRequirement({ state }, { any: [never, never] }).ok).toBe(false);
    expect(checkRequirement({ state }, { not: { any: [never] } }).ok).toBe(true);
    expect(checkRequirement({ state }, { cond: 'cond.nope' })).toEqual({ ok: false, detail: 'unknown condition "cond.nope"' });
  });

  it('are worded from each condition', () => {
    const hurt: Requirement = { cond: 'cond.hp_below', params: { percent: 30 } };
    expect(describeRequirement({ all: [hurt, { not: { cond: 'cond.bottom_floor' } }] })).toBe('HP below 30% and not on the bottom floor');
    expect(describeRequirement({ any: [AT_3, { cond: 'cond.heading_out' }, always] })).toBe(
      'on floor 3 or deeper, heading out of the dungeon or always',
    );
    expect(describeRequirement({ all: [{ any: [hurt, AT_3] }, always] })).toBe('(HP below 30% or on floor 3 or deeper) and always');
    expect(describeMilestone({ kind: 'metInRun', requirement: AT_3 }, describeRequirement)).toBe('Achieve in one run: on floor 3 or deeper');
  });

  it('know their scope and report problems for it', () => {
    const hurt: Requirement = { cond: 'cond.hp_below', params: { percent: 30 } };
    expect(requirementScope({ all: [AT_3, always] })).toBe('run');
    expect(requirementScope({ all: [AT_3, hurt] })).toBe('actor');
    expect(requirementProblems({ all: [AT_3, hurt] }, 'actor')).toEqual([]);
    expect(requirementProblems({ all: [AT_3, hurt] }, 'run')).toEqual([
      'requirement.all[1].cond: condition "cond.hp_below" needs an adventurer to check, but this requirement is checked for the whole run',
    ]);
    expect(requirementProblems({ not: { cond: 'cond.at_depth', params: { depth: 0 } } }, 'run')[0]).toMatch(/not\.cond: .*bad params/);
    expect(requirementProblems({ cond: 'cond.nope' }, 'run')).toEqual(['requirement.cond: unknown condition "cond.nope"']);
  });

  it('have a schema and a key that ignores key order', () => {
    expect(requirementSchema.safeParse({ all: [AT_3, { not: { cond: 'cond.always' } }] }).success).toBe(true);
    expect(requirementSchema.safeParse({ all: [] }).success).toBe(false);
    expect(requirementSchema.safeParse({ cond: 'always' }).success).toBe(false);
    expect(requirementSchema.safeParse({ cond: 'cond.always', extra: 1 }).success).toBe(false);
    expect(requirementKey({ params: { depth: 3 }, cond: 'cond.at_depth' } as Requirement)).toBe(requirementKey(AT_3));
  });

  it('are checked by content validation against the conditions', () => {
    expect(CONDITION_TARGET.kind).toBe(CONDITIONS.kind);
    const registry = new Registry<BuildingDef>('building');
    const kind: ContentKind<BuildingDef> = { ...BUILDING_KIND, registry };
    const base = { name: 'Hut', description: 'A hut.', tags: [], kind: 'foundations' as const };
    const unlock = (requirement: Requirement) => ({ kind: 'metInRun' as const, requirement });
    registry.register({ ...base, id: 'building.ok', unlock: unlock({ all: [AT_3, { cond: 'cond.heading_out' }] }) });
    registry.register({ ...base, id: 'building.unknown', unlock: unlock({ cond: 'cond.nope' }) });
    registry.register({ ...base, id: 'building.actor', unlock: unlock({ any: [AT_3, { cond: 'cond.stuck' }] }) });
    registry.register({ ...base, id: 'building.params', unlock: unlock({ cond: 'cond.at_depth' }) });
    const problems = checkKinds([kind] as ContentKind[], [CONDITION_TARGET]);
    expect(problems.some((p) => p.includes('building.ok'))).toBe(false);
    expect(problems).toContain('building "building.unknown": unlock.requirement.cond refers to unknown rule condition "cond.nope"');
    expect(problems.some((p) => p.includes('building.actor') && p.includes('unlock.requirement.any[1].cond') && p.includes('needs an adventurer'))).toBe(true);
    expect(problems.some((p) => p.includes('building.params') && p.includes('bad params'))).toBe(true);
  });
});

describe('track.requirements and metInRun', () => {
  afterEach(() => vi.restoreAllMocks());

  it('records a watched requirement the run met, once, and survives a save', () => {
    const state = createRun({ ...CONFIG, watchRequirements: [AT_3, { cond: 'cond.heading_out' }] }, 1);
    stepUntil(state, () => getEntity(state, state.party[0] as number).floor === 'd2');
    expect(state.domains.run.trackers['track.requirements']).toEqual({ met: [] });
    stepUntil(state, () => false);
    expect(state.domains.run.end).not.toBeNull();
    const met = metRequirements(runResult(state).extras);
    expect(met).toEqual([requirementKey(AT_3), requirementKey({ cond: 'cond.heading_out' })]);
    expect(deserialize(serialize(state)).domains.run.trackers).toEqual(state.domains.run.trackers);
  });

  it('watches nothing by default', () => {
    const state = createRun(CONFIG, 1);
    stepUntil(state, () => false);
    expect(metRequirements(runResult(state).extras)).toEqual([]);
  });

  it('unlocks a metInRun milestone from a fixed-seed run that reaches floor 3', () => {
    const hall: BuildingDef = {
      id: 'building.deep_hall',
      name: 'Deep Hall',
      description: 'Opens once a party stands on floor 3.',
      tags: [],
      kind: 'foundations',
      unlock: { kind: 'metInRun', requirement: AT_3 },
    };
    vi.spyOn(BUILDINGS, 'all').mockReturnValue([...BUILDINGS.all(), hall]);
    const profile = newProfile();
    expect(isMilestoneOpen(profile, hall.id)).toBe(false);
    expect(milestoneRequirements(profile)).toContainEqual(AT_3);
    expect(buildRunConfig(profile, defaultRunChoices(), 1).watchRequirements).toContainEqual(AT_3);

    // A run that stops short of floor 3 opens nothing.
    const shallow = createRun({ ...CONFIG, depth: 2, floorTexts: [D1, D3], watchRequirements: [AT_3] }, 1);
    stepUntil(shallow, () => false);
    const after = applyRunResult(profile, runResult(shallow));
    expect(isMilestoneOpen(after, hall.id)).toBe(false);

    const deep = createRun({ ...CONFIG, watchRequirements: [AT_3] }, 1);
    stepUntil(deep, () => false);
    const opened = applyRunResult(after, runResult(deep));
    expect(isMilestoneOpen(opened, hall.id)).toBe(true);
    expect(opened.milestones.unlocked).toContainEqual({ id: hall.id, run: 2 });
    // Once open, it is no longer watched.
    expect(milestoneRequirements(opened)).not.toContainEqual(AT_3);
  });
});

describe('cond.run_kills and cond.run_identified (ETH-184)', () => {
  const ROOM = ['############', '#<@........#', '#..........#', '#..........#', '#..........#', '############'];

  it('validates min counts on both conditions in requirements and content', () => {
    for (const id of ['cond.run_kills', 'cond.run_identified'] as const) {
      expect(requirementProblems({ cond: id, params: { min: 1 } }, 'run')).toEqual([]);
      expect(requirementProblems({ cond: id }, 'run')[0]).toMatch(/bad params/);
      expect(requirementProblems({ cond: id, params: { min: 0 } }, 'run')[0]).toMatch(/bad params/);
      expect(requirementProblems({ cond: id, params: { min: -2 } }, 'run')[0]).toMatch(/bad params/);
      expect(requirementProblems({ cond: id, params: { min: 1.5 } }, 'run')[0]).toMatch(/bad params/);
      expect(requirementProblems({ cond: id, params: { min: 1, extra: 1 } }, 'run')[0]).toMatch(/bad params/);
    }

    const registry = new Registry<BuildingDef>('building');
    const kind: ContentKind<BuildingDef> = { ...BUILDING_KIND, registry };
    const base = { name: 'Hut', description: 'A hut.', tags: [], kind: 'foundations' as const };
    registry.register({ ...base, id: 'building.ok_kills', unlock: { kind: 'metInRun', requirement: { cond: 'cond.run_kills', params: { min: 40 } } } });
    registry.register({ ...base, id: 'building.bad_id', unlock: { kind: 'metInRun', requirement: { cond: 'cond.run_identified', params: { min: 0 } } } });
    const problems = checkKinds([kind] as ContentKind[], [CONDITION_TARGET]);
    expect(problems.some((p) => p.includes('building.ok_kills'))).toBe(false);
    expect(problems.some((p) => p.includes('building.bad_id') && p.includes('bad params'))).toBe(true);
  });

  it('words singular and plural thresholds for tooltips and milestones', () => {
    const k1: Requirement = { cond: 'cond.run_kills', params: { min: 1 } };
    const k40: Requirement = { cond: 'cond.run_kills', params: { min: 40 } };
    const i1: Requirement = { cond: 'cond.run_identified', params: { min: 1 } };
    const i5: Requirement = { cond: 'cond.run_identified', params: { min: 5 } };
    expect(describeRequirement(k1)).toBe('killed a monster');
    expect(describeRequirement(k40)).toBe('killed 40 monsters');
    expect(describeRequirement(i1)).toBe('identified an item');
    expect(describeRequirement(i5)).toBe('identified 5 items');
    expect(describeMilestone({ kind: 'metInRun', requirement: k40 }, describeRequirement)).toBe('Achieve in one run: killed 40 monsters');
    expect(describeMilestoneMet({ kind: 'metInRun', requirement: i5 }, describeRequirement)).toBe('you achieved in one run: identified 5 items');
  });

  it('checks cond.run_kills at the boundary from party kills only', () => {
    const state = createRun({ party: [HERO], depth: 1, floorTexts: [ROOM], monsters: false }, 1);
    const hero = getEntity(state, state.party[0] as EntityId) as ActorEntity;
    // Give the hero enough accuracy/damage to finish adjacent rats promptly.
    if (hero.stats !== undefined) {
      hero.stats.base.accuracy = 20;
      hero.stats.base.damage = 5;
      hero.stats.base.armor = 10;
    }

    const req3: Requirement = { cond: 'cond.run_kills', params: { min: 3 } };
    expect(runKills(state)).toBe(0);
    expect(checkRequirement({ state }, req3)).toEqual({ ok: false, detail: '' });

    // Non-party kills do not count toward party kills.
    const nonPartyState = KILLS_TRACKER.reduce(KILLS_TRACKER.init(), {
      type: 'killed',
      killer: 99,
      killerDef: 'monster.gloam_rat',
      byParty: false,
      victim: hero.id,
      victimDef: 'actor.adventurer',
      threat: 0,
      floor: 'd1',
      pos: { x: 1, y: 1 },
      turn: 1,
    });
    expect(nonPartyState.kills).toBe(0);
    expect(runKills(state)).toBe(0);

    // Two kills: min - 1 is false.
    for (let k = 0; k < 2; k++) {
      const rat = spawnMonster(state, 'monster.gloam_rat', 'd1', { x: hero.pos.x + 1, y: hero.pos.y });
      rat.actor = { ...(rat.actor as NonNullable<typeof rat.actor>), hp: 1 };
      step(state, [{ type: 'playerAction', actor: hero.id, action: { id: 'attack', dir: { x: 1, y: 0 } } }], { decide: waitDecide });
    }
    expect(runKills(state)).toBe(2);
    expect(checkRequirement({ state }, req3).ok).toBe(false);
    expect(CONDITIONS.get('cond.run_kills').evaluate(aiCtx(state), { min: 3 })).toEqual(checkRequirement({ state }, req3));

    // Third kill crosses boundary (min is true); fourth kill keeps it true (min + 1).
    for (let k = 2; k < 4; k++) {
      const rat = spawnMonster(state, 'monster.gloam_rat', 'd1', { x: hero.pos.x + 1, y: hero.pos.y });
      rat.actor = { ...(rat.actor as NonNullable<typeof rat.actor>), hp: 1 };
      step(state, [{ type: 'playerAction', actor: hero.id, action: { id: 'attack', dir: { x: 1, y: 0 } } }], { decide: waitDecide });
      expect(runKills(state)).toBe(k + 1);
      expect(checkRequirement({ state }, req3).ok).toBe(true);
      expect(CONDITIONS.get('cond.run_kills').evaluate(aiCtx(state), { min: 3 })).toEqual(checkRequirement({ state }, req3));
    }
    expect(checkInvariants(state)).toEqual([]);
  });

  it('tracks itemIdentified events across equip, use and Scroll of Identify at the boundary, and survives save/load', () => {
    const state = createRun({ party: [HERO], depth: 1, floorTexts: [ROOM], monsters: false }, 2);
    const hero = getEntity(state, state.party[0] as EntityId) as ActorEntity;
    hero.inventory = {
      items: [
        { def: 'item.arming_sword', qty: 1, identified: false },
        { def: 'item.mending_draught', qty: 1, identified: false },
        { def: 'item.scroll_of_identify', qty: 1 },
        { def: 'item.iron_cap', qty: 1, identified: false },
        { def: 'item.soft_boots', qty: 1, identified: false },
      ],
    };

    const req3: Requirement = { cond: 'cond.run_identified', params: { min: 3 } };
    expect(runIdentified(state)).toBe(0);
    expect(checkRequirement({ state }, req3).ok).toBe(false);

    // 1. Equip unidentified sword -> 1 identified (below min 3).
    step(state, [{ type: 'playerAction', actor: hero.id, action: { id: 'equip', index: 0 } }], { decide: waitDecide });
    expect(runIdentified(state)).toBe(1);
    expect(checkRequirement({ state }, req3).ok).toBe(false);

    // 2. Use unidentified potion -> 2 identified (min - 1, still false).
    step(state, [{ type: 'playerAction', actor: hero.id, action: { id: 'use', index: 0 } }], { decide: waitDecide });
    expect(runIdentified(state)).toBe(2);
    expect(checkRequirement({ state }, req3).ok).toBe(false);
    expect(CONDITIONS.get('cond.run_identified').evaluate(aiCtx(state), { min: 3 })).toEqual(checkRequirement({ state }, req3));

    // Save/load preserves track.identified.
    const reloaded = deserialize(serialize(state));
    expect(runIdentified(reloaded)).toBe(2);

    // 3. Scroll of Identify reveals iron_cap (pack[0] after scroll is consumed) -> 3 identified (min, true!).
    step(reloaded, [{ type: 'playerAction', actor: hero.id, action: { id: 'use', index: 0 } }], { decide: waitDecide });
    expect(runIdentified(reloaded)).toBe(3);
    expect(checkRequirement({ state: reloaded }, req3).ok).toBe(true);
    expect(CONDITIONS.get('cond.run_identified').evaluate(aiCtx(reloaded), { min: 3 })).toEqual(checkRequirement({ state: reloaded }, req3));

    // 4. Equip the still-unidentified soft_boots (pack[1]) -> 4 identified (min + 1, true).
    step(reloaded, [{ type: 'playerAction', actor: hero.id, action: { id: 'equip', index: 1 } }], { decide: waitDecide });
    expect(runIdentified(reloaded)).toBe(4);
    expect(checkRequirement({ state: reloaded }, req3).ok).toBe(true);

    // 5. Wits-on-pickup identification also counts toward track.identified.
    const reloadedHero = getEntity(reloaded, reloaded.party[0] as EntityId) as ActorEntity;
    if (reloadedHero.stats !== undefined) reloadedHero.stats.base.identify = 100;
    placeItem(reloaded, 'd1', reloadedHero.pos, { def: 'item.copper_band', qty: 1, identified: false });
    step(reloaded, [{ type: 'playerAction', actor: reloadedHero.id, action: { id: 'pickup' } }], { decide: waitDecide });
    expect(runIdentified(reloaded)).toBe(5);
    expect(checkInvariants(reloaded)).toEqual([]);

    // The `items.identified` invariant rejects invalid tracker counts.
    reloaded.domains.run.trackers[IDENTIFIED_TRACKER_ID] = { count: -1 };
    expect(checkInvariants(reloaded)).toContainEqual(expect.stringContaining('[items.identified]'));
  });

  it('never leaks hidden properties on unidentified items through cond.run_identified (§11.6 guard)', () => {
    const groups: ItemInstance[][] = [
      // Unidentified weapon with hidden +N, blessing, and special enchantments.
      [
        { def: 'item.arming_sword', qty: 1, identified: false },
        { def: 'item.arming_sword', qty: 1, enchant: 3, blessing: 'blessed', enchantments: [{ id: ENCHANT_KEEN.id, level: 2 }], identified: false },
        { def: 'item.arming_sword', qty: 1, enchant: -2, blessing: 'cursed', identified: false },
      ],
      // Unidentified consumables with swapped same-category defs and hidden blessing/mix counts.
      [
        { def: 'item.mending_draught', qty: 2, identified: false },
        { def: 'item.mending_draught', qty: 2, identified: false, mix: { plain: 1, blessed: 1, cursed: 0 } },
        { def: 'item.quickstep_tonic', qty: 2, identified: false, blessing: 'cursed' },
      ],
      // Unidentified jewelry with swapped same-category defs and hidden props.
      [
        { def: 'item.copper_band', qty: 1, identified: false },
        { def: 'item.owl_eye_ring', qty: 1, enchant: 2, blessing: 'blessed', identified: false },
        { def: 'item.owl_eye_ring', qty: 1, blessing: 'cursed', identified: false },
      ],
    ];
    const req: Requirement = { cond: 'cond.run_identified', params: { min: 1 } };
    for (const variants of groups) {
      const results = variants.map((variant) => {
        const state = createRun({ party: [HERO], depth: 1, floorTexts: [ROOM], monsters: false }, 7);
        const hero = getEntity(state, state.party[0] as EntityId) as AiActor;
        hero.inventory = { items: [variant] };
        hero.ai.rules = [{ condition: { id: 'cond.run_identified', params: { min: 1 } }, action: { id: 'act.wait' }, enabled: true }];
        delete hero.ai.tactics;
        placeItem(state, 'd1', { x: hero.pos.x + 1, y: hero.pos.y }, { ...variant });
        const choice = chooseRule({ state, actor: hero });
        return {
          req: checkRequirement({ state }, req),
          action: choice?.action ?? null,
          request: choice?.request ?? null,
        };
      });
      expect(results[0]?.req.ok).toBe(false);
      for (const r of results) expect(r).toEqual(results[0]);
    }
  });

  it('records Reaver (40 kills) and Lorekeeper (5 identifications) reveals once from real runs', () => {
    const reaverNode = UPGRADES.get('upgrade.reaver_training');
    const lorekeeperNode = UPGRADES.get('upgrade.lorekeeper_training');
    expect(reaverNode.reveal).toEqual({ kind: 'metInRun', requirement: { cond: 'cond.run_kills', params: { min: 40 } } });
    expect(lorekeeperNode.reveal).toEqual({ kind: 'metInRun', requirement: { cond: 'cond.run_identified', params: { min: 5 } } });

    const profile0 = newProfile();
    const watch = milestoneRequirements(profile0);
    expect(watch).toContainEqual({ cond: 'cond.run_kills', params: { min: 40 } });
    expect(watch).toContainEqual({ cond: 'cond.run_identified', params: { min: 5 } });

    // Run 1: slay 40 monsters in one run and exit.
    const killRun = createRun({ party: [HERO], depth: 1, floorTexts: [ROOM], monsters: false, watchRequirements: watch }, 10);
    const killer = getEntity(killRun, killRun.party[0] as EntityId) as ActorEntity;
    if (killer.stats !== undefined) {
      killer.stats.base.accuracy = 30;
      killer.stats.base.damage = 5;
      killer.stats.base.armor = 20;
    }
    for (let k = 0; k < 40; k++) {
      const rat = spawnMonster(killRun, 'monster.gloam_rat', 'd1', { x: killer.pos.x + 1, y: killer.pos.y });
      rat.actor = { ...(rat.actor as NonNullable<typeof rat.actor>), hp: 1 };
      step(killRun, [{ type: 'playerAction', actor: killer.id, action: { id: 'attack', dir: { x: 1, y: 0 } } }], { decide: waitDecide });
    }
    expect(runKills(killRun)).toBe(40);
    stepUntil(killRun, () => false);
    const killRes = runResult(killRun);
    expect(killRes.outcome).toBe('retreat');
    const profile1 = applyRunResult(profile0, killRes);
    expect(isMilestoneOpen(profile1, reaverNode.id)).toBe(true);
    expect(isMilestoneOpen(profile1, lorekeeperNode.id)).toBe(false);

    // Run 2: identify 5 items in one run (via blessed Scroll of Identify) and exit.
    const watch2 = milestoneRequirements(profile1);
    expect(watch2).not.toContainEqual({ cond: 'cond.run_kills', params: { min: 40 } });
    expect(watch2).toContainEqual({ cond: 'cond.run_identified', params: { min: 5 } });

    const idRun = createRun({ party: [HERO], depth: 1, floorTexts: [ROOM], monsters: false, watchRequirements: watch2 }, 11);
    const scholar = getEntity(idRun, idRun.party[0] as EntityId) as ActorEntity;
    scholar.inventory = {
      items: [
        { def: 'item.scroll_of_identify', qty: 1, blessing: 'blessed' },
        { def: 'item.arming_sword', qty: 1, identified: false },
        { def: 'item.iron_cap', qty: 1, identified: false },
        { def: 'item.soft_boots', qty: 1, identified: false },
        { def: 'item.copper_band', qty: 1, identified: false },
        { def: 'item.mending_draught', qty: 1, identified: false },
      ],
    };
    step(idRun, [{ type: 'playerAction', actor: scholar.id, action: { id: 'use', index: 0 } }], { decide: waitDecide });
    expect(runIdentified(idRun)).toBe(5);
    stepUntil(idRun, () => false);
    const idRes = runResult(idRun);
    expect(identifiedCount(idRes.extras)).toBe(5);
    const profile2 = applyRunResult(profile1, idRes);
    expect(isMilestoneOpen(profile2, lorekeeperNode.id)).toBe(true);
    expect(profile2.milestones.unlocked.filter((u) => u.id === reaverNode.id)).toHaveLength(1);
    expect(profile2.milestones.unlocked.filter((u) => u.id === lorekeeperNode.id)).toHaveLength(1);
    expect(milestoneRequirements(profile2)).toEqual([]);
  });
});
