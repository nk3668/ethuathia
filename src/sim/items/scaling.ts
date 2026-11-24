/**
 * Weapon scaling (ETH-082): a wielded weapon's damage comes from the attribute its type
 * `scalesWith` (swords and daggers Finesse, axes and maces Brawn, staves Wits), instead of
 * `UNARMED_ATTRIBUTE` (Brawn), which the attribute provider's `DAMAGE_FORMULA` row uses.
 *
 * It is a derived item property (ETH-118, `ItemDerivedProperty`): for a wearer with attributes
 * and a weapon whose attribute differs from the unarmed one, it adds two bundles,
 *
 * - the damage formula for the weapon's attribute, credited to that attribute ("Finesse 14
 *   (Arming sword)"), and
 * - the unarmed row taken back off, credited to Brawn ("Brawn 12 (unused with Arming sword)"),
 *
 * so `getStat`'s damage parts show where the number comes from, the attribute chips can net each
 * attribute's share, and `compareGear` (which sums an item's bundles) weighs the weapon by the
 * difference the wielder's attributes make. Axes and maces add nothing: they already use Brawn.
 * No wearer, or one without attributes (a monster), adds nothing.
 *
 * Imports only content and the stats domain: `properties.ts` imports this file.
 */
import { attributeDef, attributeDefId, GEAR_TYPE_INFO, ITEMS } from '../../content';
import type { AttributeId } from '../../content';
import { attributeValue, DAMAGE_FORMULA, hasAttributes } from '../stats/attributes';
import type { Entity } from '../state';
import type { ItemInstance } from './instance';
import type { ItemBundle, ItemDerivedProperty } from './properties';

/** The attribute `item`'s damage scales with when wielded, or `null` if it isn't a weapon that names one. */
export function weaponScalesWith(item: ItemInstance): AttributeId | null {
  const gear = ITEMS.get(item.def).gear;
  return gear === undefined ? null : (GEAR_TYPE_INFO[gear.type].scalesWith ?? null);
}

/** What wielding a weapon does to one wielder's damage through its attribute. */
export interface WeaponScaling {
  /** The weapon's attribute and the wielder's value of it. */
  attribute: AttributeId;
  value: number;
  /** The attribute damage uses without it (`UNARMED_ATTRIBUTE`) and the wielder's value of it. */
  unarmed: AttributeId;
  unarmedValue: number;
  /** Damage from the weapon's attribute, from the unarmed one, and the difference (may be negative). */
  damage: number;
  unarmedDamage: number;
  change: number;
}

function formulaDamage(value: number): number {
  return (value - DAMAGE_FORMULA.from) * DAMAGE_FORMULA.perPoint;
}

/**
 * How `item` scales with `wearer`'s attributes, or `null` when it doesn't change anything: not a
 * weapon, a weapon that uses the unarmed attribute anyway, or a wearer without attributes.
 */
export function weaponScaling(wearer: Entity | undefined, item: ItemInstance): WeaponScaling | null {
  const attribute = weaponScalesWith(item);
  const unarmed = DAMAGE_FORMULA.attribute;
  if (attribute === null || attribute === unarmed || wearer === undefined || !hasAttributes(wearer)) return null;
  const value = attributeValue(wearer, attribute);
  const unarmedValue = attributeValue(wearer, unarmed);
  const damage = formulaDamage(value);
  const unarmedDamage = formulaDamage(unarmedValue);
  return { attribute, value, unarmed, unarmedValue, damage, unarmedDamage, change: damage - unarmedDamage };
}

/**
 * "Damage scales with Finesse 14 instead of Brawn 12: +1": one wielder's breakdown for a
 * tooltip, or `null` when the weapon changes nothing for them.
 */
export function weaponScalingText(wearer: Entity | undefined, item: ItemInstance): string | null {
  const s = weaponScaling(wearer, item);
  if (s === null) return null;
  const shown = Number(Math.abs(s.change).toFixed(2));
  const change = shown === 0 ? '±0' : `${s.change < 0 ? '−' : '+'}${shown}`;
  return (
    `Damage scales with ${attributeDef(s.attribute).name} ${s.value} instead of ${attributeDef(s.unarmed).name} ${s.unarmedValue}: ` +
    `${change} damage`
  );
}

/** The weapon scaling property (ETH-082). See the file comment. */
export const PROP_WEAPON_SCALING: ItemDerivedProperty = {
  id: 'prop.weapon_scaling',
  bundles({ item, wearer }) {
    const s = weaponScaling(wearer, item);
    if (s === null) return [];
    const name = ITEMS.get(item.def).name;
    const out: ItemBundle[] = [
      {
        bundle: { modifiers: [{ stat: DAMAGE_FORMULA.stat, op: 'add', value: s.damage }] },
        source: attributeDefId(s.attribute),
        label: `${attributeDef(s.attribute).name} ${s.value} (${name})`,
      },
      {
        bundle: { modifiers: [{ stat: DAMAGE_FORMULA.stat, op: 'add', value: -s.unarmedDamage }] },
        source: attributeDefId(s.unarmed),
        label: `${attributeDef(s.unarmed).name} ${s.unarmedValue} (unused with ${name})`,
      },
    ];
    return out;
  },
};
