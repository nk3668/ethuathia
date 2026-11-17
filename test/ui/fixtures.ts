import { createRun, snapshot } from '../../src/sim';
import type { Snapshot } from '../../src/sim';

/**
 * The `domains` slice of a fresh one-tile run's snapshot, for UI tests that build a `Snapshot`
 * by hand. Taken from a real run, so fixtures keep compiling as domains add snapshot fields.
 */
export function fixtureDomains(): Snapshot['domains'] {
  const config = { party: [{ name: 'Fixture', classId: 'class.vanguard', raceId: 'race.human' }], floorText: ['###', '#@#', '###'] };
  return snapshot(createRun(config, 1)).domains;
}
