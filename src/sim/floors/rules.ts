/**
 * The floors domain's rule conditions and rule actions (docs/ARCHITECTURE.md §4): leaving a
 * finished floor by the stairs down, gathering the party there first, the per-floor turn cap and
 * the bottom of the dungeon. The baseline rules (`BASELINE_RULES` in `ai/engine.ts`) use them,
 * and the Library can hand each one to the player's own rules.
 */
import type { Pos } from '../../core';
import { aiPathGrid, followMap, nameOf } from '../ai/navigate';
import { STICK_TOGETHER_CLOSE, STICK_TOGETHER_LEASH } from '../../content';
import { partyCohesionOf, stanceParamOf } from '../ai/stanceParams';
import { defineCondition, defineRuleAction, noParams } from '../ai/types';
import { RULE_ACTIONS } from '../registries';
import { blockFleeZone } from '../combat/zone';
import type { AiCtx, ConditionDef, ParamParser, Resolved, RuleActionDef } from '../ai/types';
import { actorsAt } from '../entities';
import { buildGoalMap, UNREACHABLE } from '../goalMap';
import { getMemory } from '../perception';
import type { ActorEntity, FloorId, RunState } from '../state';
import { dungeonDepth, floorNode, isBottomFloor, stairsTarget } from './dungeon';
import type { StairsDir } from './dungeon';

/**
 * How close (in tiles, diagonals counting as one) a party member must be to the stairs, or to
 * another member who is gathered, to count as gathered there. Chaining through members lets a
 * queue in a corridor count as gathered.
 */
export const GATHER_RADIUS = 2;

/**
 * The default cohesion (ETH-145): an adventurer more than this many tiles (diagonals count as
 * one) from the party's lead on the same floor stops what it is doing and walks back to it, and
 * keeps going until it is within `PARTY_CLOSE`. A party that spreads out meets monsters one at a
 * time and dies one at a time. Since ETH-151 the numbers in force come from the picked formation
 * and stance (`partyCohesionOf`); these are the default formation's (Stick together).
 */
export const PARTY_LEASH = STICK_TOGETHER_LEASH;
export const PARTY_CLOSE = STICK_TOGETHER_CLOSE;

/**
 * Game turns the party may spend on one floor, counted from its first arrival, before the
 * baseline heads for the stairs down without exploring further or waiting for stragglers. A
 * safety net: a lone adventurer explores a floor in about 200–300 turns.
 */
export const FLOOR_TURN_CAP = 1000;

/** The per-floor turn cap for this run: `RunConfig.floorTurnCap`, else `FLOOR_TURN_CAP`. */
export function floorTurnCap(state: RunState): number {
  return state.config.floorTurnCap ?? FLOOR_TURN_CAP;
}

/** Game turns since the party first arrived on `floorId` (0 if it hasn't). */
export function turnsOnFloor(state: RunState, floorId: FloorId): number {
  const arrived = state.domains.floors.arrived[floorId];
  return arrived === undefined ? 0 : state.turn - arrived;
}

/**
 * Where the party remembers stairs going `dir` on `floorId`, or `null` if nobody has seen any.
 * The lowest tile index wins if there are several.
 */
export function knownStairs(state: RunState, floorId: FloorId, dir: StairsDir): Pos | null {
  const memory = getMemory(state, floorId);
  const { width } = memory.terrain;
  let best: number | null = null;
  for (const key of Object.keys(memory.features)) {
    const i = Number(key);
    const f = memory.features[i]?.feature;
    if (f?.kind === 'stairs' && f.dir === dir && (best === null || i < best)) best = i;
  }
  return best === null ? null : { x: best % width, y: Math.floor(best / width) };
}

/** The living party members on `floorId`, in party order. */
export function partyOnFloor(state: RunState, floorId: FloorId): ActorEntity[] {
  return state.party.flatMap((id) => {
    const e = state.entities[id];
    return e?.actor !== undefined && e.actor.hp > 0 && e.floor === floorId ? [e as ActorEntity] : [];
  });
}

