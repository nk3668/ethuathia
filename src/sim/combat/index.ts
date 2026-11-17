/**
 * The combat domain: monsters, melee and ranged attacks, damage and death.
 * Built by ETH-060 (monsters, melee combat and death) and ETH-040 (monster roles).
 *
 * Everything this domain adds lives in this folder (docs/ARCHITECTURE.md, Contracts): declare
 * its events, action requests, commands, state slice, snapshot slice, entity parts and config
 * fields below (or in files this index re-exports), and list its rule conditions, rule actions,
 * generation steps and run trackers in `COMBAT_DOMAIN`. The root files only compose what is exported
 * here. Never import `domains.ts` or `index.ts` from this folder.
 */
import type { ActionRecord } from '../actions';
import type { CommandRecord } from '../commands';
import type { SimDomain, SnapshotCtx } from '../domain';
import type { RunConfig } from '../state';

/** The events this domain emits (bodies, without `turn`). Each needs a formatter in `ui/shell/logText/combat.ts`. */
export type CombatEvent = never;

/** The action requests this domain defines. Each needs an entry in `COMBAT_ACTIONS`. */
export type CombatRequest = never;

/** The commands this domain accepts. Each needs an entry in `COMBAT_COMMANDS`. */
export type CombatCommand = never;

/** This domain's slice of the run state, at `state.domains.combat`. Plain data. */
export interface CombatState {}

/** This domain's slice of the snapshot, at `snapshot.domains.combat`. Plain data. */
export interface CombatSnapshot {}

/** Optional parts this domain adds to `Entity`, e.g. `inventory?: InventoryPart`. */
export interface CombatParts {}

/** Fields this domain adds to `RunConfig`. Make them optional, so older configs stay valid. */
export interface CombatConfig {}

/** This domain's row in `DomainTypes` (`src/sim/domain.ts`). */
export interface CombatTypes {
  event: CombatEvent;
  request: CombatRequest;
  command: CombatCommand;
  state: CombatState;
  snapshot: CombatSnapshot;
}

export const COMBAT_ACTIONS: ActionRecord<CombatRequest> = {};

export const COMBAT_COMMANDS: CommandRecord<CombatCommand> = {};

/** The state slice for a new run. */
export function initCombat(_config: RunConfig): CombatState {
  return {};
}

/** The snapshot slice. Shares nothing with the state. */
export function combatSnapshot(_ctx: SnapshotCtx): CombatSnapshot {
  return {};
}

/** What this domain registers with the shared code, in this order. */
export const COMBAT_DOMAIN: SimDomain<CombatTypes> = {
  actions: COMBAT_ACTIONS,
  commands: COMBAT_COMMANDS,
  init: initCombat,
  snapshot: combatSnapshot,
};
