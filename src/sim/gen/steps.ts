/**
 * The generation steps for a rooms-and-corridors floor: lay out rooms, connect them, put doors
 * in the room mouths and place the stairs. Each is a `GenStepDef` registered in `GEN_STEPS`.
 *
 * Steps draw only from the rng they are given, in a fixed order, so the same seed always gives
 * the same floor.
 */
import { DIRS_4, Grid } from '../../core';
import type { Pos, Rng } from '../../core';
import { DEFS, Terrain } from '../state';
import { readParams } from './params';
import { defineGenStep, rectTiles } from './types';
import type { FloorDraft, GenStepDef, Rect } from './types';

function isFloor(terrain: Grid, x: number, y: number): boolean {
  return terrain.inBounds(x, y) && terrain.get(x, y) === Terrain.Floor;
}

/** A `u8` grid with 1 on every tile that already has a feature (of `kind`, if given). */
function featureMask(draft: FloorDraft, kind?: 'door' | 'stairs'): Grid {
  const mask = new Grid(draft.terrain.width, draft.terrain.height, 'u8');
  for (const f of draft.features) {
    if (kind === undefined || f.feature.kind === kind) mask.set(f.pos.x, f.pos.y, 1);
  }
  return mask;
}

// ---------------------------------------------------------------------------------------------
// gen.rooms

/** True if `a` and `b` overlap or have fewer than `gap` wall tiles between them. */
function tooClose(a: Rect, b: Rect, gap: number): boolean {
  return !(a.x + a.w + gap <= b.x || b.x + b.w + gap <= a.x || a.y + a.h + gap <= b.y || b.y + b.h + gap <= a.y);
}

const rooms = defineGenStep({
  id: 'gen.rooms',
  name: 'Lay out rooms',
  description:
    'Tries rectangles of random size at random places and carves out each one that keeps its distance from the rooms already placed.',
  parse(raw) {
    const p = readParams(raw, {
      maxRooms: { default: 12, min: 1, max: 200, integer: true },
      attempts: { default: 200, min: 1, max: 10_000, integer: true },
      minWidth: { default: 4, min: 2, max: 250, integer: true },
      maxWidth: { default: 12, min: 2, max: 250, integer: true },
      minHeight: { default: 3, min: 2, max: 250, integer: true },
      maxHeight: { default: 7, min: 2, max: 250, integer: true },
      /** Fewest wall tiles between two rooms. */
      gap: { default: 2, min: 1, max: 20, integer: true },
    });
    if (p.minWidth > p.maxWidth) throw new RangeError(`minWidth (${p.minWidth}) is above maxWidth (${p.maxWidth})`);
    if (p.minHeight > p.maxHeight) throw new RangeError(`minHeight (${p.minHeight}) is above maxHeight (${p.maxHeight})`);
    return p;
  },
  run(draft, p, rng) {
    const { terrain } = draft;
    if (p.maxWidth > terrain.width - 2 || p.maxHeight > terrain.height - 2) {
      throw new RangeError(
        `rooms up to ${p.maxWidth}x${p.maxHeight} don't fit inside the border of a ${terrain.width}x${terrain.height} floor`,
      );
    }
    for (let i = 0; i < p.attempts && draft.rooms.length < p.maxRooms; i++) {
      const w = rng.int(p.minWidth, p.maxWidth);
      const h = rng.int(p.minHeight, p.maxHeight);
      // Keep a wall border round the floor: interiors run from 1 to size - 2.
      const room: Rect = { x: rng.int(1, terrain.width - 1 - w), y: rng.int(1, terrain.height - 1 - h), w, h };
      if (draft.rooms.some((other) => tooClose(room, other, p.gap))) continue;
      for (const t of rectTiles(room)) terrain.set(t.x, t.y, Terrain.Floor);
      draft.rooms.push(room);
    }
  },
});

// ---------------------------------------------------------------------------------------------
// gen.corridors

function center(r: Rect): Pos {
  return { x: r.x + Math.floor(r.w / 2), y: r.y + Math.floor(r.h / 2) };
}

function distance(a: Rect, b: Rect): number {
  const ca = center(a);
  const cb = center(b);
  return Math.abs(ca.x - cb.x) + Math.abs(ca.y - cb.y);
}

function carveRow(terrain: Grid, y: number, x1: number, x2: number): void {
  for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) terrain.set(x, y, Terrain.Floor);
}

