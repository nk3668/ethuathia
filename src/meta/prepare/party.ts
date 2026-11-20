/**
 * The party section (CLAUDE.md §2, step 1): who descends. The party always fills every slot the
 * Guild Hall allows (`capacity(profile, 'partySize', BASE_PARTY_SIZE)`, at most
 * `MAX_PARTY_SIZE`). The player may set a slot's class and race; anything left open is a random
 * recruit from the available classes and races, drawn from the run's seed, with a random name.
 * Picking named adventurers from a roster joins this section with the roster (M5).
 */
import { z } from 'zod';
import { generateText, GRAMMAR_ADVENTURER_NAME } from '../../content';
import { idSchema } from '../../content/schema';
import { textRng } from '../../core';
import type { Profile } from '../profile';
import { capacity } from '../upgrades';
import { availableClasses, availableRaces } from './available';
import { defineRunChoice } from './choice';

/** Party slots before any Guild Hall upgrade. */
export const BASE_PARTY_SIZE = 1;

/** The most adventurers a party can have (CLAUDE.md §2). */
export const MAX_PARTY_SIZE = 4;

/** One slot's wishes. `null` means "random". */
export interface RecruitPick {
  readonly classId: string | null;
  readonly raceId: string | null;
}

export interface PartyChoice {
  /** Slot `i`'s pick. Slots past the end of the list are random recruits. */
  readonly slots: readonly RecruitPick[];
}

export const RANDOM_PICK: RecruitPick = { classId: null, raceId: null };

const pickSchema = z.object({ classId: idSchema('class').nullable(), raceId: idSchema('race').nullable() });

/** How many adventurers this profile's runs take. */
export function partySize(profile: Profile): number {
  return Math.min(MAX_PARTY_SIZE, Math.max(1, capacity(profile, 'partySize', BASE_PARTY_SIZE)));
}

const MAX_NAME_ATTEMPTS = 16;

/**
 * Generates an adventurer name for `slot` not yet in `taken` from `grammar.adventurer_name`,
 * using `textRng(seed, 'recruit-name', slot + '/' + attempt)` so name generation never draws
 * from the `prepare` RNG stream. Falls back to numbering after `MAX_NAME_ATTEMPTS` tries.
 */
export function recruitName(seed: number, slot: number, taken: readonly string[]): string {
  let last = '';
  for (let attempt = 0; attempt < MAX_NAME_ATTEMPTS; attempt++) {
    const name = generateText(GRAMMAR_ADVENTURER_NAME.id, textRng(seed, 'recruit-name', `${slot}/${attempt}`), {}, { strict: true });
    if (!taken.includes(name)) return name;
    last = name;
  }
  return `${last} ${taken.length + 1}`;
}

export const PARTY_CHOICE = defineRunChoice<PartyChoice>({
  schema: z.object({ slots: z.array(pickSchema).max(MAX_PARTY_SIZE) }),
  init: () => ({ slots: [] }),
  apply: ({ profile, seed, rng, config }, choice) => {
    const classes = availableClasses(profile).map((d) => d.id);
    const races = availableRaces(profile).map((d) => d.id);
    if (classes.length === 0 || races.length === 0) throw new RangeError('No class or race is available to recruit from');
    const size = partySize(profile);
    for (let i = 0; i < size; i++) {
      const pick = choice.slots[i] ?? RANDOM_PICK;
      // A pick the profile no longer allows is a random recruit instead.
      const classId = pick.classId !== null && classes.includes(pick.classId) ? pick.classId : rng.pick(classes);
      const raceId = pick.raceId !== null && races.includes(pick.raceId) ? pick.raceId : rng.pick(races);
      const name = recruitName(seed, i, config.party.map((m) => m.name));
      config.party.push({ name, classId, raceId });
    }
  },
});
