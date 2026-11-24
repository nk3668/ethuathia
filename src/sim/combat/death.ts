/**
 * Death (ETH-060). A monster at 0 HP dies: it leaves the schedule and its floor (a corpse is not
 * an item), with a `died` event. A party member at 0 HP falls instead: the entity stays in the
 * run at 0 HP, out of the schedule and taking up no tile, and the run domain (ETH-062) notices
 * it after the action (`fell`, its log line) and ends the run as a wipe once nobody is left.
 * Either way a blow that kills emits `killed` with the killer and the victim.
 */
import { clonePlain } from '../../core';
import { findDef, MONSTERS, STATUSES } from '../../content';
import { getFloor, removeEntity } from '../entities';
import { isInstanceTypeKnown, secretGear } from '../items/identify';
import { placeItem } from '../items/inventory';
import { nameField } from '../items/name';
import type { Emit, SimEvent } from '../events';
import type { ActorEntity, Entity, EntityId, FloorId, RunState } from '../state';
import { grantKillXp } from '../stats/leveling';
import { monsterName, monsterThreat, namesOf, overlayOf, shownName, templatesField } from './overlay';
import { rolePowers } from './roles';

/** The cause of a death nobody struck: what was left at 0 HP by a status, a trap, a trigger. */
export const UNKNOWN_CAUSE = 'combat.unknown';

/** What killed an actor: the cause's content id and the killer, if anyone. */
export interface DeathCause {
  cause: string;
  killer: Entity | null;
  /** The blow was a bolt from a distance (ETH-040). */
  ranged?: boolean;
}

/**
 * What a killer is (ETH-075): a monster or an adventurer that struck the blow, a status that
 * wore the victim down, a trap (M4), or another effect source (an item's or bundle's damage).
 */
export type KillerKind = 'monster' | 'adventurer' | 'status' | 'trap' | 'other';

/** Who or what struck a creature down, as named in the `fell` event, the log and the run summary. */
export interface Killer {
  kind: KillerKind;
  /** The striker's entity id; `null` for a status, trap or other source. */
  id: EntityId | null;
  /** The content id: the striker's def, or the status, trap or bundle id. */
  def: string;
  /**
   * Its display name as content writes it: "Slate hound", "Poisoned", or an adventurer's name; a
   * templated monster's with its prefixes ("Venomous slate hound"), a named one's own (ETH-117).
   */
  name: string;
  /** `name` is a proper name ("Vell the Unbowed"): text uses no article and keeps its capitals. */
  proper?: true;
  /** The blow was a bolt; `bolt` is the bolt's name ("gob of bog-slime"), if the def has one. */
  ranged?: boolean;
  bolt?: string;
  /** For a status: who inflicted it, when known (`ActiveStatus.by`). */
  source?: { id: EntityId; def: string; name: string; kind: 'monster' | 'adventurer'; proper?: true };
}

/**
 * True when every party member has fallen: the moment the run domain ends the run as a wipe
 * (`settleRun`), so it agrees with `state.domains.run.end.outcome === 'wipe'` after the step.
 */
export function isPartyWiped(state: RunState): boolean {
  return state.party.length > 0 && state.party.every((id) => (state.entities[id]?.actor?.hp ?? 0) <= 0);
}

/**
 * The display name of an actor for events: an adventurer's name, or a monster's (`monsterName`:
 * its def's name with its templates' prefixes, or its own name, ETH-117).
 */
export function actorName(entity: Entity): string {
  return monsterName(entity);
}

/** An item a dying monster dropped (`died.drops`): its def, how many, and its name when that differs from the def's. */
export interface DroppedLoot {
  item: string;
  qty: number;
  name?: string;
  identified?: false;
}

/**
 * Settles the death of `victim`, which is at 0 HP: emits `killed` when someone struck the blow;
 * a monster also gets `died` and leaves the run, dropping what its overlay `carries` (ETH-117)
 * where it fell. A party member stays, fallen, for the run domain to report.
 */
