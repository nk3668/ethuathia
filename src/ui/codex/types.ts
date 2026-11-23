/**
 * How a content kind shows in the Codex and in `Explain` tooltips (docs/ARCHITECTURE.md §8.5).
 *
 * Each kind has one renderer file in `renderers/`, whose default export is a `defineCodexRenderer`
 * result. `registry.ts` picks every file there up on its own, so a new kind (or a richer view of
 * one) is one file and no edit to the Codex tab.
 */
import type { Glyph } from '../../content';
import type { Def, Registry } from '../../core';
import type { ReactNode } from 'react';

/** One labeled value in an entry's stat table, e.g. `{ label: 'HP', value: 18 }`. */
export interface CodexField {
  readonly label: string;
  readonly value: ReactNode;
  /** What the value means, shown as the row's tooltip. */
  readonly hint?: string;
  /** Also shown in `Explain` tooltips. Keep it to the two or three fields that matter most. */
  readonly key?: boolean;
  /** Minimum kills of this entry required before the Codex or `Explain` reveals this row (ETH-091). */
  readonly minKills?: number;
}

/** One kill-count threshold for tiered entries such as monsters (ETH-091). */
export interface CodexKillTier {
  readonly kills: number;
  readonly label: string;
}

export interface CodexRenderer<T extends Def = Def> {
  /** The kind's registry. Its `kind` (`monster`) is the section's id. */
  readonly registry: Registry<T>;
  /** The section title, plural: `Monsters`. */
  readonly label: string;
  /** Where the section sits in the Codex: lower first. */
  readonly order: number;
  /** Fallback hint on an undiscovered entry when the def has none of its own. */
  readonly hint?: string;
  /** Every entry counts as discovered (terrain, which anyone sees on the first step). */
  readonly alwaysKnown?: boolean;
  /** Left out of the Codex (but still shown by `Explain`). */
  readonly hidden?: boolean;
  /** Kill-count tiers for kinds that reveal more as the player slays more of them (ETH-091). */
  killTiers?(def: T): readonly CodexKillTier[];
  /** Kills required before the entry's full `description` lore replaces its `hint` (ETH-091). */
  loreKills?(def: T): number;
  /** The entry's look. Defaults to the def's own `glyph` field, if it has one. */
  glyph?(def: T): Glyph | undefined;
  /** The subheading the entry is listed under, e.g. a monster's family. */
  group?(def: T): string | undefined;
  /** The entry's stat table, in order. */
  fields?(def: T): readonly CodexField[];
}

/**
 * Declares a kind's renderer, typed by its registry so `fields` and `group` see the real def
 * type. Make it the default export of a file in `ui/codex/renderers/`.
 */
export function defineCodexRenderer<T extends Def>(renderer: CodexRenderer<T>): CodexRenderer {
  return renderer as unknown as CodexRenderer;
}
