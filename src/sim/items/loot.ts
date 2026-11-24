/**
 * Loot generation (ETH-061, ETH-044): the `gen.loot` step scatters items over a floor's rooms by
 * depth and rolls enchantment, beatitude (blessed / cursed), special enchantments and initial
 * identification state from the loot RNG stream alone.
 *
 * It draws only from the draft's loot RNG (`FloorDraft.loot`, from `lootRngState(seed, floor)`),
 * never from the layout RNG, so changing loot never moves a wall and the order floors are reached
 * in never changes what lies on them.
 */
import type { Pos, Rng } from '../../core';
import { baseEnchantmentFor, ITEMS, specialEnchantmentsFor } from '../../content';
import type { EnchantmentDef, ItemBlessing, ItemDef } from '../../content';
import { readParams } from '../gen/params';
import { defineGenStep, rectTiles } from '../gen/types';
import type { FloorDraft } from '../gen/types';
import { Terrain } from '../state';
import type { ItemEnchantment, ItemInstance } from './instance';

/**
 * Tunable loot property roll chances (ETH-044; reviewed in ETH-080). ETH-142 hands these to
 * ETH-080 as tunables: `LOOT_CURSE_CHANCE`, `CURSED_MILD_CHANCE` (the cursed enchantment range,
 * -1 or -2) and `CURSE_LOCK_PREMIUM` (`hiddenValue.ts`). The baseline's gear gate (`hiddenGearMargin`) reads all of them.
 */
export const LOOT_BLESS_CHANCE = 0.1;
export const LOOT_CURSE_CHANCE = 0.1;
/** Chance a cursed piece of gear rolls -1 (otherwise -2). */
export const CURSED_MILD_CHANCE = 0.75;
/** Chance a blessed piece of gear also rolls a +N enchantment. */
export const BLESSED_ENCHANT_CHANCE = 0.5;
/** Chance an enchantment, when rolled with a cap above 1, is +1 (otherwise uniform 2..cap). */
export const ENCHANT_MILD_CHANCE = 0.65;
export const LOOT_CONSUMABLE_CURSE_CHANCE = 0.08;
export const LOOT_ENCHANT_CHANCE = 0.25;
export const LOOT_SPECIAL_BASE_CHANCE = 0.12;
export const LOOT_SPECIAL_PER_DEPTH = 0.02;
export const LOOT_SPECIAL_MAX_CHANCE = 0.25;

/** The item defs loot may place at `depth`, in registration order. */
export function lootTable(depth: number): ItemDef[] {
  return ITEMS.all().filter((d) => d.loot !== undefined && depth >= (d.loot.minDepth ?? 1) && depth <= (d.loot.maxDepth ?? Infinity));
}

/** One def from `table`, by `loot.weight`. Exactly one draw. */
function pickWeighted(table: readonly ItemDef[], rng: Rng): ItemDef {
  const total = table.reduce((n, d) => n + (d.loot?.weight ?? 0), 0);
  let roll = rng.float() * total;
  for (const def of table) {
    roll -= def.loot?.weight ?? 0;
    if (roll < 0) return def;
  }
  return table[table.length - 1] as ItemDef;
}

function pickWeightedEnchant(pool: readonly EnchantmentDef[], rng: Rng): EnchantmentDef {
  const total = pool.reduce((n, e) => n + e.weight, 0);
  let roll = rng.float() * total;
  for (const e of pool) {
    roll -= e.weight;
    if (roll < 0) return e;
  }
  return pool[pool.length - 1] as EnchantmentDef;
}

/**
 * Rolls enchantment (`+N`/`-N`), beatitude (`blessed`/`cursed`), special enchantments and initial
 * `identified: false` for one loot item at `depth`, drawing exclusively from `rng` (the loot stream).
 */