/**
 * The party's lead on `floorId`: its first living member in party order. Followers regroup on
 * the lead, and the lead regroups on no one, so two members can never chase each other.
 */
export function partyLead(state: RunState, floorId: FloorId): ActorEntity | null {
  return partyOnFloor(state, floorId)[0] ?? null;
}

/** Who is gathered at a place, and who isn't yet. */
export interface Gathering {
  gathered: ActorEntity[];
  missing: ActorEntity[];
}

const near = (a: Pos, b: Pos) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) <= GATHER_RADIUS;

/**
 * Which living party members on `floorId` are gathered at `pos`: those within `GATHER_RADIUS`
 * of it, and then anyone within `GATHER_RADIUS` of someone gathered, so a line of members
 * waiting in a corridor counts. Members on other floors are not considered: whoever is ahead
 * waits below, and whoever is behind follows on their own.
 */
export function gatheringAt(state: RunState, floorId: FloorId, pos: Pos): Gathering {
  const missing = partyOnFloor(state, floorId);
  const gathered: ActorEntity[] = [];
  let grew = true;
  while (grew) {
    grew = false;
    for (let i = 0; i < missing.length; i++) {
      const m = missing[i] as ActorEntity;
      if (near(m.pos, pos) || gathered.some((g) => near(m.pos, g.pos))) {
        gathered.push(m);
        missing.splice(i, 1);
        i--;
        grew = true;
      }
    }
  }
  return { gathered, missing };
}

/**
 * Who is gathered at the stairs at `pos` on `floorId` before taking them `dir`. Like
 * `gatheringAt`, except that at the way out of the dungeon (the first floor's up stairs) the
 * whole party leaves together, so living members on other floors count as missing too.
 */
export function stairsGathering(state: RunState, floorId: FloorId, pos: Pos, dir: StairsDir): Gathering {
  const gathering = gatheringAt(state, floorId, pos);
  if (dir === 'up' && stairsTarget(state, floorId, 'up') === null) {
    for (const id of state.party) {
      const e = state.entities[id];
      if (e?.actor !== undefined && e.actor.hp > 0 && e.floor !== floorId) gathering.missing.push(e as ActorEntity);
    }
  }
  return gathering;
}

/**
 * True if a living party member stands at `pos` on `floorId`. Gathered members wait for the
 * stairs only while a party member holds them: that member takes them once everyone is there.
 * Anyone else on the stairs (a monster that never moves, ETH-113) won't, so the party walks up
 * to it, and fights it if it is hostile, rather than waiting for it forever.
 */
export function partyMemberAt(state: RunState, floorId: FloorId, pos: Pos): boolean {
  return actorsAt(state, floorId, pos).some((e) => state.party.includes(e.id));
}

/** "Mira", "Mira and Oren", "Brannoc, Mira and Oren". */
export function names(actors: readonly ActorEntity[]): string {
  const list = actors.map(nameOf);
  return list.length <= 1 ? (list[0] ?? '') : `${list.slice(0, -1).join(', ')} and ${list.at(-1) as string}`;
}

/** True once the party has turned back for the surface (the run domain's `leaving`, ETH-062). */
export function headingOut(state: RunState): boolean {
  return state.domains.run.leaving !== null;
}

// ---------------------------------------------------------------------------------------------
// Conditions

/** True once the party has spent the per-floor turn cap on this floor. */
export const COND_FLOOR_OVERSTAYED = defineCondition({
  id: 'cond.floor_overstayed',
  name: 'Overstayed the floor',
  description:
    'True once the party has spent too long on this floor, counted from when the first of them arrived. ' +
    'A safety net so a party never lingers on one floor forever.',
  parse: noParams,
  evaluate({ state, actor }) {
    const turns = turnsOnFloor(state, actor.floor);
    const cap = Math.round((floorTurnCap(state) * stanceParamOf(actor, 'floorCapPercent', 100)) / 100);
    return turns >= cap ? { ok: true, detail: `${turns} turns on this floor, the limit is ${cap}` } : { ok: false, detail: '' };
  },
  describe: () => 'overstayed the floor',
});

