/**
 * Ability tags (ETH-192, CLAUDE.md §5.2): the closed vocabulary every adventurer-usable source
 * declares to say what it does. A source is a usable consumable today (potions, scrolls, food) and
 * will be a class ability or a wand later (ETH-037 must tag every new one). Tactics name a tag, never a class, a
 * spell or an item, so a new class works with every option by tagging its abilities.
 *
 * These are not the free-form `Def.tags` (`junk`, `corpse`, ...): an ability tag is validated
 * against this list wherever a def declares them (`abilityTagsSchema`).
 */
import { z } from 'zod';

/** Every ability tag, in the order the Codex lists them. Adding one is a content change plus a line in `ABILITY_TAG_INFO`. */
export const ABILITY_TAGS = ['heal', 'buff', 'damage', 'debuff', 'control', 'ranged', 'area', 'escape', 'utility'] as const;
export type AbilityTag = (typeof ABILITY_TAGS)[number];

/** What each tag means in plain words: the label the UI shows, and a tooltip sentence. */
export const ABILITY_TAG_INFO: Readonly<Record<AbilityTag, { readonly label: string; readonly description: string }>> = {
  heal: { label: 'Healing', description: 'Restores HP, at once or over time.' },
  buff: { label: 'Bolstering', description: 'Strengthens whoever it is used on for a while: faster, tougher, hits harder.' },
  damage: { label: 'Damaging', description: 'Hurts what it is used on.' },
  debuff: { label: 'Weakening', description: 'Makes its target weaker for a while, such as slower or less accurate, without stopping it.' },
  control: { label: 'Controlling', description: 'Takes its target out of the fight for a while: stunned, held or blinded.' },
  ranged: { label: 'From a distance', description: 'Works on something away from the user, not only on whatever is adjacent.' },
  area: { label: 'Area', description: 'Affects everything in a spread of tiles, not just one target.' },
  escape: { label: 'Escape', description: 'Gets the user out of danger: away from a fight or off the floor.' },
  utility: { label: 'Utility', description: 'Does something useful that is none of the above, such as identifying items or lifting curses.' },
};

/** True if `value` is an ability tag. */
export function isAbilityTag(value: unknown): value is AbilityTag {
  return typeof value === 'string' && (ABILITY_TAGS as readonly string[]).includes(value);
}

/**
 * The `abilityTags` field of a def: known tags only, no repeats. Whether a def must have any is
 * its own kind's rule (an item needs them exactly when using it does something).
 */
export const abilityTagsSchema = z
  .array(z.enum(ABILITY_TAGS))
  .refine((tags) => new Set(tags).size === tags.length, { message: 'must not repeat a tag' });

/** The tags as plain words for a tooltip or Codex field: "Healing, Area". Empty text for none. */
export function abilityTagsText(tags: readonly AbilityTag[] | undefined): string {
  return (tags ?? []).map((t) => ABILITY_TAG_INFO[t].label).join(', ');
}

/** What each tag in `tags` means, one sentence per tag, for a field's hover text. */
export function abilityTagsHint(tags: readonly AbilityTag[] | undefined): string {
  return (tags ?? []).map((t) => `${ABILITY_TAG_INFO[t].label}: ${ABILITY_TAG_INFO[t].description}`).join(' ');
}
