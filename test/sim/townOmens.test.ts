/**
 * The first four Omens (ETH-186): Stalker's Ledger, Deep Surge, Cursed Hoards and Armed Warbands.
 * Each one's effect is measured on fixed seeds with and without it, so a change that turns one
 * into a no-op (or into something that shows which items are cursed) fails here.
 */
import { describe, expect, it } from 'vitest';
import {
  ITEMS,
  MONSTERS,
  OMEN_ARMED_WARBANDS,
  OMEN_CURSED_HOARDS,
  OMEN_DEEP_SURGE,
  OMEN_STALKERS_LEDGER,
  OMENS,
  UPGRADE_ARMED_WARBANDS,
  UPGRADE_CURSED_HOARDS,
  UPGRADE_DEEP_SURGE,
  UPGRADE_STALKERS_LEDGER,
  UPGRADES,
} from '../../src/content';
import type { OmenSelection } from '../../src/content';
import {

  checkInvariants,
  createRun,
  ensureFloor,
  floorRisk,
  getEntity,
  getFloor,
  killActor,
  moveEntity,
  omenRankOn,
  planFloor,
  rewardMultiplier,
  stairsOn,
  statValue,
  surgeFloor,
} from '../../src/sim';
import type { ActorEntity, Entity, RunState, SimEvent } from '../../src/sim';
import { isCursed } from '../../src/sim/items/enchant';

const HERO = { name: 'Mira', classId: 'class.vanguard', raceId: 'race.human' };
const DEPTH = 8;
const SEEDS = Array.from({ length: 30 }, (_, i) => i + 1);

const on = (id: string, rank = 3): OmenSelection[] => [{ id, rank }];
const run = (seed: number, omens?: OmenSelection[]): RunState =>
  createRun({ party: [HERO], depth: DEPTH, ...(omens === undefined ? {} : { omens }) }, seed);
const floorIds = (state: RunState): string[] => Object.keys(state.dungeon.nodes);

describe('the four Omens as content', () => {
  const defs = [OMEN_STALKERS_LEDGER, OMEN_DEEP_SURGE, OMEN_CURSED_HOARDS, OMEN_ARMED_WARBANDS];

  it('have three ranks each, a rising reward, and one flag per rank for the sim to read', () => {
    for (const def of defs) {
      expect(OMENS.has(def.id)).toBe(true);
      expect(def.ranks).toHaveLength(3);
      def.ranks.forEach((rank, i) => {
        expect(rank.flags, def.id).toEqual([`${def.id}.${i + 1}`]);
        expect(rank.bundle, def.id).toBeUndefined();
        expect(rank.reward).toBeGreaterThan(i === 0 ? 0 : (def.ranks[i - 1]?.reward ?? 0));
      });
    }
  });

  it('are unlocked by one town node each, which only unlocks: no bonus, no danger of its own', () => {
    const nodes = [
      [UPGRADE_STALKERS_LEDGER, OMEN_STALKERS_LEDGER, 'building.guild_hall', 1, { renown: 100 }],
      [UPGRADE_DEEP_SURGE, OMEN_DEEP_SURGE, 'building.guild_hall', 4, { renown: 500 }],
      [UPGRADE_CURSED_HOARDS, OMEN_CURSED_HOARDS, 'building.smithy', 3, { trophies: 75 }],
      [UPGRADE_ARMED_WARBANDS, OMEN_ARMED_WARBANDS, 'building.smithy', 4, { trophies: 450 }],
    ] as const;
    for (const [node, omen, building, tier, cost] of nodes) {
      expect(UPGRADES.has(node.id)).toBe(true);
      expect(node.grants).toEqual([{ kind: 'unlock', id: omen.id }]);
      expect(node.building).toBe(building);
      expect(node.tier).toBe(tier);
      expect(node.cost).toEqual(cost);
      expect(node.ranks).toBeUndefined();
    }
  });
});

