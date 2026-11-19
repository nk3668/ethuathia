/**
 * Snapshots: the read-only view of a run that the UI draws from (docs/ARCHITECTURE.md §3.5).
 *
 * A snapshot holds only what the party knows: the terrain and features they remember, which
 * tiles are in view right now, and the actors standing on those tiles. Everything in it is a
 * fresh copy, so it shares no object with the `RunState` it came from and later steps never
 * change it. It is plain data, so a worker host can post it as it is.
 */
import { clonePlain } from '../core';
import type { Pos } from '../core';
import { getFloor } from './entities';
import { explored, getMemory, partyVisible } from './perception';
import type { Explored } from './perception';
import type { Intent } from './ai/types';
import type { DomainSnapshots } from './domain';
import { domainSnapshots } from './domains';
import type { EntityId, Faction, FeaturePart, FloorId, RunState } from './state';
import { statValue } from './stats/getStat';
import { actorName } from './combat/death';

/**
 * What a snapshot should show. With neither field set, the floor of the first living party
 * member, or of the first party member if none is alive.
 */
export interface ViewOptions {
  /** The floor to show. The floor must have been built. Wins over `follow`. */
  floor?: FloorId;
  /**
   * Show the floor this entity is on. The UI passes the selected adventurer, so the map follows
   * them up and down the stairs. Ignored if there is no such entity.
   */
  follow?: EntityId;
}

/** A feature as the party remembers it. On tiles in view this is also how it is now. */
export interface FeatureView {
  pos: Pos;
  /** Content id, e.g. `feature.door`. */
  def: string;
  feature: FeaturePart;
}

/** An actor the party can see right now. */
export interface ActorView {
  id: EntityId;
  /** Content id, e.g. `actor.adventurer`. */
  def: string;
  pos: Pos;
  faction: Faction;
  /** An adventurer's name, or a monster's kind (its def's name). */
  name: string;
  hp: number;
  maxHp: number;
}

/** The shown floor, fog applied. */
export interface FloorView {
  id: FloorId;
  depth: number;
  width: number;
  height: number;
  /**
   * One byte per tile, row by row (`y * width + x`): 0 for a tile the party has never seen,
   * otherwise 1 + the `Terrain` code they last saw there (look it up in `TERRAIN_IDS`).
   */
  terrain: Uint8Array;
  /** One byte per tile: 1 if a living party member on this floor can see it now, else 0. */
  visible: Uint8Array;
  /** Remembered features, in tile order. Tiles out of view may have changed since. */
  features: FeatureView[];
  /** Actors on tiles in view, in id order. Monsters out of view are not listed. */
  actors: ActorView[];
  /** How much of the floor's floor tiles the party has seen (see `explored`). */
  explored: Explored;
}

/** A party member's card. */
export interface PartyMemberView {
  id: EntityId;
  name: string;
  classId: string;
  raceId: string;
  floor: FloorId;
  pos: Pos;
  alive: boolean;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  /** The rule behind its current goal, shown as its intent; `null` before its first decision. */
  intent: Intent | null;
  /** True while the player possesses it (ETH-066). */
  possessed: boolean;
  /** True when it is possessed and its turn is waiting for the player's command. */
  awaitingInput: boolean;
}

export interface Snapshot {
  /** The game turn (`RunState.turn`) it was taken on. */
  turn: number;
  /** The run's seed, for display and bug reports. */
  seed: number;
  floor: FloorView;
  /** The party, in party order, including members who have died but are still in the state. */
  party: PartyMemberView[];
  /**
   * Each domain's slice, keyed by domain (`snapshot.domains.combat`), from its snapshot builder.
   * Per-member data goes in a domain's slice keyed by entity id, not in `PartyMemberView`.
   */
  domains: DomainSnapshots;
}

/**
 * The UI's view of `state` from the party's point of view. Changes nothing, and nothing in the
 * result is shared with `state`.
 */
export function snapshot(state: RunState, view: ViewOptions = {}): Snapshot {
  const followed = view.follow === undefined ? undefined : state.entities[view.follow]?.floor;
  const floor = view.floor ?? followed ?? shownFloor(state);
  return {
    turn: state.turn,
    seed: state.seed,
    floor: floorView(state, floor),
    party: state.party.flatMap((id) => memberView(state, id)),
    domains: domainSnapshots({ state, floor }),
  };
}

/** The floor of the first living party member, or of the first member, or the entry floor. */
function shownFloor(state: RunState): FloorId {
  const members = state.party.map((id) => state.entities[id]).filter((e) => e !== undefined);
  const living = members.find((e) => e.actor !== undefined && e.actor.hp > 0);
  return (living ?? members[0])?.floor ?? state.dungeon.entry;
}

function floorView(state: RunState, floorId: FloorId): FloorView {
  const floor = getFloor(state, floorId);
  const memory = getMemory(state, floorId);
  const { width, height } = floor.terrain;
  const visible = partyVisible(state, floorId).cells as Uint8Array;

  const features: FeatureView[] = Object.keys(memory.features)
    .map(Number)
    .sort((a, b) => a - b)
    .map((i) => {
      const remembered = memory.features[i];
      if (remembered === undefined) throw new Error(`Missing remembered feature ${i}`);
      return { pos: { x: i % width, y: Math.floor(i / width) }, def: remembered.def, feature: clonePlain(remembered.feature) };
    });

  const actors: ActorView[] = [];
  for (const id of [...floor.entities].sort((a, b) => a - b)) {
    const e = state.entities[id];
    if (e?.actor === undefined || visible[e.pos.y * width + e.pos.x] !== 1) continue;
    actors.push({
      id: e.id,
      def: e.def,
      pos: { x: e.pos.x, y: e.pos.y },
      faction: e.actor.faction,
      name: actorName(e),
      hp: e.actor.hp,
      maxHp: statValue(state, e, 'hp'),
    });
  }

  return {
    id: floor.id,
    depth: floor.depth,
    width,
    height,
    terrain: (memory.terrain.cells as Uint8Array).slice(),
    visible,
    features,
    actors,
    explored: explored(state, floorId),
  };
}

/** A party member's card, or none if its entity is gone or is not an adventurer. */
function memberView(state: RunState, id: EntityId): PartyMemberView[] {
  const e = state.entities[id];
  if (e?.actor === undefined || e.adventurer === undefined) return [];
  const { actor, adventurer } = e;
  const intent = e.ai?.memory.intent;
  const view: PartyMemberView = {
    id,
    name: adventurer.name,
    classId: adventurer.classId,
    raceId: adventurer.raceId,
    floor: e.floor,
    pos: { x: e.pos.x, y: e.pos.y },
    alive: actor.hp > 0,
    hp: actor.hp,
    maxHp: statValue(state, e, 'hp'),
    mp: actor.mp,
    maxMp: statValue(state, e, 'mp'),
    intent: intent ? clonePlain(intent) : null,
    possessed: e.ai?.possessed === true,
    awaitingInput: e.ai?.possessed === true && actor.hp > 0 && actor.queued === undefined,
  };
  return [view];
}
