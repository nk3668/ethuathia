/**
 * Habit slots on the Prepare side (ETH-194, CLAUDE.md §5.2): how many habits each adventurer of
 * this profile's runs may carry (`capacity(profile, 'habitSlots', 1)`, the Guild Hall's Habit
 * Tutor), and what a stored build keeps when it holds more than that (after a respec, say).
 * The sim enforces the same limit through `RunConfig.habitSlots`.
 */
import { MAX_HABITS } from '../../content';
import type { AdventurerPicks } from '../../content';
import type { Profile } from '../profile';
import { capacity } from '../upgrades';

/** Habits every adventurer can carry before any upgrade. */
export const BASE_HABIT_SLOTS = 1;

/** How many habits each adventurer of this profile may carry, from 1 to `MAX_HABITS`. */
export function habitSlotsOf(profile: Profile): number {
  return Math.min(MAX_HABITS, Math.max(1, capacity(profile, 'habitSlots', BASE_HABIT_SLOTS)));
}

/**
 * `picks` cut to `slots` habits: the first ones are kept, so a stored build never fails to start
 * a run. `dropped` lists the habit ids left out (empty when it already fit), for a note to the
 * player. Dropping from the end can't leave an exclusive pair behind.
 */
export function fitHabits<P extends Pick<AdventurerPicks, 'habits'>>(picks: P, slots: number): { picks: P; dropped: string[] } {
  if (picks.habits.length <= slots) return { picks, dropped: [] };
  return { picks: { ...picks, habits: picks.habits.slice(0, slots) }, dropped: picks.habits.slice(slots) };
}
