/**
 * What the monster-side Omens do to a monster as it is placed (ETH-186): Stalker's Ledger and
 * Deep Surge give some of them a find to carry, and Armed Warbands arms the tougher ones. A find is
 * an item that drops where the monster dies (`MonsterOverlay.carries`), rolled like floor loot but
 * from a deeper table; gear is unidentified like all gear (ETH-142), so what it is carrying says
 * nothing about it.
 *
 * Nothing here runs, and no RNG is drawn, when none of the three Omens is on.
 *
 * - `monsterRiskOverlay` is the one rule, used by the floor-plan hook (`RISK_PLAN_HOOK`, floors as
 *   they are built) and by the return-trip surge (`encounterSurge.ts`).
 */
import { Rng, seedState } from '../../core';
import { baseEnchantmentFor, MAX_TEMPLATES, MONSTERS } from '../../content';
import type { ItemDef, MonsterDef } from '../../content';
import type { FloorPlanHook } from '../domain';
import { floorNode } from '../floors/dungeon';
import type { ItemInstance } from '../items/instance';
import { lootTable, pickLootDef, rollItemProperties } from '../items/loot';
import type { RunState } from '../state';
import { ARMED_TEMPLATE_ID, stalkerEffect, surgeEffect, WARBAND_MIN_THREAT, warbandEffect } from '../stats/omenEffects';
import type { MonsterOverlay } from './overlay';

/** Where a monster is being placed: a floor as it is built, or the return-trip surge. */
export type RiskPlacement = 'floor' | 'surge';

/** Items a find can be: anything the floors can hold, bar gold, junk and relics. */
function findable(def: ItemDef): boolean {
  return def.category !== 'gold' && def.category !== 'junk' && def.category !== 'relic';
}

/** One item rolled from the loot table `extraDepth` floors deeper than `depth`; `weaponOrArmor` limits it to weapons and armor. */
function rollFind(rng: Rng, depth: number, extraDepth: number, weaponOrArmor: boolean): { def: ItemDef; props: Partial<ItemInstance> } | undefined {
  const table = lootTable(depth + extraDepth).filter((d) => findable(d) && (!weaponOrArmor || d.category === 'weapon' || d.category === 'armor'));
  if (table.length === 0) return undefined;
  const def = pickLootDef(table, rng);
  return { def, props: rollItemProperties(def, depth + extraDepth, rng) };
}

/** A find as an item: whatever it rolled. */
function findItem(rng: Rng, depth: number, extraDepth: number): ItemInstance | undefined {
  const found = rollFind(rng, depth, extraDepth, false);
  return found === undefined ? undefined : { def: found.def.id, qty: 1, ...found.props };
}

/** A piece of gear enchanted to `level` (as far as its kind allows), never cursed: the weapon or armor an armed monster carries. */
function armedGear(rng: Rng, depth: number, level: number): ItemInstance | undefined {
  const found = rollFind(rng, depth, 0, true);
  if (found === undefined) return undefined;
  const props = { ...found.props };
  delete props.blessing;
  delete props.enchantments;
  const base = baseEnchantmentFor(found.def);
  delete props.enchant;
  if (base !== undefined) {
    const enchant = Math.max(base.minLevel, Math.min(base.maxLevel, level));
    if (enchant !== 0) props.enchant = enchant;
  }
  return { def: found.def.id, qty: 1, ...props };
}

/**
 * `overlay` with what the run's Omens add for a monster of `def` placed on a floor at `depth`
 * (`undefined` for none: a plain monster stays plain). `ood` says the monster is out of depth;
 * `overlay` already holds any templates it rolled. Draws from `rng`, and only for an Omen that is on.
 */
export function monsterRiskOverlay(
  state: RunState,
  def: MonsterDef,
  overlay: MonsterOverlay | undefined,
  rng: Rng,
  depth: number,
  placement: RiskPlacement,
  ood = false,
): MonsterOverlay | undefined {
  const out: MonsterOverlay = overlay === undefined ? {} : { ...overlay };
  const carries: ItemInstance[] = [...(out.carries ?? [])];

  // Stalker's Ledger: a variant or a wanderer from below carries a find. Deep Surge: so does each pursuer.
  const stalker = placement === 'floor' ? stalkerEffect(state) : undefined;
  const surge = placement === 'surge' ? surgeEffect(state) : undefined;
  const variant = (out.templates?.length ?? 0) > 0;
  if (stalker !== undefined && (variant || ood) && rng.chance(stalker.carry)) {
    const item = findItem(rng, depth, stalker.findDepth);
    if (item !== undefined) carries.push(item);
  }
  if (surge !== undefined && rng.chance(surge.carry)) {
    const item = findItem(rng, depth, surge.findDepth);
    if (item !== undefined) carries.push(item);
  }

  // Armed Warbands: a tough monster is armored and carries enchanted gear.
  const warband = warbandEffect(state);
  if (warband !== undefined && def.threat >= WARBAND_MIN_THREAT && rng.chance(warband.effect.chance)) {
    const templates = out.templates ?? [];
    if (templates.length < MAX_TEMPLATES && !templates.includes(ARMED_TEMPLATE_ID)) {
      out.templates = [...templates, ARMED_TEMPLATE_ID];
      out.stats = {
        ...out.stats,
        add: { ...out.stats?.add, armor: (out.stats?.add?.armor ?? 0) + warband.effect.armor, damage: (out.stats?.add?.damage ?? 0) + warband.effect.damage },
      };
      const gear = armedGear(rng, depth, warband.effect.enchant);
      if (gear !== undefined) carries.push(gear);
    }
  }

  if (carries.length > 0) out.carries = carries;
  return Object.keys(out).length === 0 ? undefined : out;
}

/**
 * Applies `monsterRiskOverlay` to every monster a floor's plan spawns. It draws from its own
 * seeded stream (`risk/<floor>`), never the floor's, so the floor's layout and loot are the same
 * with or without the Omens, and a floor never depends on when it was reached.
 */
export const RISK_PLAN_HOOK: FloorPlanHook = {
  id: 'combat.risk',
  apply(state, floorId, plan) {
    if (plan.spawns === undefined || (stalkerEffect(state) === undefined && warbandEffect(state) === undefined)) return;
    const rng = new Rng(seedState(state.seed, `risk/${floorId}`));
    const depth = floorNode(state, floorId).depth;
    for (const spawn of plan.spawns) {
      const monster = spawn.monster;
      if (monster === undefined || !MONSTERS.has(spawn.def)) continue;
      const overlay = monsterRiskOverlay(state, MONSTERS.get(spawn.def), monster.overlay, rng, depth, 'floor', monster.ood === true);
      if (overlay !== undefined) monster.overlay = overlay;
    }
  },
};