describe('with no Omen on', () => {
  it('floors are built exactly as before: nothing carries a find and no Armed template is rolled', () => {
    const state = run(3);
    expect(floorRisk(state)).toBeUndefined();
    for (const id of floorIds(state)) {
      for (const spawn of planFloor(state, id).spawns ?? []) {
        expect(spawn.monster?.overlay?.carries).toBeUndefined();
        expect(spawn.monster?.overlay?.templates ?? []).not.toContain('template.armed');
      }
    }
  });
});

describe("Stalker's Ledger", () => {
  const counts = (omens?: OmenSelection[]) => {
    let variants = 0;
    let wanderers = 0;
    let carriers = 0;
    for (const seed of SEEDS) {
      const state = run(seed, omens);
      for (const id of floorIds(state)) {
        for (const s of planFloor(state, id).spawns ?? []) {
          if ((s.monster?.overlay?.templates?.length ?? 0) > 0) variants++;
          if (s.monster?.ood === true) wanderers++;
          if ((s.monster?.overlay?.carries?.length ?? 0) > 0) carriers++;
        }
      }
    }
    return { variants, wanderers, carriers };
  };

  it('reads as a rank and shifts the ramp', () => {
    const state = run(1, on(OMEN_STALKERS_LEDGER.id, 2));
    expect(omenRankOn(state, OMEN_STALKERS_LEDGER.id)).toBe(2);
    expect(floorRisk(state)).toMatchObject({ templateShift: 2, oodBonus: 0.1 });
  });

  it('brings more variants and more wanderers, and some of them carry a find', () => {
    const off = counts();
    const rank3 = counts(on(OMEN_STALKERS_LEDGER.id));
    expect(off.carriers).toBe(0);
    expect(rank3.variants).toBeGreaterThan(off.variants * 1.5);
    expect(rank3.wanderers).toBeGreaterThan(off.wanderers);
    expect(rank3.carriers).toBeGreaterThan(20);
  });

  it('hands out finds that are unidentified like all loot (ETH-142 secrecy guard)', () => {
    let finds = 0;
    for (const seed of SEEDS) {
      const state = run(seed, on(OMEN_STALKERS_LEDGER.id));
      for (const id of floorIds(state)) {
        for (const s of planFloor(state, id).spawns ?? []) {
          for (const item of s.monster?.overlay?.carries ?? []) {
            finds++;
            const def = ITEMS.get(item.def);
            if (def.gear !== undefined || def.category === 'potion' || def.category === 'scroll') expect(item.identified, item.def).toBe(false);
          }
        }
      }
    }
    expect(finds).toBeGreaterThan(0);
  });

  it('keeps rank 1 gentler than rank 3', () => {
    expect(counts(on(OMEN_STALKERS_LEDGER.id, 1)).variants).toBeLessThan(counts(on(OMEN_STALKERS_LEDGER.id, 3)).variants);
  });
});

describe('Cursed Hoards', () => {
  const lootOn = (omens?: OmenSelection[]) => {
    const t = { gear: 0, cursed: 0, enchanted: 0, maxEnchant: 0, highEnchant: 0, unidentified: 0, consumables: 0, cursedConsumables: 0 };
    for (const seed of SEEDS) {
      const state = run(seed, omens);
      for (const id of floorIds(state)) {
        for (const { item } of planFloor(state, id).items ?? []) {
          const def = ITEMS.get(item.def);
          if (def.gear !== undefined) {
            t.gear++;
            if (isCursed(item)) t.cursed++;
            const ench = item.enchant ?? 0;
            if (ench > 0) t.enchanted++;
            if (ench > t.maxEnchant) t.maxEnchant = ench;
            if (ench >= 4) t.highEnchant++;
            if (item.identified === false) t.unidentified++;
          } else if (def.category === 'potion' || def.category === 'scroll') {
            t.consumables++;
            if (isCursed(item)) t.cursedConsumables++;
          }
        }
      }
      expect(checkInvariants(state)).toEqual([]);
    }
    return t;
  };

  it('curses more gear, potions and scrolls, and enchants more of the rest up to +5 at rank 3', () => {
    const off = lootOn();
    const rank3 = lootOn(on(OMEN_CURSED_HOARDS.id));
    expect(rank3.cursed / rank3.gear).toBeGreaterThan((off.cursed / off.gear) * 2);
    expect(rank3.enchanted / rank3.gear).toBeGreaterThan(off.enchanted / off.gear);
    expect(rank3.cursedConsumables / rank3.consumables).toBeGreaterThan(off.cursedConsumables / off.consumables);
    expect(off.maxEnchant).toBeLessThanOrEqual(3);
    expect(rank3.maxEnchant).toBeGreaterThanOrEqual(4);
    expect(rank3.highEnchant).toBeGreaterThan(0);
  });

  it('never shows which pieces are cursed: all gear stays unidentified (ETH-142)', () => {
    const rank3 = lootOn(on(OMEN_CURSED_HOARDS.id));
    expect(rank3.unidentified).toBe(rank3.gear);
  });
});


