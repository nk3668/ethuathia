/**
 * Doctrines: a placeholder kind, kept so upgrade `unlock` grants can still name `doctrine.*` ids.
 * Party stances (ETH-071, `stances.ts`) replaced them: "clear floors" vs "stairs" became Plunder
 * and Delve, picked and swapped by the player, and the Library unlocks stances through `tactic.*`
 * ids (ETH-163). There are no doctrine defs, and none are planned.
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
