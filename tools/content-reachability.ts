/**
 * ETH-143: a content check that every def a player can discover can also come up in a run, so no
 * Codex entry is stuck at `???` forever. It complements the Codex reachability test
 * (`test/ui/codex.test.tsx`, ETH-131), which proves an event would mark an entry but not that the
 * sim ever produces the event for that def.
 *
 * It lives in `tools/` because it uses sim helpers (`monsterWeightAt`, `lootTable`); `src/content`
 * may not import `src/sim`. `validateContent` (tools/validate-content.ts) runs it, so it is part of
 * `npm run validate:content` and of `npm test`. Every problem names the def and why it cannot be
 * reached, so a balance pass that moves a Danger range gets a pointed failure.
 *
 * What counts as reachable is deliberately narrow: a dungeon's own floors, `1..depth.max`, at
 * `danger.start + (floor - 1) * danger.perFloor`. Return-trip shifts and out-of-depth boosts are
 * not counted, so a def that only appears through them is reported rather than silently passing.
 */
import {
  CONTRACTS,
  DUNGEONS,
  ENCHANTMENTS,
  ITEMS,
  MONSTER_TEMPLATES,
  MONSTERS,
  baseEnchantmentFor,
  issuedItemIds,
  enchantmentFits,
  templateFits,
} from '../src/content';
import type { ContractDef, DungeonDef, EnchantmentDef, ItemDef, MonsterDef, MonsterTemplateDef } from '../src/content';
// The sim's entry point first: its modules import each other in a cycle that only resolves from there.
import '../src/sim';
import { monsterWeightAt } from '../src/sim/combat/monsters';
import { lootTable } from '../src/sim/items/loot';

/**
 * The content the check reads; each field defaults to the registered defs. Tests pass fixtures.
 * Items and loot are always read from the registered item table (`lootTable`), so item and
 * enchantment checks are only exercised with other dungeons, not other items.
 */
export interface ReachabilityInput {
  monsters?: readonly MonsterDef[];
  templates?: readonly MonsterTemplateDef[];
  items?: readonly ItemDef[];
  enchantments?: readonly EnchantmentDef[];
  dungeons?: readonly DungeonDef[];
  contracts?: readonly ContractDef[];
}


interface Floor {
  readonly dungeon: DungeonDef;
  readonly depth: number;
  readonly danger: number;
}

function floorsOf(dungeons: readonly DungeonDef[]): Floor[] {
  return dungeons.flatMap((dungeon) =>
    Array.from({ length: dungeon.depth.max }, (_, i) => ({
      dungeon,
      depth: i + 1,
      danger: dungeon.danger.start + i * dungeon.danger.perFloor,
    })),
  );
}

function describeDangers(dungeons: readonly DungeonDef[]): string {
  return dungeons
    .map((d) => `${d.id} ${d.danger.start}..${d.danger.start + (d.depth.max - 1) * d.danger.perFloor}`)
    .join(', ');
}

/** Every problem found, each naming the def and why it can't come up. Empty when all is reachable. */
export function reachabilityProblems(input: ReachabilityInput = {}): string[] {
  const monsters = input.monsters ?? MONSTERS.all();
  const templates = input.templates ?? MONSTER_TEMPLATES.all();
  const items = input.items ?? ITEMS.all();
  const enchantments = input.enchantments ?? ENCHANTMENTS.all();
  const dungeons = input.dungeons ?? DUNGEONS.all();
  const contracts = input.contracts ?? CONTRACTS.all();
  const floors = floorsOf(dungeons);
  const maxDepth = dungeons.reduce((m, d) => Math.max(m, d.depth.max), 0);
  const problems: string[] = [];

  // Monsters: a nonzero spawn weight on some floor of some dungeon, ecology included.
  const spawnable = monsters.filter(
    (m) => m.handPlaced !== true && floors.some((f) => monsterWeightAt(m, f.danger, f.dungeon.ecology) > 0),
  );
  for (const m of monsters) {
    if (m.handPlaced === true || spawnable.includes(m)) continue;
    problems.push(
      `monster "${m.id}": can't spawn in any dungeon. Its Danger band ${m.danger.min}..${m.danger.max} meets no floor ` +
        `or its tags are filtered out by the dungeon ecology (floor Danger: ${describeDangers(dungeons)}). ` +
        `Fix its band, or set handPlaced if it is only ever placed by hand.`,
    );
  }

  // Templates: some dungeon must roll templates, and a monster that can spawn must fit each one.
  const rollsTemplates = dungeons.some((d) => {
    const ramp = d.encounters?.templateRamp;
    return (ramp !== undefined && ramp.max > 0) || (d.encounters?.surge?.templateBonus ?? 0) > 0;
  });
  for (const t of templates) {
    if (!rollsTemplates) {
      problems.push(`template "${t.id}": no dungeon rolls templates (none has encounters.templateRamp with max above 0).`);
    } else if (!spawnable.some((m) => templateFits(t, m))) {
      problems.push(`template "${t.id}": fits no monster that can spawn (families: ${t.families?.join(', ') ?? 'any'}).`);
    }
  }

  // Items: a loot entry on some reachable floor, or named as a contract's recover item.
  const relics = new Set(contracts.flatMap((c) => (c.objective.kind === 'recover' ? [c.objective.item] : [])));
  // Items a class kit or an upgrade issues at the start of a run (ETH-187) need no loot entry.
  const issued = issuedItemIds();
  const lootable = new Set<string>();
  for (let depth = 1; depth <= maxDepth; depth++) for (const d of lootTable(depth)) lootable.add(d.id);
  for (const item of items) {
    if (lootable.has(item.id) || relics.has(item.id) || issued.has(item.id)) continue;
    problems.push(
      item.loot === undefined
        ? `item "${item.id}": has no loot entry and no source names it (it is not a contract's recover item, nor issued at run start by a class kit or an upgrade).`
        : `item "${item.id}": its loot depth ${item.loot.minDepth ?? 1}..${item.loot.maxDepth ?? 'any'} is outside every dungeon floor (1..${maxDepth}).`,
    );
  }

  // Enchantments: a base must be used by some gear def; a special must fit gear that loots at a
  // depth in its range. A special with weight 0 is hand-crafted or Smithy-only (EnchantmentDef.weight).
  const gear = items.filter((i) => i.gear !== undefined);
  for (const e of enchantments) {
    if (e.kind === 'base') {
      if (!gear.some((g) => baseEnchantmentFor(g)?.id === e.id)) {
        problems.push(`enchantment "${e.id}": no gear def uses this base enchantment (appliesTo: ${e.appliesTo.join(', ')}).`);
      }
      continue;
    }
    if (e.weight <= 0) continue;
    const fitting = gear.filter((g) => enchantmentFits(e, g));
    if (fitting.length === 0) {
      problems.push(`enchantment "${e.id}": fits no gear item (appliesTo: ${e.appliesTo.join(', ')}).`);
      continue;
    }
    const rolls = fitting.some((g) => {
      for (let depth = Math.max(1, e.minDepth ?? 1); depth <= Math.min(maxDepth, e.maxDepth ?? Infinity); depth++) {
        if (lootTable(depth).some((d) => d.id === g.id)) return true;
      }
      return false;
    });
    if (!rolls) {
      problems.push(
        `enchantment "${e.id}": none of the gear it fits (${fitting.map((g) => g.id).join(', ')}) loots at a depth in ` +
          `its range ${e.minDepth ?? 1}..${e.maxDepth ?? 'any'} within floors 1..${maxDepth}.`,
      );
    }
  }

  return problems;
}
