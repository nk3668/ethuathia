/**
 * Forge Stamps (ETH-188): the three marks the Smithy's *Forge Stamps* node lets the player put on
 * each adventurer's starting kit. A stamp is one of the existing special enchantments worked into a
 * kit piece at level 1: Keen on the main-hand item, Warding or Nimble on the first piece of armor.
 * The kit piece stays identified and is never sold, like the rest of the kit (ETH-176).
 *
 * Each class names its default stamp (`ClassDef.stamp`), used for random recruits and for a slot
 * the player leaves on "Class default". The Prepare party panel sets the stamp per slot
 * (`RecruitPick.stamp`), and `buildRunConfig` writes the resolved id into `AdventurerConfig.stamp`.
 */
import { ENCHANT_KEEN, ENCHANT_NIMBLE, ENCHANT_WARDING } from './enchantments';
import type { StartEnchantPiece } from './startPerks';

export const STAMP_IDS = ['keen', 'warding', 'nimble'] as const;
export type StampId = (typeof STAMP_IDS)[number];

export interface StampDef {
  readonly id: StampId;
  readonly name: string;
  /** The kit piece it is worked into: the main-hand item or the first piece of armor. */
  readonly piece: StartEnchantPiece;
  /** The special enchantment it applies, at level `STAMP_LEVEL`. */
  readonly enchantment: string;
  /** One line for the Prepare select and the tooltip. */
  readonly text: string;
}

/** The enchantment rank a stamp gives. */
export const STAMP_LEVEL = 1;

export const STAMPS: Readonly<Record<StampId, StampDef>> = {
  keen: {
    id: 'keen',
    name: 'Keen stamp',
    piece: 'weapon',
    enchantment: ENCHANT_KEEN.id,
    text: 'The main-hand item is Keen: +1 Accuracy.',
  },
  warding: {
    id: 'warding',
    name: 'Warding stamp',
    piece: 'defense',
    enchantment: ENCHANT_WARDING.id,
    text: 'The first armor piece is of Warding: +10% Status Resistance.',
  },
  nimble: {
    id: 'nimble',
    name: 'Nimble stamp',
    piece: 'defense',
    enchantment: ENCHANT_NIMBLE.id,
    text: 'The first armor piece is Nimble: +1 Evasion.',
  },
};

export function isStampId(value: unknown): value is StampId {
  return typeof value === 'string' && (STAMP_IDS as readonly string[]).includes(value);
}
