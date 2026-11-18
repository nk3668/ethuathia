/** Codex view of items (ETH-061): grouped by category, with weight, value and what using one does. */
import { isJunk, ITEM_CATEGORIES, ITEM_CATEGORY_INFO, ITEMS, STATUSES } from '../../../content';
import type { Effect, ItemDef } from '../../../content';
import { defineCodexRenderer } from '../types';

function effectText(effect: Effect): string {
  switch (effect.kind) {
    case 'heal':
      return `heals ${effect.amount} HP`;
    case 'damage':
      return `deals ${effect.amount} damage`;
    case 'applyStatus':
      return `${STATUSES.has(effect.status) ? STATUSES.get(effect.status).name : effect.status} for ${effect.turns} turns`;
  }
}

/** What using the item does, or `null` if it can't be used. */
function usedText(def: ItemDef): string | null {
  const effects = def.bundle?.effects ?? [];
  return effects.length === 0 ? null : effects.map(effectText).join(', ');
}

export default defineCodexRenderer({
  registry: ITEMS,
  label: 'Items',
  order: 40,
  hint: 'Spot one in the dungeon, pick it up or use it.',
  group: (def) => ITEM_CATEGORY_INFO[def.category].label,
  fields: (def) => {
    const use = usedText(def);
    return [
      {
        label: 'Kind',
        value: ITEM_CATEGORY_INFO[def.category].label,
        hint: isJunk(def) ? 'Junk: adventurers leave it where it lies.' : `One of ${ITEM_CATEGORIES.length} kinds of item.`,
        key: true,
      },
      ...(use === null ? [] : [{ label: 'When used', value: use, hint: 'What using one does. It is used up.', key: true }]),
      { label: 'Weight', value: def.weight, hint: 'Counts against the carrier’s Carry stat. Over it, the least valuable things get dropped.' },
      { label: 'Value', value: def.value, hint: 'Worth of one, which decides what an adventurer keeps when its pack is full.', key: use === null },
      ...((def.stack ?? 1) > 1 ? [{ label: 'Stacks', value: `up to ${def.stack}`, hint: 'How many share one pack slot.' }] : []),
    ];
  },
});