function carveColumn(terrain: Grid, x: number, y1: number, y2: number): void {
  for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) terrain.set(x, y, Terrain.Floor);
}

/**
 * Carves an L-shaped passage from a random tile of `a` to a random tile of `b`, turning once.
 * It stays inside the box spanned by the two tiles, so it never reaches the floor's border.
 */
function carveCorridor(terrain: Grid, a: Rect, b: Rect, rng: Rng): void {
  const from = { x: rng.int(a.x, a.x + a.w - 1), y: rng.int(a.y, a.y + a.h - 1) };
  const to = { x: rng.int(b.x, b.x + b.w - 1), y: rng.int(b.y, b.y + b.h - 1) };
  if (rng.chance(0.5)) {
    carveRow(terrain, from.y, from.x, to.x);
    carveColumn(terrain, to.x, from.y, to.y);
  } else {
    carveColumn(terrain, from.x, from.y, to.y);
    carveRow(terrain, to.y, from.x, to.x);
  }
}

const corridors = defineGenStep({
  id: 'gen.corridors',
  name: 'Connect rooms',
  description:
    'Joins every room with L-shaped passages along a minimum spanning tree of room centers, so every room can be reached, then adds a few extra passages to make loops.',
  parse(raw) {
    return readParams(raw, {
      /** Chance, per room, of an extra passage to its nearest room not yet joined to it. */
      extraChance: { default: 0.15, min: 0, max: 1 },
    });
  },
  run(draft, p, rng) {
    const { rooms: list, terrain } = draft;
    const n = list.length;
    if (n < 2) return;
    const linked = new Grid(n, n, 'u8');
    const link = (i: number, j: number) => {
      carveCorridor(terrain, list[i] as Rect, list[j] as Rect, rng);
      linked.set(i, j, 1);
      linked.set(j, i, 1);
    };

    // Prim's algorithm. Ties go to the lowest indices, so the tree depends only on the layout.
    const inTree = list.map((_, i) => i === 0);
    for (let added = 1; added < n; added++) {
      let best = { i: -1, j: -1, d: Infinity };
      for (let i = 0; i < n; i++) {
        if (!inTree[i]) continue;
        for (let j = 0; j < n; j++) {
          if (inTree[j]) continue;
          const d = distance(list[i] as Rect, list[j] as Rect);
          if (d < best.d) best = { i, j, d };
        }
      }
      inTree[best.j] = true;
      link(best.i, best.j);
    }

    for (let i = 0; i < n; i++) {
      if (!rng.chance(p.extraChance)) continue;
      let nearest = { j: -1, d: Infinity };
      for (let j = 0; j < n; j++) {
        if (j === i || linked.get(i, j) === 1) continue;
        const d = distance(list[i] as Rect, list[j] as Rect);
        if (d < nearest.d) nearest = { j, d };
      }
      if (nearest.j !== -1) link(i, nearest.j);
    }
  },
});

// ---------------------------------------------------------------------------------------------
// gen.doors

/**
 * The tiles of the wall ring just outside `room`, without its corners, each with the step that
 * leads into the room. Sides in the order top, bottom, left, right.
 */
function ringTiles(room: Rect): { pos: Pos; inward: Pos }[] {
  const out: { pos: Pos; inward: Pos }[] = [];
  for (let x = room.x; x < room.x + room.w; x++) out.push({ pos: { x, y: room.y - 1 }, inward: { x: 0, y: 1 } });
  for (let x = room.x; x < room.x + room.w; x++) out.push({ pos: { x, y: room.y + room.h }, inward: { x: 0, y: -1 } });
  for (let y = room.y; y < room.y + room.h; y++) out.push({ pos: { x: room.x - 1, y }, inward: { x: 1, y: 0 } });
  for (let y = room.y; y < room.y + room.h; y++) out.push({ pos: { x: room.x + room.w, y }, inward: { x: -1, y: 0 } });
  return out;
}

