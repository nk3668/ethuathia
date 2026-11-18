/**
 * Death (ETH-060). A monster at 0 HP dies: it leaves the schedule and its floor (a corpse is not
 * an item), with a `died` event. A party member at 0 HP falls instead: the entity stays in the
 * run at 0 HP, out of the schedule and taking up no tile, and the run domain (ETH-062) notices
 * it after the action (`fell`, its log line) and ends the run as a wipe once nobody is left.
 * Either way a blow that kills emits `killed` with the killer and the victim.
 */
import { MONSTERS, STATUSES } from '../../content';
import { getFloor, removeEntity } from '../entities';
import type { Emit } from '../events';
import type { ActorEntity, Entity, FloorId, RunState } from '../state';

/** The cause of a death nobody struck: what was left at 0 HP by a status, a trap, a trigger. */
export const UNKNOWN_CAUSE = 'combat.unknown';

/** What killed an actor: the cause's content id and the killer, if anyone. */
export interface DeathCause {
  cause: string;
  killer: Entity | null;
}

/**
 * True when every party member has fallen: the moment the run domain ends the run as a wipe
 * (`settleRun`), so it agrees with `state.domains.run.end.outcome === 'wipe'` after the step.
 */
export function isPartyWiped(state: RunState): boolean {
  return state.party.length > 0 && state.party.every((id) => (state.entities[id]?.actor?.hp ?? 0) <= 0);
}

/** The display name of an actor for events: an adventurer's name or its def's name. */
export function actorName(entity: Entity): string {
  if (entity.adventurer !== undefined) return entity.adventurer.name;
  return MONSTERS.has(entity.def) ? MONSTERS.get(entity.def).name : entity.def;
}

/**
 * Settles the death of `victim`, which is at 0 HP: emits `killed` when someone struck the blow;
 * a monster also gets `died` and leaves the run. A party member stays, fallen, for the run
 * domain to report.
 */
export function killActor(state: RunState, victim: ActorEntity, emit: Emit, { cause, killer }: DeathCause): void {
  const floor = victim.floor;
  const pos = { x: victim.pos.x, y: victim.pos.y };
  const inParty = state.party.includes(victim.id);
  delete victim.actor.queued;
  if (killer !== null) {
    emit({
      type: 'killed',
      killer: killer.id,
      killerDef: killer.def,
      byParty: state.party.includes(killer.id),
      victim: victim.id,
      victimDef: victim.def,
      threat: MONSTERS.has(victim.def) ? MONSTERS.get(victim.def).threat : 0,
      floor,
      pos: { ...pos },
    });
  }
  if (inParty) return;
  emit({ type: 'died', actor: victim.id, def: victim.def, name: actorName(victim), cause, killer: killer?.id ?? null, floor, pos });
  removeEntity(state, victim.id);
}

/** What to blame for a death nobody struck: the actor's latest harmful status, if any. */
export function blame(entity: Entity): string {
  const statuses = entity.stats?.statuses ?? [];
  for (let i = statuses.length - 1; i >= 0; i--) {
    const id = (statuses[i] as { status: string }).status;
    if (STATUSES.has(id) && STATUSES.get(id).harmful) return id;
  }
  return UNKNOWN_CAUSE;
}

/**
 * Settles every monster on `floorId` left at 0 HP by something other than a blow (a status's
 * damage, a trigger), blaming its latest harmful status. Fallen party members are the run
 * domain's to report. The combat turn hooks and the attack action call it.
 */
export function reapDead(state: RunState, floorId: FloorId, emit: Emit): void {
  if (state.floors[floorId] === undefined) return;
  const dead = getFloor(state, floorId)
    .entities.map((id) => state.entities[id])
    .filter((e): e is ActorEntity => e?.actor !== undefined && e.actor.hp <= 0 && !state.party.includes(e.id));
  for (const e of dead) killActor(state, e, emit, { cause: blame(e), killer: null });
}