describe('Armed Warbands', () => {
  interface Armed {
    state: RunState;
    e: Entity;
  }
  const armedOn = (seed: number, rank = 3): Armed[] => {
    const state = run(seed, on(OMEN_ARMED_WARBANDS.id, rank));
    const found: Armed[] = [];
    for (const id of floorIds(state)) {
      ensureFloor(state, id);
      for (const eid of getFloor(state, id).entities) {
        const e = state.entities[eid];
        if (e?.monster?.overlay?.templates?.includes('template.armed') === true) found.push({ state, e });
      }
    }
    return found;
  };

  it('arms tough monsters, who carry unidentified, enchanted weapon or armor and have more armor', () => {
    const armed = SEEDS.flatMap((seed) => armedOn(seed));
    expect(armed.length).toBeGreaterThan(20);
    for (const { state, e } of armed) {
      expect(MONSTERS.get(e.def).threat).toBeGreaterThanOrEqual(3);
      const carried = e.monster?.overlay?.carries ?? [];
      expect(carried).toHaveLength(1);
      expect(['weapon', 'armor']).toContain(ITEMS.get(carried[0]?.def ?? '').category);
      expect(carried[0]?.enchant).toBeGreaterThanOrEqual(1);
      expect(isCursed(carried[0])).toBe(false);
      expect(carried[0]?.identified).toBe(false);
      expect(statValue(state, e, 'armor')).toBeGreaterThanOrEqual(MONSTERS.get(e.def).stats.armor + 3);
    }
  });

  it('is gentler at rank 1', () => {
    const r1 = SEEDS.flatMap((seed) => armedOn(seed, 1));
    const r3 = SEEDS.flatMap((seed) => armedOn(seed, 3));
    expect(r1.length).toBeGreaterThan(0);
    expect(r1.length).toBeLessThan(r3.length);
    expect(Math.max(...r1.map(({ e }) => e.monster?.overlay?.carries?.[0]?.enchant ?? 0))).toBeLessThanOrEqual(1);
  });

  it('drops the gear where the monster falls', () => {
    const { state, e } = SEEDS.flatMap((seed) => armedOn(seed))[0] as Armed;
    const victim = e as ActorEntity;
    victim.actor.hp = 0;
    const events: SimEvent[] = [];
    killActor(state, victim, (body) => events.push({ ...body, turn: 0 } as SimEvent), { cause: 'test', killer: null });
    const died = events.find((ev) => ev.type === 'died');
    expect(died?.type === 'died' ? died.drops : undefined).toHaveLength(1);
    expect(checkInvariants(state)).toEqual([]);
  });
});