export function killActor(state: RunState, victim: ActorEntity, emit: Emit, { cause, killer, ranged }: DeathCause): void {
  const floor = victim.floor;
  const pos = { x: victim.pos.x, y: victim.pos.y };
  const inParty = state.party.includes(victim.id);
  delete victim.actor.queued;
  if (killer !== null) {
    const threat = monsterThreat(victim);
    emit({
      type: 'killed',
      killer: killer.id,
      killerDef: killer.def,
      byParty: state.party.includes(killer.id),
      victim: victim.id,
      victimDef: victim.def,
      threat,
      floor,
      pos: { ...pos },
      ...(ranged === true ? { ranged: true } : {}),
      ...namesOf(killer, victim),
    });
    // Kill XP (ETH-034, ETH-110): shared by the party members in the fight, if a member struck it.
    grantKillXp(state, killer, victim, threat, emit);
  }
  if (inParty) return;
  const shown = shownName(victim);
  const viewer = state.party[0] === undefined ? undefined : state.entities[state.party[0]];
  // Gear a monster carries starts unidentified like loot, so what it dropped says nothing (ETH-142).
  const carried = (overlayOf(victim)?.carries ?? []).map(secretGear);
  const drops: DroppedLoot[] = carried.map((item) => ({
    item: item.def,
    qty: item.qty,
    ...nameField(state, item, viewer),
    ...(isInstanceTypeKnown(state, item) ? {} : { identified: false as const }),
  }));
  emit({
    type: 'died',
    actor: victim.id,
    def: victim.def,
    name: actorName(victim),
    cause,
    killer: killer?.id ?? null,
    floor,
    pos,
    ...(shown?.proper === true ? { proper: true as const } : {}),
    ...templatesField(victim),
    ...(drops.length === 0 ? {} : { drops }),
  });
  removeEntity(state, victim.id);
  for (const item of carried) placeItem(state, floor, pos, clonePlain(item));
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

/**
 * The kind and display name of an actor that strikes or inflicts something: a monster's with its
 * overlay (ETH-117) while it is still in the run, else its def's.
 */
function striker(state: RunState, id: EntityId, def: string): { kind: 'monster' | 'adventurer'; name: string; proper?: true } {
  const entity = state.entities[id];
  if (entity?.adventurer !== undefined) return { kind: 'adventurer', name: entity.adventurer.name };
  if (entity !== undefined && entity.def === def) {
    const shown = shownName(entity);
    if (shown !== undefined) return { kind: 'monster', ...shown };
  }
  return { kind: 'monster', name: MONSTERS.has(def) ? MONSTERS.get(def).name : def };
}

/**
 * What killed `victim` (at 0 HP), from the events since `events[from]` (the commands or the
 * action in which it fell): the blow that killed it (`killed`), else the last effect that hurt it
 * (`damaged`; for a status, naming who inflicted it when the victim still carries it). `null`
 * when neither is there (HP set to 0 by something that says nothing). The run domain calls it
 * for `fell` (ETH-075).
 */
export function killerOf(state: RunState, victim: Entity, events: readonly SimEvent[], from: number): Killer | null {
  for (let i = events.length - 1; i >= from; i--) {
    const e = events[i] as SimEvent;
    if (e.type === 'killed' && e.victim === victim.id) {
      const who = striker(state, e.killer, e.killerDef);
      const entity = state.entities[e.killer];
      const powers = entity !== undefined && entity.def === e.killerDef ? rolePowers(entity) : MONSTERS.has(e.killerDef) ? MONSTERS.get(e.killerDef) : {};
      const bolt = e.ranged === true ? powers.bolt?.name : undefined;
      return {
        kind: who.kind,
        id: e.killer,
        def: e.killerDef,
        name: who.name,
        ...(who.proper === true ? { proper: true as const } : {}),
        ...(e.ranged === true ? { ranged: true } : {}),
        ...(bolt === undefined ? {} : { bolt }),
      };
    }
    if (e.type === 'damaged' && e.actor === victim.id) return sourceKiller(state, victim, e.source);
  }
  return null;
}

/** A killer from an effect's source id: a status (with its inflicter, if known) or another def. */
function sourceKiller(state: RunState, victim: Entity, source: string): Killer {
  if (STATUSES.has(source)) {
    const by = (victim.stats?.statuses ?? []).filter((s) => s.status === source && s.by !== undefined).at(-1)?.by;
    const killer: Killer = { kind: 'status', id: null, def: source, name: STATUSES.get(source).name };
    if (by !== undefined) killer.source = { id: by.id, def: by.def, ...striker(state, by.id, by.def) };
    return killer;
  }
  return { kind: 'other', id: null, def: source, name: findDef(source)?.name ?? source };
}

/**
 * A monster's name with its article ("a slate hound", "an ashmite swarm"); an adventurer's or a
 * proper name ("Vell the Unbowed") as it is.
 */
function named(kind: 'monster' | 'adventurer', name: string, proper = false): string {
  if (kind === 'adventurer' || proper) return name;
  const lower = name.toLowerCase();
  return `${/^[aeiou]/.test(lower) ? 'an' : 'a'} ${lower}`;
}

/**
 * How someone died, as a predicate (ETH-075): "was slain by a slate hound", "was slain by a mire
 * toad’s gob of bog-slime", "died poisoned by a mire toad", or "fell" when nothing is known.
 * `present` is the log's tense ("is slain by…", "falls"). The floor goes after it.
 */
export function deathPredicate(killer: Killer | null, tense: 'past' | 'present' = 'past'): string {
  const past = tense === 'past';
  if (killer === null) return past ? 'fell' : 'falls';
  switch (killer.kind) {
    case 'monster':
    case 'adventurer': {
      const who = named(killer.kind, killer.name, killer.proper === true);
      return `${past ? 'was' : 'is'} slain by ${killer.ranged === true ? `${who}’s ${killer.bolt ?? 'bolt'}` : who}`;
    }
    case 'status': {
      const by = killer.source === undefined ? '' : ` by ${named(killer.source.kind, killer.source.name, killer.source.proper === true)}`;
      return `${past ? 'died' : 'dies'} ${killer.name.toLowerCase()}${by}`;
    }
    case 'trap':
      return `${past ? 'was' : 'is'} killed by ${named('monster', killer.name)}`;
    case 'other':
      return `${past ? 'was' : 'is'} killed by ${killer.name.toLowerCase()}`;
  }
}
