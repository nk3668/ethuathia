/**
 * Codex view of enchantments (ETH-044): base numeric `+N`/`-N` enhancements and special
 * named/effect enchantments, with their target gear, per-rank effects, and state explanations.
 */
import { ENCHANTMENTS, GEAR_TYPE_INFO, ITEM_STATE_INFO, STATUSES } from '../../../content';
import type { Effect, EnchantmentDef, EnchantTarget } from '../../../content';
import { bundleStatsText } from '../../../sim';
import type { CodexField } from '../types';
import { defineCodexRenderer } from '../types';

function targetLabel(target: EnchantTarget): string {
  if (target === 'weapon') return 'Weapons';
  if (target === 'armor') return 'Armor';
  if (target === 'jewelry') return 'Jewelry';
  return GEAR_TYPE_INFO[target].label;
}

function effectSummary(effect: Effect): string {
  switch (effect.kind) {
    case 'heal':
      return `heals ${effect.amount} HP`;
    case 'damage':
      return `deals ${effect.amount} damage`;
    case 'applyStatus':
      return `${STATUSES.has(effect.status) ? STATUSES.get(effect.status).name : effect.status} (${effect.turns} turns)`;
    case 'identify':
      return effect.scope === 'all' ? 'identifies all carried items' : 'identifies an item';
    case 'uncurse':
      return effect.scope === 'all' ? 'uncurses all items' : 'uncurses worn gear';
  }
}

function triggerSummary(def: EnchantmentDef): string | null {
  const triggers = def.bundle.triggers ?? [];
  if (triggers.length === 0) return null;
  return triggers
    .map((t) => {
      const when = t.on === 'trigger.hit' ? 'On hit' : t.on === 'trigger.struck' ? 'When struck' : t.on;
      return `${when}: ${t.effects.map(effectSummary).join(', ')}`;
    })
    .join('; ');
}

function rankText(def: EnchantmentDef): string {
  const fmt = (n: number) => (n > 0 ? `+${n}` : `${n}`);
  return def.kind === 'base' ? `${fmt(def.minLevel)} to ${fmt(def.maxLevel)}` : `${def.minLevel} to ${def.maxLevel}`;
}

export default defineCodexRenderer({
  registry: ENCHANTMENTS,
  label: 'Enchantments',
  order: 42,
  hint: 'Identify or equip enchanted gear in the dungeon.',
  group: (def) => (def.kind === 'base' ? 'Enhancements (+N / −N)' : 'Special enchantments'),
  fields: (def): readonly CodexField[] => {
    const stats = bundleStatsText([def.bundle]);
    const trigger = triggerSummary(def);
    const effectParts = [stats, trigger].filter((p): p is string => p !== null);
    return [
      {
        label: 'Applies to',
        value: def.appliesTo.map(targetLabel).join(', '),
        hint: 'Gear categories or types that can carry this enchantment.',
        key: true,
      },
      {
        label: 'Per rank',
        value: effectParts.length > 0 ? effectParts.join('; ') : 'None',
        hint: 'Stats or triggers added for each rank of this enchantment.',
        key: true,
      },
      {
        label: 'Ranks',
        value: rankText(def),
        hint: 'The lowest and highest rank loot can roll.',
      },
      {
        label: 'Value / rank',
        value: `+${def.valuePerLevel}`,
        hint: 'Added to the item’s worth for each rank.',
      },
      {
        label: 'Beatitude',
        value: 'Blessed / Cursed',
        hint: `${ITEM_STATE_INFO.blessed} ${ITEM_STATE_INFO.cursed}`,
      },
    ];
  },
});
