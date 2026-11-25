/**
 * What the first four Omens do, per rank (ETH-186). The Omen defs (`src/content/townOmens.ts`)
 * switch on one flag per rank (`omen.deep_surge.2`); this file turns the highest rank flag in the
 * run into numbers, and the text on the defs says the same thing in words. Keep them in step.
 *
 * Nothing here draws from an RNG or changes state. With no Omen on, every function returns
 * `undefined` or a no-op, so a run without Omens replays exactly as before.
 */
import { OMEN_ARMED_WARBANDS, OMEN_CURSED_HOARDS, OMEN_DEEP_SURGE, OMEN_STALKERS_LEDGER } from '../../content';
import type { FloorRisk } from '../gen/types';
import type { RunState } from '../state';
import { runModifiers } from './runModifiers';

/** The highest rank of Omen `id` switched on in the run (0 when it is off). */
export function omenRankOn(state: RunState, id: string): number {
  let best = 0;
  for (const m of runModifiers(state)) {
    for (const flag of m.flags ?? []) {
      if (!flag.startsWith(`${id}.`)) continue;
      const rank = Number(flag.slice(id.length + 1));
      if (Number.isInteger(rank) && rank > best) best = rank;
    }
  }
  return best;
}

/** What Stalker's Ledger does at a rank (index 0 is rank 1). */
export const STALKER_RANKS = [
  { shift: 1, oodBonus: 0.05, carry: 0.3, findDepth: 1 },
  { shift: 2, oodBonus: 0.1, carry: 0.5, findDepth: 2 },
  { shift: 3, oodBonus: 0.15, carry: 0.7, findDepth: 3 },
] as const;

/** What Deep Surge does at a rank. */
export const SURGE_RANKS = [
  { countMul: 1.25, templateBonus: 0.1, patrols: 1, carry: 0.3, findDepth: 1 },
  { countMul: 1.5, templateBonus: 0.2, patrols: 2, carry: 0.5, findDepth: 2 },
  { countMul: 2, templateBonus: 0.3, patrols: 3, carry: 0.7, findDepth: 3 },
] as const;

/** What Cursed Hoards does at a rank. */
export const HOARD_RANKS = [
  { curse: 0.1, consumableCurse: 0.04, enchant: 0.15, enchantCap: 0 },
  { curse: 0.2, consumableCurse: 0.08, enchant: 0.3, enchantCap: 1 },
  { curse: 0.3, consumableCurse: 0.12, enchant: 0.45, enchantCap: 2 },
] as const;

/** What Armed Warbands does at a rank. `armor` is on top of the Armed template's own +1. */
export const WARBAND_RANKS = [
  { chance: 0.25, armor: 0, enchant: 1 },
  { chance: 0.45, armor: 1, enchant: 2 },
  { chance: 0.65, armor: 2, enchant: 3 },
] as const;

/** The monsters this tough (`MonsterDef.threat`) can be armed by Armed Warbands. */
export const WARBAND_MIN_THREAT = 3;

/** The id of the template Armed Warbands puts on a monster (`monsterTemplates.ts`). */
export const ARMED_TEMPLATE_ID = 'template.armed';

function at<T>(table: readonly T[], rank: number): T | undefined {
  return rank >= 1 ? table[Math.min(rank, table.length) - 1] : undefined;
}

/** The run's Stalker's Ledger effect, or `undefined` when it is off. */
export function stalkerEffect(state: RunState): (typeof STALKER_RANKS)[number] | undefined {
  return at(STALKER_RANKS, omenRankOn(state, OMEN_STALKERS_LEDGER.id));
}

/** The run's Deep Surge effect, or `undefined` when it is off. */
export function surgeEffect(state: RunState): (typeof SURGE_RANKS)[number] | undefined {
  return at(SURGE_RANKS, omenRankOn(state, OMEN_DEEP_SURGE.id));
}

/** The run's Cursed Hoards effect, or `undefined` when it is off. */
export function hoardEffect(state: RunState): (typeof HOARD_RANKS)[number] | undefined {
  return at(HOARD_RANKS, omenRankOn(state, OMEN_CURSED_HOARDS.id));
}

/** The run's Armed Warbands effect and rank, or `undefined` when it is off. */
export function warbandEffect(state: RunState): { rank: number; effect: (typeof WARBAND_RANKS)[number] } | undefined {
  const rank = omenRankOn(state, OMEN_ARMED_WARBANDS.id);
  const effect = at(WARBAND_RANKS, rank);
  return effect === undefined ? undefined : { rank: Math.min(rank, WARBAND_RANKS.length), effect };
}

/**
 * What floor generation reads (`FloorDraft.risk`): the parts of the Omens that change how a floor
 * is built, or `undefined` when none of them is on, so generation takes the path it always did.
 */
export function floorRisk(state: RunState): FloorRisk | undefined {
  const stalker = stalkerEffect(state);
  const hoard = hoardEffect(state);
  if (stalker === undefined && hoard === undefined) return undefined;
  return {
    ...(stalker === undefined ? {} : { templateShift: stalker.shift, oodBonus: stalker.oodBonus }),
    ...(hoard === undefined
      ? {}
      : { curseBonus: hoard.curse, consumableCurseBonus: hoard.consumableCurse, enchantBonus: hoard.enchant, enchantCapBonus: hoard.enchantCap }),
  };
}
