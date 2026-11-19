/**
 * Possession (ETH-066, CLAUDE.md §5.4, docs/ARCHITECTURE.md §4): the player takes direct control
 * of one adventurer. A possessed adventurer's turns skip the decision engine: the step holds at
 * its turn until a `playerAction` command queues what it does (`step.ts`), so the run waits for
 * the player, as in any roguelike. `release` hands it back to the AI, which decides its very next
 * turn.
 *
 * Possession is input, first in the decision order (possession > behavior rules > baseline), so
 * a possessed adventurer acts through the same action pipeline as the AI and can do nothing the
 * AI could not.
 */
import type { Pos } from '../../core';
import { ACTIONS } from '../actions';
import type { ActionId, ActionRequest } from '../actions';
import type { CommandRecord } from '../commands';
import { bumpTarget } from '../coreActions';
import type { Emit } from '../events';
import { registerInvariant } from '../invariants';
import type { ActorEntity, Entity, EntityId, RunState } from '../state';
import type { AiPart, RuleRef } from './types';

/** Take direct control of a party member. Anyone else possessed is released first. */
export interface PossessCommand {
  type: 'possess';
  actor: EntityId;
}

/** Hand a possessed party member back to the AI, which decides its next turn. */
export interface ReleaseCommand {
  type: 'release';
  actor: EntityId;
}

export type PossessionCommand = PossessCommand | ReleaseCommand;

/** The `ruleFired` reference of an action the player chose rather than a rule. */
export const PLAYER_RULE: Readonly<RuleRef> = Object.freeze({ set: 'player', index: 0 });

/** True while the player possesses `entity`. */
export function isPossessed(entity: Entity | undefined): boolean {
  return entity?.ai?.possessed === true;
}

/** The possessed party member, if any. */
export function possessedMember(state: RunState): EntityId | null {
  for (const id of state.party) if (isPossessed(state.entities[id])) return id;
  return null;
}

/**
 * True when `actor` is possessed and nothing is queued for it: its turn must wait for the
 * player. The step holds when it reaches such an actor.
 */
export function awaitsPlayer(actor: ActorEntity): boolean {
  return isPossessed(actor) && actor.actor.queued === undefined && actor.actor.hp > 0;
}

/** Forgets what the decision engine tracked, so a change of hands never reads as being stuck. */
function resetMemory(ai: AiPart): void {
  ai.memory.still = 0;
  ai.memory.waited = 0;
  ai.memory.last = null;
  ai.memory.waitingFor = null;
}

/** Reads a party member with an AI part from an untyped command, or says why it can't. */
function partyMember(state: RunState, raw: Readonly<Record<string, unknown>>): (Entity & { ai: AiPart }) | string {
  const id = raw.actor;
  const entity = typeof id === 'number' ? state.entities[id] : undefined;
  if (entity === undefined) return `No entity ${String(id)}`;
  if (!state.party.includes(entity.id) || entity.ai === undefined || entity.adventurer === undefined) {
    return `Entity ${entity.id} is not an adventurer in the party`;
  }
  return entity as Entity & { ai: AiPart };
}

export const POSSESSION_COMMANDS: CommandRecord<PossessionCommand> = {
  possess: {
    type: 'possess',
    apply(state, raw, emit) {
      const member = partyMember(state, raw);
      if (typeof member === 'string') return member;
      if (member.actor === undefined || member.actor.hp <= 0) return `${member.adventurer?.name ?? member.id} is dead`;
      if (member.ai.possessed === true) return null;
      const before = possessedMember(state);
      if (before !== null) release(state, before, emit);
      member.ai.possessed = true;
      resetMemory(member.ai);
      emit({ type: 'possessed', actor: member.id });
      return null;
    },
  },
  release: {
    type: 'release',
    apply(state, raw, emit) {
      const member = partyMember(state, raw);
      if (typeof member === 'string') return member;
      if (member.ai.possessed !== true) return `${member.adventurer?.name ?? member.id} is not possessed`;
      release(state, member.id, emit);
      return null;
    },
  },
};

function release(state: RunState, id: EntityId, emit: Emit): void {
  const ai = state.entities[id]?.ai;
  if (ai === undefined) return;
  delete ai.possessed;
  resetMemory(ai);
  // The player's last command is not a goal the AI should keep showing.
  if (ai.memory.intent?.rule.set === 'player') ai.memory.intent = null;
  emit({ type: 'released', actor: id });
}

// ---------------------------------------------------------------------------------------------
// The trace

const COMPASS: Record<string, string> = {
  '0,-1': 'north',
  '1,-1': 'north-east',
  '1,0': 'east',
  '1,1': 'south-east',
  '0,1': 'south',
  '-1,1': 'south-west',
  '-1,0': 'west',
  '-1,-1': 'north-west',
};

/** "north-east" for `{ x: 1, y: -1 }`. */
export function compassName(dir: Pos): string {
  return COMPASS[`${dir.x},${dir.y}`] ?? 'nowhere';
}

/**
 * What a player's request does, in a few words for the trace: "attack north", "take the stairs
 * down", "pick up". A bump says what it comes to right now. Changes nothing.
 */
export function describePlayerAction(state: RunState, actor: ActorEntity, request: ActionRequest): string {
  if (request.id === 'bump') {
    const target = bumpTarget({ state, actor }, request.dir);
    return typeof target === 'string' ? `head ${compassName(request.dir)}` : describePlayerAction(state, actor, target);
  }
  switch (request.id) {
    case 'move':
      return `step ${compassName(request.dir)}`;
    case 'attack':
      return `attack ${compassName(request.dir)}`;
    case 'openDoor':
      return `open the door ${compassName(request.dir)}`;
    case 'swap':
      return `swap places ${compassName(request.dir)}`;
    case 'stairs':
      return `take the stairs ${request.dir}`;
    default:
      return Object.hasOwn(ACTIONS, request.id) ? ACTIONS[request.id as ActionId].name.toLowerCase() : request.id;
  }
}

/**
 * Records that the player chose `request` for party member `actor`: its intent becomes the
 * command, and a `ruleFired` with the `player` source joins the trace, so the party card and the
 * log say who decided.
 */
export function tracePlayerAction(state: RunState, actor: ActorEntity, request: ActionRequest, emit: Emit): void {
  const detail = `Your command: ${describePlayerAction(state, actor, request)}`;
  if (actor.ai !== undefined) actor.ai.memory.intent = { rule: { ...PLAYER_RULE }, action: request.id, detail };
  emit({ type: 'ruleFired', actor: actor.id, rule: { ...PLAYER_RULE }, condition: 'player', action: request.id, detail });
}

/** Only adventurers in the party are possessed, and at most one at a time. */
registerInvariant('core.possession', (state) => {
  const problems: string[] = [];
  const possessed = Object.values(state.entities).filter((e) => e.ai?.possessed !== undefined);
  for (const e of possessed) {
    if (e.ai?.possessed !== true) problems.push(`entity ${e.id} has possessed = ${String(e.ai?.possessed)}`);
    if (!state.party.includes(e.id) || e.adventurer === undefined) problems.push(`entity ${e.id} is possessed but not in the party`);
  }
  if (possessed.length > 1) problems.push(`${possessed.length} adventurers are possessed at once`);
  return problems;
});
