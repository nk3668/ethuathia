/**
 * Doctrines: party-wide behavior options (CLAUDE.md §5.2), such as "Prioritize clearing floors"
 * vs "Prioritize the stairs". Upgrade nodes make them available with an `unlock` grant of the
 * doctrine id (`{ kind: 'unlock', id: 'doctrine.clear_floors' }`), so a pick-one Guild Hall tier
 * can offer two doctrines with no engine change.
 *
 * A placeholder kind (docs/ARCHITECTURE.md, Contracts): the registry, schema and `define`
 * helper exist so upgrades can refer to `doctrine.*` ids, but there are no defs yet. The fields
 * and the first defs arrive with the doctrine item: extend the type and the schema together.
 */
import { z } from 'zod';
import { Registry } from '../core';
import type { Def } from '../core';
import type { ContentKind } from './kind';
import { defShape } from './schema';

export type DoctrineDef = Def;

export const DOCTRINES = new Registry<DoctrineDef>('doctrine');

export const DOCTRINE_KIND: ContentKind<DoctrineDef> = {
  registry: DOCTRINES,
  schema: z.strictObject({
    ...defShape('doctrine'),
  }),
};

/** Registers a def of this kind and returns it. Its shape is checked by `validateContent`. */
export function defineDoctrine(def: DoctrineDef): DoctrineDef {
  return DOCTRINES.register(def);
}
