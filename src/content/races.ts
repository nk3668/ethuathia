/**
 * Adventurer races: the folk an adventurer was born to. A race adds to the class's starting HP and
 * MP and sets the adventurer's speed (see `src/sim/run.ts`).
 */
import { z } from 'zod';
import { Registry } from '../core';
import type { Def } from '../core';
import type { ContentKind } from './kind';
import { defShape, nonNegativeInt, positiveInt } from './schema';

export interface RaceDef extends Def {
  /** Added to the class's starting maximum HP. */
  readonly hpBonus: number;
  /** Added to the class's starting maximum MP. */
  readonly mpBonus: number;
  /** Energy gained per tick; 100 acts once a turn (docs/ARCHITECTURE.md §3.3). */
  readonly speed: number;
}

export const RACES = new Registry<RaceDef>('race');

export const RACE_KIND: ContentKind<RaceDef> = {
  registry: RACES,
  schema: z.strictObject({
    ...defShape('race'),
    hpBonus: nonNegativeInt,
    mpBonus: nonNegativeInt,
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
  hpBonus: 2,
  mpBonus: 2,
  speed: 100,
});
