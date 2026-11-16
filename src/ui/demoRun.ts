import type { RunConfig } from '../sim';

/**
 * The run the app starts with until the Prepare screen picks one (M1). Content ids are
 * placeholders until the content registry has classes and races (ETH-015).
 */
export const DEMO_RUN: RunConfig = {
  party: [
    { name: 'Mira', classId: 'class.valkyrie', raceId: 'race.dwarf' },
    { name: 'Oren', classId: 'class.scout', raceId: 'race.human' },
  ],
};
