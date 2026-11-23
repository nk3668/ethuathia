/**
 * An item's display name (ETH-118, ETH-044): the def's name (or seeded generic appearance while
 * an appearance-category type is unidentified) with each visible item property's name parts around
 * it, in `ITEM_PROPERTIES` order ("+2 blessed Keen Iron hatchet of Draining"). Log text, the party
 * card and `Explain` show it; the AI's trace lines use it too.
 */
import type { Entity, RunState } from '../state';
import { appearanceName, isInstanceTypeKnown } from './identify';
import { itemDef } from './instance';
import type { ItemInstance } from './instance';
import { itemKnown, itemProperties } from './properties';

/**
 * The name of one `item` as `viewer` sees it: prefixes, the base name (or generic appearance when
 * its type is unidentified), suffixes. A part whose kind says it is `hidden` while the viewer
 * doesn't know the item (`itemKnown`) is left out. Without a viewer the item counts as known.
 */
export function itemName(state: RunState, item: ItemInstance, viewer?: Entity): string {
  const typeKnown = viewer === undefined || isInstanceTypeKnown(state, item);
  const baseName = typeKnown ? itemDef(item).name : appearanceName(state.seed, item.def);
  const props = itemProperties(item);
  if (props.length === 0) return baseName;
  const known = viewer === undefined || itemKnown({ state, item, wearer: viewer });
  const before: string[] = [];
  const after: string[] = [];
  for (const { kind, value } of props) {
    if (kind.name === undefined || kind.hidden?.(value, known) === true) continue;
    const { prefix, suffix } = kind.name(value);
    if (prefix !== undefined && prefix !== '') before.push(prefix);
    if (suffix !== undefined && suffix !== '') after.push(suffix);
  }
  return [...before, baseName, ...after].join(' ');
}

/**
 * `{ name }` when `item`'s name (as `viewer` sees it) differs from its def's, else `{}`: for an
 * event, so plain items' events stay as they were and log text falls back to the def's name.
 */
export function nameField(state: RunState, item: ItemInstance, viewer?: Entity): { name?: string } {
  const name = itemName(state, item, viewer);
  return name === itemDef(item).name ? {} : { name };
}
