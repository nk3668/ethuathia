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
import type { ClassDef, StartEnchantPiece, StartKnownCategory } from '../../content';
import type { Entity, RunState } from '../state';
import { addToInventory, ensureInventory } from './inventory';
import { identifyType } from './identify';
import { itemDef, newItem } from './instance';
import type { ItemInstance } from './instance';
import { slotFor } from './equipment';

/** The enchantment level a Smithy kit upgrade (`enchant` start perk, ETH-159) gives a kit piece. */
export const KIT_ENCHANT_LEVEL = 1;

/** A starting item the party carries (`stock` start perk, ETH-159, and the Medic's Satchel, ETH-132). */
export interface StartStock {
  readonly item: string;
  readonly qty: number;
  /** Given to every adventurer instead of only the first (the Guild Hall's Medic's Satchel, ETH-132). */
  readonly each?: true;
}

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
 * `enchant` (ETH-159) lists the pieces that come at +1: the `weapon` is the piece that fits the
 * main hand, the `defense` the kit's first piece of armor. The +1 is the piece's own base
 * enchantment (`baseEnchantmentFor`), so a staff gains Max MP and a cap gains armor. Kit pieces
 * stay identified. Throws if a piece has nowhere to go (content validation rules this out).
 */
export function giveKit(entity: Entity, classId: string, enchant: readonly StartEnchantPiece[] = []): string[] {
  const worn: string[] = [];
  let defenseDone = false;
  for (const id of kitOf(classId)) {
    if (!ITEMS.has(id)) throw new Error(`Class "${classId}" kit names unknown item "${id}"`);
    const item = newKitItem(id);
    const slot = slotFor(entity, item);
    const equipped = (ensureInventory(entity).equipped ??= {});
    if (slot === null || equipped[slot] !== undefined) throw new Error(`Class "${classId}" kit item "${id}" has no free slot`);
    const isWeapon = slot === 'mainHand';
    const isDefense = !defenseDone && itemDef(item).category === 'armor';
    if (isDefense) defenseDone = true;
    if ((isWeapon && enchant.includes('weapon')) || (isDefense && enchant.includes('defense'))) item.enchant = KIT_ENCHANT_LEVEL;
    equipped[slot] = item;
    worn.push(id);
  }
  return worn;
}

/** Every kit item `entity` set out with as def ids: the worn pieces, then the kit items in its pack (one per stack). */
export function issuedKitIds(entity: Entity): string[] {
  const worn = Object.values(entity.inventory?.equipped ?? {}).filter(isKitItem);
  const carried = (entity.inventory?.items ?? []).filter(isKitItem);
  return [...worn, ...carried].map((item) => item.def);
}

/** The kit pieces `entity` wears at +1 from a Smithy upgrade, as def ids (for the log). */
export function enchantedKitIds(entity: Entity): string[] {
  return Object.values(entity.inventory?.equipped ?? {}).flatMap((item) => (item.kit === true && item.enchant !== undefined ? [item.def] : []));
}

/**
 * Hands `stock` to `entity`'s pack as kit items (never sold), each stack split at the def's stack
 * limit. Their kinds are learned too, so a Scroll of Identify in the pack is known on sight. Returns
 * the def ids given, once per stack.
 */
export function giveStock(state: RunState, entity: Entity, stock: readonly StartStock[]): string[] {
  const given: string[] = [];
  for (const { item: id, qty } of stock) {
    if (!ITEMS.has(id)) throw new Error(`Start stock names unknown item "${id}"`);
    const limit = itemDef(newItem(id)).stack ?? 1;
    identifyType(state, id);
    for (let left = qty; left > 0; left -= limit) {
      addToInventory(entity, { ...newKitItem(id), qty: Math.min(left, limit) });
      given.push(id);
    }
  }
  return given;
}

/** The def ids of every kind in `categories` (potions, jewelry), in registry order. */
export function kindsIn(categories: readonly StartKnownCategory[]): string[] {
  return ITEMS.all()
    .filter((def) => (categories as readonly string[]).includes(def.category))
    .map((def) => def.id);
}

/**
 * Marks every item kind in `categories` known from the first turn (`know` start perks, ETH-159):
 * `identifiedTypes` gains them, so potions and jewelry show their real names. This is type-level
 * knowledge only: which copies are blessed, cursed or enchanted stays hidden until each one is
 * identified (ETH-142, ETH-147). Returns the kinds learned.
 */
export function knowKinds(state: RunState, categories: readonly StartKnownCategory[]): string[] {
  return kindsIn(categories).filter((id) => identifyType(state, id));
}