/**
 * True while a living party member stands on the bottom floor of the dungeon, which has no stairs
 * down. The baseline turns back there. A run-scope condition (ETH-121): it reads the party, not
 * the deciding actor, so a run requirement gives the same answer a rule does.
 */
export const COND_BOTTOM_FLOOR = defineCondition({
  id: 'cond.bottom_floor',
  name: 'On the bottom floor',
  scope: 'run',
  description:
    'True while anyone in the party stands on the deepest floor of the dungeon, where there are no stairs further down.',
  parse: noParams,
  evaluate({ state }) {
    for (const id of state.party) {
      const e = state.entities[id];
      if (e?.actor === undefined || e.actor.hp <= 0 || !isBottomFloor(state, e.floor)) continue;
      const depth = floorNode(state, e.floor).depth;
      return { ok: true, detail: `on the bottom floor, floor ${depth} of ${dungeonDepth(state)}` };
    }
    return { ok: false, detail: '' };
  },
  describe: () => 'on the bottom floor',
});

/** `cond.at_depth`'s params: the floor to be on or below (1 is the first floor). */
export interface AtDepthParams {
  depth: number;
}

const parseAtDepth: ParamParser<AtDepthParams> = (raw) => {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return 'Params must be an object with "depth"';
  const { depth, ...rest } = raw as Record<string, unknown>;
  if (Object.keys(rest).length > 0) return `Unknown parameter "${Object.keys(rest)[0] as string}"`;
  if (typeof depth !== 'number' || !Number.isInteger(depth) || depth < 1) return '"depth" must be a whole number of 1 or more';
  return { depth };
};

/**
 * True while a living party member stands on floor `depth` or deeper (ETH-121). Run-scope, so
 * unlocks can ask for it ("reach floor 10 carrying a spellbook").
 */
export const COND_AT_DEPTH = defineCondition({
  id: 'cond.at_depth',
  name: 'At depth',
  scope: 'run',
  description: 'True while anyone in the party stands on the given floor or a deeper one.',
  parse: parseAtDepth,
  evaluate({ state }, { depth }) {
    let deepest = 0;
    for (const id of state.party) {
      const e = state.entities[id];
      if (e?.actor === undefined || e.actor.hp <= 0) continue;
      deepest = Math.max(deepest, floorNode(state, e.floor).depth);
    }
    return deepest >= depth ? { ok: true, detail: `the party is on floor ${deepest}` } : { ok: false, detail: '' };
  },
  describe: ({ depth }) => (depth === 1 ? 'in the dungeon' : `on floor ${depth} or deeper`),
});

// ---------------------------------------------------------------------------------------------
// Rule actions

const ACT_REGROUP_ID = 'act.regroup';

/**
 * True while a follower is farther from the party's lead than its formation's leash (`partyCohesionOf`), or, once it
 * is regrouping, farther than the formation's close distance. The lead itself is never scattered.
 */
export const COND_PARTY_SCATTERED = defineCondition({
  id: 'cond.party_scattered',
  name: 'Far from the party',
  description:
    `True when this adventurer is farther from the party's lead (the first living member on the floor) than the party's ` +
    `formation allows (${PARTY_LEASH} tiles for Stick together, more for Loose and Spread out), and stays true while walking ` +
    `back until it is within the formation's close distance (${PARTY_CLOSE} for Stick together). The lead is never scattered.`,
  parse: noParams,
  evaluate({ state, actor }) {
    const lead = partyLead(state, actor.floor);
    if (lead === null || lead.id === actor.id) return { ok: false, detail: '' };
    const gap = Math.max(Math.abs(lead.pos.x - actor.pos.x), Math.abs(lead.pos.y - actor.pos.y));
    const regrouping = actor.ai?.memory.intent?.action === ACT_REGROUP_ID;
    const { leash, close, formation } = partyCohesionOf(actor);
    return gap > (regrouping ? close : leash)
      ? { ok: true, detail: `${gap} tiles from ${nameOf(lead)} (formation: ${formation.name})` }
      : { ok: false, detail: '' };
  },
  describe: () => 'I am far from the party',
});

