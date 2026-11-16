/**
 * Goal map speed on an 80x40 floor, the size ETH-008 asks to be cheap enough for every turn.
 * Run with `npm run bench`; `npm test` skips it.
 */
import { test } from 'vitest';
import { Rng } from '../../src/core';
import { FLOOR_HALLS } from '../../src/content';
import {
  buildFleeMap,
  buildGoalMap,
  createRun,
  floorPathGrid,
  generateFloor,
  getEntity,
  memoryPathGrid,
  OPEN_DOOR_COST,
  planToText,
} from '../../src/sim';
import type { EntityId } from '../../src/sim';

const HERO = { name: 'Brannoc', classId: 'class.test', raceId: 'race.test' };
const W = 80;
const H = 40;

/** One open room filling the floor: the most tiles to relax and the most neighbors each. */
const open = createRun(
  {
    party: [HERO],
    floorText: Array.from({ length: H }, (_, y) =>
      y === 0 || y === H - 1 ? '#'.repeat(W) : `#${y === 1 ? '@' : '.'}${'.'.repeat(W - 3)}#`,
    ),
  },
  1,
);

/** A rooms-and-corridors floor at 80x40. */
const halls = createRun(
  {
    party: [HERO],
    floorText: planToText(generateFloor({ ...FLOOR_HALLS, size: { w: W, h: H } }, Rng.seeded(1, 'dungeon'))),
  },
  1,
);

const corner = { x: W - 2, y: H - 2 };
const hallsHero = getEntity(halls, halls.party[0] as EntityId).pos;
const openPaths = floorPathGrid(open, 'd1');
const hallsPaths = floorPathGrid(halls, 'd1', { closedDoorCost: OPEN_DOOR_COST });
const openToward = buildGoalMap(openPaths, [corner]);

test('goal maps on an 80x40 floor', async ({ bench }) => {
  await bench.compare(
    bench('open room: buildGoalMap', () => {
      buildGoalMap(openPaths, [corner]);
    }),
    bench('open room: floorPathGrid + buildGoalMap', () => {
      buildGoalMap(floorPathGrid(open, 'd1'), [corner]);
    }),
    bench('open room: buildFleeMap', () => {
      buildFleeMap(openPaths, openToward);
    }),
    bench('halls: buildGoalMap', () => {
      buildGoalMap(hallsPaths, [hallsHero]);
    }),
    bench('halls: floorPathGrid + buildGoalMap', () => {
      buildGoalMap(floorPathGrid(halls, 'd1', { closedDoorCost: OPEN_DOOR_COST }), [hallsHero]);
    }),
    bench('halls: memoryPathGrid + buildGoalMap', () => {
      buildGoalMap(memoryPathGrid(halls, 'd1', { closedDoorCost: OPEN_DOOR_COST }), [hallsHero]);
    }),
  );
});
