/**
 * Codex view of items (ETH-061): grouped by category, with weight, value and what using one does;
 * for weapons and armor (ETH-043) the slot, base type and stats while worn.
 */
import { EQUIP_SLOT_INFO, GEAR_TYPE_INFO, isJunk, ITEM_CATEGORIES, ITEM_CATEGORY_INFO, ITEMS, STATUSES } from '../../../content';
import type { Effect, ItemDef } from '../../../content';
import { gearStatsText } from '../../../sim';
import type { CodexField } from '../types';
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

/** Slot, base type and stats of a weapon, piece of armor or jewelry; nothing for other items. */
function gearFields(def: ItemDef): CodexField[] {
  if (def.gear === undefined) return [];
  const type = GEAR_TYPE_INFO[def.gear.type];
  const slots = type.slots.map((s) => EQUIP_SLOT_INFO[s]);
  const where = slots.length === 1 ? (slots[0]?.label ?? '') : `${slots.map((s) => s.label).join(' or ')}`;
  const slotText = slots.length === 1 ? (slots[0]?.description ?? '') : `Fits any of ${slots.length} slots: ${where.toLowerCase()}.`;
  return [
    {
      label: 'Worn',
      value: `${where} · ${type.label}`,
      hint: `${slotText} ${type.description} One item per slot: putting on another packs this one away.`,
      key: true,
    },
    {
      label: 'Stats',
      value: gearStatsText({ def: def.id, qty: 1 }) ?? 'None',
      hint: 'What it adds to the wearer’s stats while worn. Adventurers put on gear that is at least as good in every stat and better in one.',
      key: true,
    },
  ];
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
      ...gearFields(def),
      ...(use === null ? [] : [{ label: 'When used', value: use, hint: 'What using one does. It is used up.', key: true }]),
      { label: 'Weight', value: def.weight, hint: 'Counts against the carrier’s Carry stat. Over it, the least valuable things get dropped.' },
      { label: 'Value', value: def.value, hint: 'Worth of one, which decides what an adventurer keeps when its pack is full.', key: use === null && def.gear === undefined },
      ...((def.stack ?? 1) > 1 ? [{ label: 'Stacks', value: `up to ${def.stack}`, hint: 'How many share one pack slot.' }] : []),
    ];
  },
});
