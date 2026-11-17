import type { RunConfig } from '../sim';

/**
 * The run the app starts with until the Prepare screen picks one (M1). M0 has one class and one
 * race, so both adventurers share them.
 */
export const DEMO_RUN: RunConfig = {
  party: [
    { name: 'Mira', classId: 'class.vanguard', raceId: 'race.human' },
    { name: 'Oren', classId: 'class.vanguard', raceId: 'race.human' },
  ],
};
