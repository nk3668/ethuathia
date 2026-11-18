/**
 * Loot generation (ETH-061): the `gen.loot` step scatters items over a floor's rooms by depth.
 *
 * It draws only from the draft's loot RNG (`FloorDraft.loot`, from `lootRngState(seed, floor)`),
 * never from the layout RNG, so changing loot never moves a wall and the order floors are reached
 * in never changes what lies on them.
 */
import type { Pos, Rng } from '../../core';
import { ITEMS } from '../../content';
import type { ItemDef } from '../../content';
import { readParams } from '../gen/params';
import { defineGenStep, rectTiles } from '../gen/types';
import type { FloorDraft } from '../gen/types';
import { Terrain } from '../state';

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
    'Places a few items on free room tiles, chosen by depth from the items that can be found there. Gold piles grow with depth.',
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
      draft.items.push({ pos, item: { def: def.id, qty } });
    }
  },
});
