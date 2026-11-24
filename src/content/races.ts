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
  hint: 'Restless river-town folk who turn their hand to any trade.',
  tags: [],
  attributes: { brawn: 1, finesse: 1, wits: 1, grit: 1 },
  speed: 100,
});

export const RACE_STONEKIN = defineRace({
  id: 'race.stonekin',
  name: 'Stonekin',
  description:
    'Hill-dwellers who quarry their homes from the mountain and seem half quarried themselves. Slow to move ' +
    'and slower to fall.',
  hint: 'Stone-boned folk who take a long time to fall over.',
  tags: [],
  // +7 points where the Human has +4: the 90 speed costs a tenth of its turns (ETH-160 balance).
  attributes: { brawn: 3, grit: 4 },
  speed: 90,
});

export const RACE_FENLING = defineRace({
  id: 'race.fenling',
  name: 'Fenling',
  description: 'Small, sharp-eyed folk of the reed marshes, quick on their feet and quicker to notice.',
  hint: 'Marsh folk who see the snare before they step in it.',
  tags: [],
  attributes: { brawn: -2, finesse: 2, wits: 2, grit: -1 },
  speed: 110,
});