/** `act.descend`'s params: whether to wait for the party to gather before taking the stairs. */
export interface DescendParams {
  regroup: boolean;
}

const parseDescend: ParamParser<DescendParams> = (raw) => {
  if (raw === undefined || raw === null) return { regroup: true };
  if (typeof raw !== 'object' || Array.isArray(raw)) return 'Params must be an object';
  const { regroup, ...rest } = raw as Record<string, unknown>;
  if (Object.keys(rest).length > 0) return `Unknown parameter "${Object.keys(rest)[0] as string}"`;
  if (regroup !== undefined && typeof regroup !== 'boolean') return '"regroup" must be true or false';
  return { regroup: regroup ?? true };
};

/**
 * Head for the known stairs down and take them. With `regroup` (the default) the party goes
 * down together: a member at the stairs takes them only once every living member on the floor
 * is gathered there (`gatheringAt`), and a gathered member waits rather than crowd the stairs
 * while someone else is on them; `act.gather` does that waiting.
 */
export const ACT_DESCEND = defineRuleAction({
  id: 'act.descend',
  name: 'Descend',
  description:
    'Walk to the stairs down and take them to the next floor. By default the party goes down together: whoever ' +
    'reaches the stairs first waits there until everyone on the floor has gathered. Can’t be done before the ' +
    'stairs down have been seen, or on the bottom floor.',
  parse: parseDescend,
  resolve(ctx, { regroup }): Resolved | null {
    const { state, actor } = ctx;
    // Once the party has turned back for the surface, nobody heads down again.
    if (headingOut(state)) return null;
    const to = stairsTarget(state, actor.floor, 'down');
    if (to === null) return null;
    const stairs = knownStairs(state, actor.floor, 'down');
    if (stairs === null) return null;
    const depth = floorNode(state, to).depth;
    const onStairs = actor.pos.x === stairs.x && actor.pos.y === stairs.y;

    if (regroup) {
      const { gathered, missing } = gatheringAt(state, actor.floor, stairs);
      if (onStairs) {
        if (missing.length > 0) return null;
        const others = gathered.length > 1 ? 'the party is gathered; ' : '';
        return { request: { id: 'stairs', dir: 'down' }, detail: `${others}taking the stairs down to floor ${depth}` };
      }
      const occupied = partyMemberAt(state, actor.floor, stairs);
      if (occupied && gathered.some((g) => g.id === actor.id)) return null;
    } else if (onStairs) {
      return { request: { id: 'stairs', dir: 'down' }, detail: `taking the stairs down to floor ${depth}` };
    }

    const paths = aiPathGrid(ctx);
    blockFleeZone(ctx, paths);
    const map = buildGoalMap(paths, [stairs]);
    const cost = map.get(actor.pos.x, actor.pos.y);
    if (cost === UNREACHABLE) return null;
    return followMap(ctx, paths, map, `heading for the stairs down, ${cost} ${cost === 1 ? 'turn' : 'turns'} away`);
  },
  describe: ({ regroup }) => (regroup ? 'go down the stairs with the party' : 'go down the stairs, not waiting for anyone'),
});