describe('Deep Surge', () => {
  /** The monsters one return-trip surge wave puts on floor d1, and how many of them patrol or carry a find. */
  const wave = (seed: number, omens?: OmenSelection[]) => {
    const state = run(seed, omens);
    ensureFloor(state, 'd1');
    const arrival = stairsOn(state, 'd1', 'down')?.pos;
    if (arrival === undefined) throw new Error('expected stairs down on d1');
    moveEntity(state, state.party[0] as number, 'd1', arrival);
    const before = new Set(getFloor(state, 'd1').entities);
    const placed = surgeFloor(state, 'd1', arrival, 1);
    const fresh = getFloor(state, 'd1')
      .entities.filter((id) => !before.has(id))
      .map((id) => getEntity(state, id))
      .filter((e) => e.monster !== undefined);
    expect(checkInvariants(state)).toEqual([]);
    const patrolGroups = new Set(fresh.filter((e) => e.monster?.patrol !== undefined).map((e) => e.monster?.groupId)).size;
    return {
      placed,
      patrols: fresh.filter((e) => e.monster?.patrol !== undefined).length,
      patrolGroups,
      carriers: fresh.filter((e) => (e.monster?.overlay?.carries?.length ?? 0) > 0).length,
      variants: fresh.filter((e) => (e.monster?.overlay?.templates?.length ?? 0) > 0).length,
    };
  };

  it('sends a bigger surge, with more hunting patrol groups and variants, and its pursuers carry finds', () => {
    const total = (omens?: OmenSelection[]) =>
      SEEDS.map((seed) => wave(seed, omens)).reduce(
        (sum, w) => ({
          placed: sum.placed + w.placed,
          patrols: sum.patrols + w.patrols,
          patrolGroups: sum.patrolGroups + w.patrolGroups,
          carriers: sum.carriers + w.carriers,
          variants: sum.variants + w.variants,
        }),
        { placed: 0, patrols: 0, patrolGroups: 0, carriers: 0, variants: 0 },
      );
    const off = total();
    const rank1 = total(on(OMEN_DEEP_SURGE.id, 1));
    const rank3 = total(on(OMEN_DEEP_SURGE.id));
    expect(off.carriers).toBe(0);
    expect(rank3.placed).toBeGreaterThan(off.placed * 1.5);
    expect(rank1.patrolGroups).toBeGreaterThan(off.patrolGroups);
    expect(rank3.patrolGroups).toBeGreaterThan(rank1.patrolGroups);
    expect(rank3.patrols).toBeGreaterThan(off.patrols);
    expect(rank3.variants).toBeGreaterThan(off.variants);
    expect(rank3.carriers).toBeGreaterThan(10);
  });

  it('does nothing to the floors on the way down', () => {
    const plain = run(4);
    const surge = run(4, on(OMEN_DEEP_SURGE.id));
    expect(floorRisk(surge)).toBeUndefined();
    expect(planFloor(surge, 'd3')).toEqual(planFloor(plain, 'd3'));
  });
});

describe('stacking all four Omens', () => {
  it('stacks reward multiplier, multi-item carries, floor loot/spawns, and return surge cleanly', () => {
    const allFour: OmenSelection[] = [
      { id: OMEN_STALKERS_LEDGER.id, rank: 3 },
      { id: OMEN_DEEP_SURGE.id, rank: 3 },
      { id: OMEN_CURSED_HOARDS.id, rank: 3 },
      { id: OMEN_ARMED_WARBANDS.id, rank: 3 },
    ];
    let multiCarryCount = 0;
    for (const seed of SEEDS) {
      const state = run(seed, allFour);
      expect(rewardMultiplier(state)).toBeCloseTo(2.26);
      for (const id of floorIds(state)) {
        ensureFloor(state, id);
        for (const eid of getFloor(state, id).entities) {
          const e = getEntity(state, eid);
          if ((e.monster?.overlay?.carries?.length ?? 0) >= 2) multiCarryCount++;
        }
      }
      const arrival = stairsOn(state, 'd1', 'down')?.pos;
      if (arrival !== undefined) {
        moveEntity(state, state.party[0] as number, 'd1', arrival);
        const before = new Set(getFloor(state, 'd1').entities);
        surgeFloor(state, 'd1', arrival, 1);
        for (const eid of getFloor(state, 'd1').entities) {
          if (!before.has(eid)) {
            const e = getEntity(state, eid);
            if ((e.monster?.overlay?.carries?.length ?? 0) >= 2) multiCarryCount++;
          }
        }
      }
      expect(checkInvariants(state)).toEqual([]);
    }
    expect(multiCarryCount).toBeGreaterThan(0);
  });
});
