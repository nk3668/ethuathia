/**
 * Enchantment content definitions and helpers (ETH-044): validates base and special enchantments,
 * target matching (`baseEnchantmentFor`, `specialEnchantmentsFor`, `enchantmentFits`) and scaling.
 */
import { describe, expect, it } from 'vitest';
import {
  baseEnchantmentFor,
  ENCHANT_ATTUNED,
  ENCHANT_HONED,
  ENCHANT_KEEN,
  ENCHANT_REINFORCED,
  ENCHANT_VAMPIRIC,
  ENCHANT_VENOMOUS,
  ENCHANTMENT_KIND,
  enchantmentFits,
  ENCHANTMENTS,
  ITEMS,
  scaleBundle,
  specialEnchantmentsFor,
} from '../../src/content';

describe('enchantment content (ETH-044)', () => {
  it('registers valid base and special enchantments', () => {
    expect(ENCHANTMENTS.all().length).toBeGreaterThanOrEqual(8);
    for (const def of ENCHANTMENTS.all()) {
      expect(ENCHANTMENT_KIND.schema.safeParse(def).success, def.id).toBe(true);
    }
  });

  it('matches base enchantments per gear category and filters special enchantments by depth and gear type', () => {
    expect(baseEnchantmentFor(ITEMS.get('item.iron_hatchet'))?.id).toBe(ENCHANT_HONED.id);
    expect(baseEnchantmentFor(ITEMS.get('item.quilted_jerkin'))?.id).toBe(ENCHANT_REINFORCED.id);
    expect(baseEnchantmentFor(ITEMS.get('item.copper_band'))?.id).toBe(ENCHANT_ATTUNED.id);
    expect(baseEnchantmentFor(ITEMS.get('item.mending_draught'))).toBeUndefined();

    expect(enchantmentFits(ENCHANT_KEEN, ITEMS.get('item.iron_hatchet'))).toBe(true);
    expect(enchantmentFits(ENCHANT_KEEN, ITEMS.get('item.quilted_jerkin'))).toBe(false);

    const d1Weapons = specialEnchantmentsFor(ITEMS.get('item.iron_hatchet'), 1).map((e) => e.id);
    expect(d1Weapons).toEqual([]);
    const d4Weapons = specialEnchantmentsFor(ITEMS.get('item.iron_hatchet'), 4).map((e) => e.id);
    expect(d4Weapons).toContain(ENCHANT_KEEN.id);
    expect(d4Weapons).toContain(ENCHANT_VENOMOUS.id);
    expect(d4Weapons).toContain(ENCHANT_VAMPIRIC.id);
  });

  it('scales modifiers by signed level and strips triggers for non-positive levels', () => {
    const plusTwo = scaleBundle({ modifiers: [{ stat: 'damage', op: 'add', value: 1 }], triggers: ENCHANT_VENOMOUS.bundle.triggers }, 2);
    expect(plusTwo.modifiers).toEqual([{ stat: 'damage', op: 'add', value: 2 }]);
    expect(plusTwo.triggers).toHaveLength(1);

    const minusOne = scaleBundle({ modifiers: [{ stat: 'damage', op: 'add', value: 1 }], triggers: ENCHANT_VENOMOUS.bundle.triggers }, -1);
    expect(minusOne.modifiers).toEqual([{ stat: 'damage', op: 'add', value: -1 }]);
    expect(minusOne.triggers).toBeUndefined();
  });

  it('rejects malformed enchantment defs', () => {
    const valid = { ...ENCHANT_KEEN };
    expect(ENCHANTMENT_KIND.schema.safeParse(valid).success).toBe(true);
    expect(ENCHANTMENT_KIND.schema.safeParse({ ...valid, prefix: undefined, suffix: undefined }).success).toBe(false);
    expect(ENCHANTMENT_KIND.schema.safeParse({ ...valid, minLevel: -1 }).success).toBe(false);
    expect(ENCHANTMENT_KIND.schema.safeParse({ ...valid, appliesTo: [] }).success).toBe(false);
  });
});
