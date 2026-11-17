/**
 * Items: things that can be picked up, carried, equipped or used.
 *
 * A placeholder kind (docs/ARCHITECTURE.md, Contracts): the registry, schema and `define`
 * helper exist so other work can refer to `item.*` ids, but there are no defs yet. The
 * fields and the first defs arrive with ETH-061 (items and inventory) and ETH-043 (equipment
 * and base item types): extend the type and the schema together.
 */
import { z } from 'zod';
import { Registry } from '../core';
import type { Def } from '../core';
import type { ContentKind } from './kind';
import { defShape } from './schema';

export type ItemDef = Def;

export const ITEMS = new Registry<ItemDef>('item');

export const ITEM_KIND: ContentKind<ItemDef> = {
  registry: ITEMS,
  schema: z.strictObject({
    ...defShape('item'),
  }),
};

/** Registers a def of this kind and returns it. Its shape is checked by `validateContent`. */
export function defineItem(def: ItemDef): ItemDef {
  return ITEMS.register(def);
}
