/**
 * Return-trip floor repopulation (ETH-025): when the party re-enters an already-visited floor
 * after completing its contracts, a deterministic wave of stronger monsters (`depthShift`) spawns
 * away from the arrival stairs.
 *
 * - `"The dungeon stirs."` (`dungeonStirred`) is announced once per run on the first repopulated
 *   floor, while every visited floor repopulates silently (`floorRespawned`, quiet in the log)
 *   as the party climbs back through it.
 * - Multi-member parties only trigger one wave per floor: only the first member stepping onto a
 *   floor with no living party members already on it triggers repopulation.
 * - A run-wide modifier flag (`FLAG_CONSTANT_RESPAWN`, for a future Guild Hall upgrade, ETH-129)
 *   or `RespawnConfig.continuous` allows floors to repopulate on any re-entry after a cooldown.
 */
import type { Pos } from '../../core';
import { respawnFloor } from '../combat/monsters';
import type { RespawnOptions } from '../combat/monsters';
import type { Emit } from '../events';
import { contractsComplete } from '../quests/contracts';
import type { FloorId, RunState } from '../state';
import { runFlag } from '../stats/runModifiers';
import { floorNode } from './dungeon';

/**
 * Run-modifier flag (ETH-115) enabling constant floor repopulation on re-entry after a cooldown,
 * even before contracts are complete and across multiple revisits (planned Guild Hall upgrade,
 * ETH-129).
 */
export const FLAG_CONSTANT_RESPAWN = 'floors.constant_respawn';

/** Default game turns a floor must stay vacated before constant respawn triggers another wave. */
export const CONSTANT_RESPAWN_COOLDOWN = 50;

/** Tunable floor-repopulation settings (`RunConfig.respawn`, ETH-025). */
export interface RespawnConfig extends RespawnOptions {
  /** `false` disables return-trip repopulation (e.g. for focused tests). Default true. */
  enabled?: boolean;
  /** `true` enables constant repopulation on revisit (same as `FLAG_CONSTANT_RESPAWN`). */
  continuous?: boolean;
  /** Turns a floor must remain vacated before constant respawn triggers again. Default `CONSTANT_RESPAWN_COOLDOWN`. */
  cooldown?: number;
}

/**
 * Checks whether re-entering `floorId` at `arrivalPos` should repopulate it, and if so spawns
 * the wave and emits `dungeonStirred` (once per run) and `floorRespawned`.
 */
export function maybeRespawnFloor(
  state: RunState,
  floorId: FloorId,
  arrivalPos: Pos,
  wasEmpty: boolean,
  firstVisit: boolean,
  emit: Emit,
): number {
  if (firstVisit || !wasEmpty || state.config.monsters === false) return 0;
  const cfg = state.config.respawn;
  if (cfg?.enabled === false) return 0;

  const slice = state.domains.floors;
  const continuous = cfg?.continuous === true || runFlag(state, FLAG_CONSTANT_RESPAWN);
  const prior = slice.respawns[floorId] ?? 0;

  if (continuous) {
    const vacated = slice.lastVacated[floorId];
    const cooldown = cfg?.cooldown ?? CONSTANT_RESPAWN_COOLDOWN;
    if (vacated !== undefined && state.turn - vacated < cooldown) return 0;
  } else {
    if (!contractsComplete(state) || prior > 0) return 0;
  }

  const wave = prior + 1;
  const count = respawnFloor(state, floorId, arrivalPos, wave, cfg);
  if (count <= 0) return 0;

  slice.respawns[floorId] = wave;
  const depth = floorNode(state, floorId).depth;
  if (!slice.stirAnnounced) {
    slice.stirAnnounced = true;
    emit({ type: 'dungeonStirred', floor: floorId, depth });
  }
  emit({ type: 'floorRespawned', floor: floorId, depth, count, wave });
  return count;
}
