/**
 * From profile to run (docs/ARCHITECTURE.md §6.3, ETH-064): the Prepare screen's choices and
 * `buildRunConfig`, the one path that turns a profile and those choices into a `RunConfig`.
 *
 * `RUN_CHOICES` is the one place choice sections are composed. A feature that adds a Prepare
 * decision (contracts, bounties, Omens, the patron) adds a section file next to these and one
 * line here; `RunChoices`, the saved copy in the profile's `prepare` slice and `buildRunConfig`
 * follow. The order of the record is the order sections apply in (and draw from the RNG).
 */
import type { ChoiceOf, RunChoiceSection } from './choice';
import { CONTRACTS_CHOICE } from './contracts';
import { DUNGEON_CHOICE } from './dungeon';
import { OPT_INS_CHOICE } from './optIns';
import { PARTY_CHOICE } from './party';

export const RUN_CHOICES = {
  party: PARTY_CHOICE,
  dungeon: DUNGEON_CHOICE,
  contracts: CONTRACTS_CHOICE,
  optIns: OPT_INS_CHOICE,
} as const;

type Sections = typeof RUN_CHOICES;

export type RunChoiceKey = keyof Sections;

/** Everything the player set on the Prepare screen, one entry per section. */
export type RunChoices = { readonly [K in RunChoiceKey]: ChoiceOf<Sections[K]> };

/** The sections as a plain list, for code that treats them all alike. */
export const CHOICE_ENTRIES = Object.entries(RUN_CHOICES) as [RunChoiceKey, RunChoiceSection<unknown>][];

/** Choices before the player has made any: every section at its default. */
export function defaultRunChoices(): RunChoices {
  const choices: Record<string, unknown> = {};
  for (const [key, section] of CHOICE_ENTRIES) choices[key] = section.init();
  return choices as RunChoices;
}

/** Every section from `partial`, and the default for any section it lacks. */
export function completeRunChoices(partial: Partial<RunChoices>): RunChoices {
  const choices: Record<string, unknown> = { ...defaultRunChoices() };
  for (const [key, value] of Object.entries(partial)) if (value !== undefined) choices[key] = value;
  return choices as RunChoices;
}
