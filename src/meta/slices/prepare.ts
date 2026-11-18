/**
 * The `prepare` slice (ETH-064): the Prepare screen's choices as the player last left them
 * (`RunChoices`, `src/meta/prepare/`). The screen edits them in place, Descend starts a run from
 * them, and auto-restart starts the next run from them again.
 *
 * Each section's saved choice is checked by its own schema; one that is missing (a section
 * added after the save was written) or no longer valid starts at the section's default, so a
 * new Prepare section needs no migration here.
 */
import { z } from 'zod';
import { CHOICE_ENTRIES, defaultRunChoices } from '../prepare';
import type { RunChoices } from '../prepare';
import { defineSlice } from '../slice';

export interface Prepare {
  readonly choices: RunChoices;
}

const choicesSchema = z.object(
  Object.fromEntries(CHOICE_ENTRIES.map(([key, section]) => [key, section.schema.catch(() => section.init())])),
) as unknown as z.ZodType<RunChoices>;

export const prepareSlice = defineSlice<Prepare>({
  version: 1,
  schema: z.object({ choices: choicesSchema }),
  init: () => ({ choices: defaultRunChoices() }),
});
