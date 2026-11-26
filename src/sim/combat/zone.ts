/**
 * The no-go zone of a hopeless flee/return cycle (ETH-189). Once an adventurer has fled the same
 * trouble too often (`cycleHopeless`), `AiMemory.fleeCycle.blocked` holds the spot of the foe it
 * keeps fleeing, and exploring, picking up and going down plan around everything within
 * `FLEE_BLOCK_RADIUS` tiles of it: those tiles are impassable on the planning grid, so the
 * adventurer heads for other ground or another way down if there is one. The zone lasts until HP
 * is back to `FLEE_RELEASE_PERCENT` (the cycle ends). Imports nothing but types, so floors, items
 * and ai rules can all use it.
 */
import type { PathGrid } from '../goalMap';
import type { AiCtx } from '../ai/types';
import { FLEE_BLOCK_RADIUS, FLEE_HOPELESS_RECOVER_PERCENT, FLEE_RELEASE_PERCENT } from './fleeConfig';

/** The HP percentage that ends a flee/return cycle: the release level, or higher once the cycle is hopeless. */
export function cycleRecoverPercent(cycle: { blocked?: unknown }): number {
  return cycle.blocked === undefined ? FLEE_RELEASE_PERCENT : FLEE_HOPELESS_RECOVER_PERCENT;
}

/**
 * Makes the zone impassable on `paths` (never the actor's own tile). Returns the trace note
 * ("keeping clear of the area around (x, y), where I keep fleeing"), or null when there is no zone.
 */
export function blockFleeZone(ctx: AiCtx, paths: PathGrid): string | null {
  const blocked = ctx.actor.ai.memory.fleeCycle?.blocked;
  if (blocked === undefined || ctx.actor.actor.faction !== 'party') return null;
  const { width, height, cost } = paths;
  const here = ctx.actor.pos;
  for (let y = Math.max(0, blocked.y - FLEE_BLOCK_RADIUS); y <= Math.min(height - 1, blocked.y + FLEE_BLOCK_RADIUS); y++) {
    for (let x = Math.max(0, blocked.x - FLEE_BLOCK_RADIUS); x <= Math.min(width - 1, blocked.x + FLEE_BLOCK_RADIUS); x++) {
      if (x === here.x && y === here.y) continue;
      cost[y * width + x] = 0;
    }
  }
  return `keeping clear of the area around (${blocked.x}, ${blocked.y}), where I keep fleeing`;
}
