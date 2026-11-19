/**
 * An item's display name (ETH-118): the def's name with each item property's name parts around
 * it, in `ITEM_PROPERTIES` order ("+2 cursed Iron hatchet of Embers"). Log text, the party card
 * and `Explain` show it; the AI's trace lines use it too.
 */
import type { Entity, RunState } from '../state';
import { itemDef } from './instance';
import type { ItemInstance } from './instance';
import { itemKnown, itemProperties } from './properties';

/**
 * The name of one `item` as `viewer` sees it: prefixes, the def's name, suffixes. A part whose
 * kind says it is `hidden` while the viewer doesn't know the item (`itemKnown`) is left out.
 * Without a viewer the item counts as known.
 */
export function itemName(state: RunState, item: ItemInstance, viewer?: Entity): string {
  const props = itemProperties(item);
  if (props.length === 0) return itemDef(item).name;
  const known = viewer === undefined || itemKnown({ state, item, wearer: viewer });
  const before: string[] = [];
  const after: string[] = [];
  for (const { kind, value } of props) {
    if (kind.name === undefined || kind.hidden?.(value, known) === true) continue;
    const { prefix, suffix } = kind.name(value);
    if (prefix !== undefined && prefix !== '') before.push(prefix);
    if (suffix !== undefined && suffix !== '') after.push(suffix);
  }
  return [...before, itemDef(item).name, ...after].join(' ');
}

/**
 * `{ name }` when `item`'s name (as `viewer` sees it) differs from its def's, else `{}`: for an
 * event, so plain items' events stay as they were and log text falls back to the def's name.
 */
export function nameField(state: RunState, item: ItemInstance, viewer?: Entity): { name?: string } {
  const name = itemName(state, item, viewer);
  return name === itemDef(item).name ? {} : { name };
}
