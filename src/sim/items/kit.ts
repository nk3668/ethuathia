/**
 * Class starting kits (ETH-176): the gear a class names in `ClassDef.kit` is worn by every
 * adventurer of the class from the first turn of a run.
 *
 * - `prop.kit` (`PROP_KIT`, in `enchant.ts` beside the other flag properties) marks such an item (`ItemInstance.kit`), so ETH-171's sale of carried items for
 *   Trophies can leave it out: a run never pays for its own starting gear. The mark stays on the
 *   item if it is dropped or swapped out, and never affects its stats, name, value or stacking.
 * - `giveKit` puts a class's kit on an adventurer. Kit items are plain and identified (an item is
 *   known unless it says `identified: false`), so no randomness is involved.
 */
import { CLASSES, ITEMS } from '../../content';
import type { ClassDef } from '../../content';
import type { Entity } from '../state';
import { ensureInventory } from './inventory';
import { newItem } from './instance';
import type { ItemInstance } from './instance';
import { slotFor } from './equipment';

/** True if `item` is part of a class's starting kit: it is never sold for Trophies. */
export function isKitItem(item: ItemInstance): boolean {
  return item.kit === true;
}

/** A fresh kit instance of `defId`: plain, identified and marked as kit. */
export function newKitItem(defId: string): ItemInstance {
  return { ...newItem(defId), kit: true };
}

/** The class's kit item ids, or none for an unknown class or one without a kit. */
export function kitOf(classId: string): readonly string[] {
  const def: ClassDef | undefined = CLASSES.has(classId) ? CLASSES.get(classId) : undefined;
  return def?.kit ?? [];
}

/**
 * Puts the class kit on `entity`, each piece in its slot, in kit order. Returns the item ids worn.
 * Throws if a piece has nowhere to go (content validation rules this out).
 */
export function giveKit(entity: Entity, classId: string): string[] {
  const worn: string[] = [];
  for (const id of kitOf(classId)) {
    if (!ITEMS.has(id)) throw new Error(`Class "${classId}" kit names unknown item "${id}"`);
    const item = newKitItem(id);
    const slot = slotFor(entity, item);
    const equipped = (ensureInventory(entity).equipped ??= {});
    if (slot === null || equipped[slot] !== undefined) throw new Error(`Class "${classId}" kit item "${id}" has no free slot`);
    equipped[slot] = item;
    worn.push(id);
  }
  return worn;
}