/** Walk back to the party's lead, opening doors and squeezing past allies on the way. */
export const ACT_REGROUP = defineRuleAction({
  id: ACT_REGROUP_ID,
  name: 'Regroup',
  description:
    'Walk back to the party’s lead (the first living member on the floor) and keep going until within a few tiles, ' +
    'so the party fights together instead of one at a time. The baseline does this whenever an adventurer has ' +
    `strayed farther from the lead than the party's formation allows (${PARTY_LEASH} tiles for Stick together).`,
  parse: noParams,
  resolve(ctx): Resolved | null {
    const { state, actor } = ctx;
    const lead = partyLead(state, actor.floor);
    if (lead === null || lead.id === actor.id) return null;
    // Only while there is ground to explore: once the floor is done everyone converges on the
    // stairs anyway, and chasing a lead who is walking there would only get in its way.
    if (RULE_ACTIONS.get('act.explore').resolve(ctx, undefined) === null) return null;
    const paths = aiPathGrid(ctx);
    const map = buildGoalMap(paths, [lead.pos]);
    const cost = map.get(actor.pos.x, actor.pos.y);
    if (cost === UNREACHABLE) return null;
    const gap = Math.max(Math.abs(lead.pos.x - actor.pos.x), Math.abs(lead.pos.y - actor.pos.y));
    return followMap(ctx, paths, map, `regrouping with ${nameOf(lead)}, ${gap} tiles away (formation: ${partyCohesionOf(actor).formation.name})`);
  },
  describe: () => 'walk back to the party',
});

/** `act.gather`'s params: which stairs to gather at. */
export interface GatherParams {
  dir: StairsDir;
}

const parseGather: ParamParser<GatherParams> = (raw) => {
  if (raw === undefined || raw === null) return { dir: 'down' };
  if (typeof raw !== 'object' || Array.isArray(raw)) return 'Params must be an object';
  const { dir, ...rest } = raw as Record<string, unknown>;
  if (Object.keys(rest).length > 0) return `Unknown parameter "${Object.keys(rest)[0] as string}"`;
  if (dir !== undefined && dir !== 'up' && dir !== 'down') return '"dir" must be "up" or "down"';
  return { dir: dir ?? 'down' };
};

/**
 * Wait near the stairs while the rest of the party gathers, or while another member is on the
 * stairs: the stairs down by default (descending), or the stairs up (`dir: 'up'`, heading out,
 * where at the way out of the dungeon members on other floors are waited for too). Marked
 * `idle`: standing still is the point, so stuck detection leaves it alone.
 */
export const ACT_GATHER = defineRuleAction({
  id: 'act.gather',
  name: 'Gather at the stairs',
  description:
    'Wait at the stairs until the rest of the party on this floor has caught up, so everyone takes them together. ' +
    'At the way out of the dungeon, wait for the whole party. After a long wait with nobody in the party ' +
    'moving, give up for a while (the log says so).',
  idle: true,
  parse: parseGather,
  resolve({ state, actor }: AiCtx, { dir }): Resolved | null {
    // Going down stops once the party heads out; going up needs a way up, or out.
    if (dir === 'down' ? headingOut(state) || stairsTarget(state, actor.floor, 'down') === null : !headingOut(state)) return null;
    const stairs = knownStairs(state, actor.floor, dir);
    if (stairs === null) return null;
    const { gathered, missing } = stairsGathering(state, actor.floor, stairs, dir);
    if (!gathered.some((g) => g.id === actor.id)) return null;
    const detail = missing.length > 0 ? `waiting at the stairs ${dir} for ${names(missing)}` : `waiting for a turn at the stairs ${dir}`;
    return { request: { id: 'wait' }, detail };
  },
  describe: ({ dir }) => `wait at the stairs ${dir} for the party`,
});

/** The floors domain's conditions, in registration order. */
export const FLOORS_CONDITIONS: readonly ConditionDef[] = [COND_FLOOR_OVERSTAYED, COND_BOTTOM_FLOOR, COND_AT_DEPTH, COND_PARTY_SCATTERED];

/** The floors domain's rule actions, in registration order. */
export const FLOORS_RULE_ACTIONS: readonly RuleActionDef[] = [ACT_DESCEND, ACT_GATHER, ACT_REGROUP];
