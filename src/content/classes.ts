/**
 * Adventurer classes: what an adventurer was trained to do. A class sets the starting maximum HP
 * and MP, which the race then adjusts (see `src/sim/run.ts`). Skills, gear kits and stat
 * modifiers join them as those systems arrive.
 */
import { z } from 'zod';
import { Registry } from '../core';
import type { Def } from '../core';
import type { ContentKind } from './kind';
import { defShape, nonNegativeInt, positiveInt } from './schema';

export interface ClassDef extends Def {
  /** Starting maximum HP, before the race's bonus. */
  readonly hp: number;
  /** Starting maximum MP, before the race's bonus. */
  readonly mp: number;
}

export const CLASSES = new Registry<ClassDef>('class');

export const CLASS_KIND: ContentKind<ClassDef> = {
  registry: CLASSES,
  schema: z.strictObject({ ...defShape('class'), hp: positiveInt, mp: nonNegativeInt }),
};

/** Registers a class def and returns it. Its shape is checked by `validateContent`. */
export function defineClass(def: ClassDef): ClassDef {
  return CLASSES.register(def);
}

export const CLASS_VANGUARD = defineClass({
  id: 'class.vanguard',
  name: 'Vanguard',
  description:
    'A shield-bearer who walks at the head of the party and takes the first blow. Hardy, steady and ' +
    'nearly deaf to magic.',
  tags: ['martial'],
  hp: 18,
  mp: 3,
});
