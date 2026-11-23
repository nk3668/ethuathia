/**
 * Return-trip floor repopulation (ETH-025) & deep surge (ETH-136):
 * - When the party ascends onto an already-visited floor after completing its contracts (and not
 *   under `FLAG_CONSTANT_RESPAWN` / `respawn.continuous`), `surgeFloor` repopulates the floor
 *   with an escalated surge wave anchored near `bottomDanger` (unless `respawn.depthShift` is
 *   explicitly overridden), elevated template rates, route-biased cohesive squads, and hunter
 *   patrols while strictly honoring `stairsDistance` and stairs safety.
 * - Voluntary Retreat before contract completion remains un-surged.
 * - `FLAG_CONSTANT_RESPAWN` (ETH-129) or `RespawnConfig.continuous` repopulates on any revisit
 *   after a cooldown using local `floorDanger + depthShift` via `respawnFloor`.
 * - `"The dungeon stirs."` (`dungeonStirred`) is announced once per run on the first repopulated
 *   floor, while every repopulated floor emits quiet `floorRespawned` (`surged: true` on surges).
 */
import type { Pos } from '../../core';
import { surgeFloor } from '../combat/encounters';
import { respawnFloor } from '../combat/monsters';
import type { RespawnOptions } from '../combat/monsters';
import type { Emit } from '../events';
import { contractsComplete } from '../quests/contracts';
import type { FloorId, RunState } from '../state';
import { runFlag } from '../stats/runModifiers';
import { floorNode } from './dungeon';
import type { StairsDir } from './dungeon';

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
 * the wave (deep surge on post-contract ascent, or local respawn under constant-respawn rules)
 * and emits `dungeonStirred` (once per run) and `floorRespawned`.
 */
export function maybeRespawnFloor(
  state: RunState,
  floorId: FloorId,
  arrivalPos: Pos,
  wasEmpty: boolean,
  firstVisit: boolean,
  emit: Emit,
  dir: StairsDir = 'up',
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
    if (dir !== 'up' || !contractsComplete(state) || prior > 0) return 0;
  }

  const wave = prior + 1;
  const surged = !continuous && contractsComplete(state);
  const count = surged
    ? surgeFloor(state, floorId, arrivalPos, wave, cfg)
    : respawnFloor(state, floorId, arrivalPos, wave, cfg);
  if (count <= 0) return 0;

  slice.respawns[floorId] = wave;
  const depth = floorNode(state, floorId).depth;
  const surgeTag = surged ? { surged: true as const } : {};
  if (!slice.stirAnnounced) {
    slice.stirAnnounced = true;
    emit({ type: 'dungeonStirred', floor: floorId, depth, ...surgeTag });
  }
  emit({ type: 'floorRespawned', floor: floorId, depth, count, wave, ...surgeTag });
  return count;
}