export function rollItemProperties(def: ItemDef, depth: number, rng: Rng): Partial<ItemInstance> {
  if (def.category === 'gold' || def.category === 'junk' || def.category === 'relic') return {};

  const out: Partial<ItemInstance> = {};

  if (def.gear !== undefined) {
    const bRoll = rng.float();
    let blessing: ItemBlessing | undefined;
    if (bRoll < LOOT_BLESS_CHANCE) blessing = 'blessed';
    else if (bRoll < LOOT_BLESS_CHANCE + LOOT_CURSE_CHANCE) blessing = 'cursed';
    if (blessing !== undefined) out.blessing = blessing;

    const base = baseEnchantmentFor(def);
    if (base !== undefined) {
      let enchant = 0;
      if (blessing === 'cursed') {
        enchant = rng.chance(CURSED_MILD_CHANCE) ? -1 : -2;
      } else if ((blessing === 'blessed' && rng.chance(BLESSED_ENCHANT_CHANCE)) || rng.chance(LOOT_ENCHANT_CHANCE)) {
        const cap = Math.min(base.maxLevel, depth >= 6 ? 3 : depth >= 3 ? 2 : 1);
        enchant = cap <= 1 ? 1 : rng.chance(ENCHANT_MILD_CHANCE) ? 1 : rng.int(2, cap);
      }
      if (enchant !== 0) out.enchant = Math.max(base.minLevel, Math.min(base.maxLevel, enchant));
    }

    const specials = specialEnchantmentsFor(def, depth);
    if (specials.length > 0) {
      const chance = Math.min(LOOT_SPECIAL_MAX_CHANCE, LOOT_SPECIAL_BASE_CHANCE + Math.max(0, depth - 2) * LOOT_SPECIAL_PER_DEPTH);
      if (rng.chance(chance)) {
        const picked = pickWeightedEnchant(specials, rng);
        const level = picked.maxLevel >= 2 && depth >= 5 && rng.chance(0.25) ? 2 : picked.minLevel;
        const entry: ItemEnchantment = { id: picked.id, level };
        out.enchantments = [entry];
      }
    }

    // Every piece of gear starts unidentified, whatever it rolled, so the flag says nothing (ETH-142).
    out.identified = false;
    return out;
  }

  if (def.category === 'potion' || def.category === 'scroll') {
    const bRoll = rng.float();
    if (bRoll < LOOT_BLESS_CHANCE) out.blessing = 'blessed';
    else if (bRoll < LOOT_BLESS_CHANCE + LOOT_CONSUMABLE_CURSE_CHANCE) out.blessing = 'cursed';
    out.identified = false;
  }
  return out;
}

/** Room tiles (every floor tile if there are no rooms) with no feature, start or item on them, in order. */
function freeTiles(draft: FloorDraft): Pos[] {
  const { terrain } = draft;
  const taken = new Set<number>();
  for (const f of draft.features) taken.add(f.pos.y * terrain.width + f.pos.x);
  for (const s of draft.starts) taken.add(s.y * terrain.width + s.x);
  for (const it of draft.items) taken.add(it.pos.y * terrain.width + it.pos.x);
  const tiles: Pos[] = [];
  if (draft.rooms.length > 0) {
    for (const room of draft.rooms) tiles.push(...rectTiles(room));
  } else {
    for (let y = 0; y < terrain.height; y++) for (let x = 0; x < terrain.width; x++) tiles.push({ x, y });
  }
  return tiles.filter((t) => terrain.get(t.x, t.y) === Terrain.Floor && !taken.has(t.y * terrain.width + t.x));
}

export const GEN_LOOT = defineGenStep({
  id: 'gen.loot',
  name: 'Scatter loot',
  description:
    'Places a few items on free room tiles, chosen by depth from the items that can be found there, rolling enchantments, blessings, curses and identification. Gold piles grow with depth.',
  parse(raw) {
    const p = readParams(raw, {
      minItems: { default: 3, min: 0, max: 200, integer: true },
      maxItems: { default: 6, min: 0, max: 200, integer: true },
    });
    if (p.minItems > p.maxItems) throw new RangeError(`minItems (${p.minItems}) is above maxItems (${p.maxItems})`);
    return p;
  },
  run(draft, p) {
    const rng = draft.loot;
    const table = lootTable(draft.depth);
    const tiles = freeTiles(draft);
    const count = rng.int(p.minItems, p.maxItems);
    for (let n = 0; n < count && table.length > 0 && tiles.length > 0; n++) {
      const def = pickWeighted(table, rng);
      const [pos] = tiles.splice(rng.int(0, tiles.length - 1), 1) as [Pos];
      const range = def.loot?.qty;
      let qty = range === undefined ? 1 : rng.int(range.min, range.max);
      if (def.category === 'gold') qty = Math.min(qty * draft.depth, def.stack ?? 1);
      const props = rollItemProperties(def, draft.depth, rng);
      draft.items.push({ pos, item: { def: def.id, qty, ...props } });
    }
  },
});
