/**
 * The `settings` slice: the player's game settings, kept with the save (docs/ARCHITECTURE.md
 * §6.1). Per-machine conveniences (log height, open tab, map camera) stay in the UI's
 * `localStorage` instead.
 *
 * - `autoRestart` (ETH-062, CLAUDE.md §2): when a run ends, start the next one with the same
 *   settings after a short countdown. Off by default: the game waits for the player.
 */
import { z } from 'zod';
import { defineSlice } from '../slice';

export interface Settings {
  readonly autoRestart: boolean;
}

const settingsSchema = z.object({ autoRestart: z.boolean() });

export const settingsSlice = defineSlice<Settings>({
  version: 1,
  schema: settingsSchema,
  init: () => ({ autoRestart: false }),
});
