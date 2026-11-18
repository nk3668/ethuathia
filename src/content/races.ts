/**
 * Adventurer races: the folk an adventurer was born to. A race adjusts the class's starting
 * attributes (ETH-033) and sets the adventurer's speed (the `stats.class_race` and
 * `stats.attributes` providers in `src/sim/stats/`).
 */
import { z } from 'zod';
import { Registry } from '../core';
import type { Def } from '../core';
import { attributeBonusSchema } from './attributes';
import type { AttributeId } from './attributes';
import type { ContentKind } from './kind';
import { defShape, positiveInt } from './schema';

export interface RaceDef extends Def {
  /** Added to the class's starting attributes; may be negative. Attributes left out get 0. */
  readonly attributes: Readonly<Partial<Record<AttributeId, number>>>;
  /** Energy gained per tick; 100 acts once a turn (docs/ARCHITECTURE.md §3.3). */
  readonly speed: number;
}

export const RACES = new Registry<RaceDef>('race');

export const RACE_KIND: ContentKind<RaceDef> = {
  registry: RACES,
  schema: z.strictObject({
    ...defShape('race'),
    attributes: attributeBonusSchema,
    speed: positiveInt,
  }),
};

/** Registers a race def and returns it. Its shape is checked by `validateContent`. */
export function defineRace(def: RaceDef): RaceDef {
  return RACES.register(def);
}

export const RACE_HUMAN = defineRace({
  id: 'race.human',
  name: 'Human',
  description:
    'Restless folk from the river towns, quick to learn and slow to give up. They have no great gift, ' +
    'and no great failing either.',
  tags: [],
  attributes: { brawn: 1, finesse: 1, wits: 1, grit: 1 },
  speed: 100,
});
