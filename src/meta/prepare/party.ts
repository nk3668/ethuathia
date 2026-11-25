/**
 * The party section (CLAUDE.md §2, step 1): who descends. The party always fills every slot the
 * Guild Hall allows (`capacity(profile, 'partySize', BASE_PARTY_SIZE)`, at most
 * `MAX_PARTY_SIZE`). The player may set a slot's class and race; anything left open is a random
 * recruit from the available classes and races, drawn from the run's seed, with a random name.
 * Picking named adventurers from a roster joins this section with the roster (M5).
 */
import { z } from 'zod';
import { CLASSES, generateText, GRAMMAR_ADVENTURER_NAME, isStampId, STAMP_IDS } from '../../content';
import type { StampId } from '../../content';
import { idSchema } from '../../content/schema';
import { textRng } from '../../core';
import type { Profile } from '../profile';
import { capacity, profileGrants } from '../upgrades';
import { availableClasses, availableRaces, teaserClasses, teaserRaces } from './available';
import { defineRunChoice } from './choice';
import type { BuildCtx } from './choice';

/** Party slots before any Guild Hall upgrade. */
export const BASE_PARTY_SIZE = 1;

/** The most adventurers a party can have (CLAUDE.md §2). */
export const MAX_PARTY_SIZE = 4;

/** One slot's wishes. `null` means "random". */
export interface RecruitPick {
  readonly classId: string | null;
  readonly raceId: string | null;
  /** The Forge Stamp (ETH-188) for this slot's kit; `null` is the class's default. Only used once the Smithy's Forge Stamps are owned. */
  readonly stamp?: StampId | null;
}

export interface PartyChoice {
  /** Slot `i`'s pick. Slots past the end of the list are random recruits. */
  readonly slots: readonly RecruitPick[];
}

export const RANDOM_PICK: RecruitPick = { classId: null, raceId: null };

const pickSchema = z.object({
  classId: idSchema('class').nullable(),
  raceId: idSchema('race').nullable(),
  // A save from before Forge Stamps has no stamp; a stamp that is no longer known reads as the default.
  stamp: z.enum(STAMP_IDS).nullable().optional().catch(null),
});

/** True if the profile owns the Smithy's Forge Stamps (ETH-188): the stamp select shows and stamps are applied. */
export function ownsStamps(profile: Profile): boolean {
  return profileGrants(profile).some(({ grant }) => grant.kind === 'start' && grant.start.perk === 'stamps');
}

/** How many adventurers this profile's runs take. */
export function partySize(profile: Profile): number {
  return Math.min(MAX_PARTY_SIZE, Math.max(1, capacity(profile, 'partySize', BASE_PARTY_SIZE)));
}

/**
 * The chance (ETH-036) that a random class or race pick draws a teaser instead: a class or race
 * a run has revealed but the player hasn't bought. Rolled only while one exists, so a profile
 * with no teasers draws exactly what it did before.
 */
export const TEASER_CHANCE = 0.1;

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

/**
 * Fills `size` party slots into `ctx.config`: a slot's pick where the profile still allows it,
 * otherwise a random recruit from the available classes and races, with a generated name.
 * `PARTY_CHOICE` applies it with the profile's party size; the sim harness's `--recruits`
 * (ETH-178) applies it through `recruitParty` with the size it was given.
 */
export function fillParty({ profile, seed, rng, config }: BuildCtx, slots: readonly RecruitPick[], size: number): void {
  const classes = availableClasses(profile).map((d) => d.id);
  const races = availableRaces(profile).map((d) => d.id);
  if (classes.length === 0 || races.length === 0) throw new RangeError('No class or race is available to recruit from');
  const teasingClasses = teaserClasses(profile).map((d) => d.id);
  const teasingRaces = teaserRaces(profile).map((d) => d.id);
  /** A random pick: from the teasers with `TEASER_CHANCE` (if there are any), else from the available ones. */
  const randomPick = (open: readonly string[], teasers: readonly string[]) =>
    teasers.length > 0 && rng.chance(TEASER_CHANCE) ? rng.pick(teasers) : rng.pick(open);
  for (let i = 0; i < size; i++) {
    const pick = slots[i] ?? RANDOM_PICK;
    // A pick the profile no longer allows is a random recruit instead.
    const classId = pick.classId !== null && classes.includes(pick.classId) ? pick.classId : randomPick(classes, teasingClasses);
    const raceId = pick.raceId !== null && races.includes(pick.raceId) ? pick.raceId : randomPick(races, teasingRaces);
    const name = recruitName(seed, i, config.party.map((m) => m.name));
    // Forge Stamps (ETH-188): the slot's pick, else the class's default, resolved here so the sim sees one id. No RNG is drawn.
    const stamp = ownsStamps(profile) ? (isStampId(pick.stamp) ? pick.stamp : CLASSES.get(classId).stamp) : undefined;
    config.party.push({ name, classId, raceId, ...(stamp === undefined ? {} : { stamp }) });
  }
}

export const PARTY_CHOICE = defineRunChoice<PartyChoice>({
  schema: z.object({ slots: z.array(pickSchema).max(MAX_PARTY_SIZE) }),
  init: () => ({ slots: [] }),
  apply: (ctx, choice) => fillParty(ctx, choice.slots, partySize(ctx.profile)),
});