const doors = defineGenStep({
  id: 'gen.doors',
  name: 'Place doors',
  description:
    'Looks for room mouths: a passage through the wall around a room that is one tile wide, with floor in front and behind and wall on both sides. Some of them get a door, which may start open.',
  parse(raw) {
    return readParams(raw, {
      /** Chance that a room mouth gets a door. */
      chance: { default: 0.7, min: 0, max: 1 },
      /** Chance that a door starts open. */
      openChance: { default: 0.25, min: 0, max: 1 },
    });
  },
  run(draft, p, rng) {
    const { terrain } = draft;
    const checked = new Grid(terrain.width, terrain.height, 'u8');
    const occupied = featureMask(draft);
    const doorAt = featureMask(draft, 'door');
    const hasDoor = (x: number, y: number) => doorAt.inBounds(x, y) && doorAt.get(x, y) === 1;

    for (const room of draft.rooms) {
      for (const { pos, inward } of ringTiles(room)) {
        const { x, y } = pos;
        if (!terrain.inBounds(x, y) || checked.get(x, y) === 1) continue;
        checked.set(x, y, 1);
        if (!isFloor(terrain, x, y) || occupied.get(x, y) === 1) continue;
        // A mouth is floor front and back along `inward`, and wall on both sides across it.
        // Doorways are entered and left orthogonally, so this shape never blocks a route.
        const mouth =
          isFloor(terrain, x + inward.x, y + inward.y) &&
          isFloor(terrain, x - inward.x, y - inward.y) &&
          !isFloor(terrain, x + inward.y, y + inward.x) &&
          !isFloor(terrain, x - inward.y, y - inward.x);
        if (!mouth || DIRS_4.some((d) => hasDoor(x + d.x, y + d.y))) continue;
        if (!rng.chance(p.chance)) continue;
        const open = rng.chance(p.openChance);
        draft.features.push({ def: DEFS.door, pos: { x, y }, feature: { kind: 'door', open } });
        doorAt.set(x, y, 1);
        occupied.set(x, y, 1);
      }
    }
  },
});

// ---------------------------------------------------------------------------------------------
// gen.stairs

/** Steps (orthogonal) from `start` to every floor tile it can reach, or -1 where it can't. */
function distancesFrom(terrain: Grid, start: Pos): Grid {
  const dist = new Grid(terrain.width, terrain.height, 'i32', -1);
  dist.set(start.x, start.y, 0);
  const queue: Pos[] = [start];
  // for-of also visits the tiles pushed during the loop.
  for (const p of queue) {
    const d = dist.get(p.x, p.y);
    terrain.forEachNeighbor(
      p.x,
      p.y,
      (x, y) => {
        if (dist.get(x, y) !== -1 || terrain.get(x, y) !== Terrain.Floor) return;
        dist.set(x, y, d + 1);
        queue.push({ x, y });
      },
      DIRS_4,
    );
  }
  return dist;
}

const stairs = defineGenStep({
  id: 'gen.stairs',
  name: 'Place stairs',
  description:
    'Puts the up stairs in a random room and the down stairs in a random room from the half farthest from it by walking distance.',
  parse(raw) {
    return readParams(raw, {});
  },
  run(draft, _p, rng) {
    const { rooms: list, terrain } = draft;
    if (list.length === 0) throw new Error('there are no rooms to put stairs in');
    const occupied = featureMask(draft);
    const freeTiles = (room: Rect) =>
      rectTiles(room).filter((t) => terrain.get(t.x, t.y) === Terrain.Floor && occupied.get(t.x, t.y) === 0);
    const place = (room: Rect, dir: 'up' | 'down'): Pos => {
      const tiles = freeTiles(room);
      if (tiles.length === 0) throw new Error(`no free tile for the ${dir} stairs`);
      const pos = rng.pick(tiles);
      draft.features.push({ def: dir === 'up' ? DEFS.stairsUp : DEFS.stairsDown, pos, feature: { kind: 'stairs', dir } });
      occupied.set(pos.x, pos.y, 1);
      return pos;
    };

    const upIndex = rng.int(0, list.length - 1);
    const up = place(list[upIndex] as Rect, 'up');

    const dist = distancesFrom(terrain, up);
    const reachable = list
      .map((room, i) => ({ room, i, d: dist.get(center(room).x, center(room).y) }))
      .filter((r) => r.i !== upIndex && r.d !== -1)
      .sort((a, b) => b.d - a.d || a.i - b.i);
    const far = reachable.slice(0, Math.ceil(reachable.length / 2));
    place(far.length > 0 ? rng.pick(far).room : (list[upIndex] as Rect), 'down');
  },
});

/** The steps of a rooms-and-corridors floor, in the order a floor type normally runs them. */
export const ROOM_STEPS: readonly GenStepDef[] = [rooms, corridors, doors, stairs];
