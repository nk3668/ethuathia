/**
 * Monsters: the creatures that fight the party. In the sim each one is an actor entity whose `def` is one of these ids.
 *
 * A placeholder kind (docs/ARCHITECTURE.md, Contracts): the registry, schema and `define`
 * helper exist so other work can refer to `monster.*` ids, but there are no defs yet. The
 * fields and the first defs arrive with ETH-060 (monsters and melee combat): extend the type and the schema together.
 */
import { z } from 'zod';
import { Registry } from '../core';
import type { Def } from '../core';
import type { ContentKind } from './kind';
import { defShape } from './schema';

export type MonsterDef = Def;

export const MONSTERS = new Registry<MonsterDef>('monster');

export const MONSTER_KIND: ContentKind<MonsterDef> = {
  registry: MONSTERS,
  schema: z.strictObject({
    ...defShape('monster'),
  }),
};

/** Registers a def of this kind and returns it. Its shape is checked by `validateContent`. */
export function defineMonster(def: MonsterDef): MonsterDef {
  return MONSTERS.register(def);
}
