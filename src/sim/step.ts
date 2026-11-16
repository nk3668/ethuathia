/**
 * The step loop and energy scheduler (docs/ARCHITECTURE.md §3.3 and §3.5).
 *
 * Time moves in ticks. Each tick every scheduled actor gains `speed` energy and `RunState.turn`
 * goes up by one, so a speed-100 actor acts once per turn and a speed-200 actor twice. An actor
 * with at least `ENERGY_THRESHOLD` energy takes one action and pays its cost.
 *
 * One `step` is one party turn: it applies the commands, then runs actors until every party
 * member who can act has acted once, and returns the events in the order they happened.
 */
import { performAction } from './actions';
import type { ActionRequest } from './actions';
import { applyCommand } from './commands';
import type { Command } from './commands';
import type { Emit, SimEvent } from './events';
import { perceive } from './perception';
import type { ActorEntity, Entity, EntityId, RunState } from './state';

/** Energy an actor needs before it can act. */
export const ENERGY_THRESHOLD = 100;

/** What a decide function gets to look at. Later items add perception and AI memory here. */
export interface DecideCtx {
  readonly state: RunState;
  readonly actor: ActorEntity;
  /** Records events such as the AI trace (`ruleFired`) alongside the action's own. */
  readonly emit: Emit;
}

/**
 * Chooses an actor's action for this turn. Randomness must come from `state.rng.ai`, never
 * `Math.random()`. The decision engine (ETH-009) plugs in here.
 */
export type Decide = (ctx: DecideCtx) => ActionRequest;

/** The decide function used until the decision engine exists: always wait. */
export const waitDecide: Decide = () => ({ id: 'wait' });

export interface StepOptions {
  /** Chooses every actor's action. Defaults to `waitDecide`. */
  decide?: Decide;
}

/**
 * Applies `commands` in order, then advances the run by one party turn. Mutates `state` in place
 * and returns the events produced. The same state, commands and `decide` always give the same
 * result.
 *
 * Actors are scheduled only on floors where a party member is; other floors stay frozen. Within a
 * pass actors go in ascending id order, each acting at most once, and passes repeat until nobody
 * has enough energy, which ends the tick. The step stops right after the last party member's
 * action, so actors later in the order act at the start of the next step. A party with nobody
 * able to act (none left, or every speed 0) returns after the commands.
 */
export function step(state: RunState, commands: readonly Command[], options: StepOptions = {}): SimEvent[] {
  const events: SimEvent[] = [];
  const emit: Emit = (event) => events.push({ ...event, turn: state.turn });
  const decide = options.decide ?? waitDecide;

  for (const command of commands) applyCommand(state, command, emit);

  const due = new Set(state.party.filter((id) => canAct(state.entities[id])));
  while (due.size > 0) {
    let acted = false;
    for (const actor of scheduledActors(state)) {
      // An earlier action this pass may have removed or disabled it.
      if (!canAct(state.entities[actor.id]) || actor.actor.energy < ENERGY_THRESHOLD) continue;
      takeTurn(state, actor, decide, emit);
      acted = true;
      due.delete(actor.id);
      for (const id of due) if (!canAct(state.entities[id])) due.delete(id);
      if (due.size === 0) break;
    }
    if (!acted) tick(state);
  }
  return events;
}

/**
 * One actor's turn. A party member first looks around (§5.1: perception before deciding, since a
 * monster may have opened a door since its last turn), and looks again after acting, so the
 * party's memory includes what the action revealed before the next snapshot.
 */
function takeTurn(state: RunState, actor: ActorEntity, decide: Decide, emit: Emit): void {
  const inParty = state.party.includes(actor.id);
  if (inParty) perceive(state, actor.id);
  let request = actor.actor.queued;
  if (request === undefined) {
    request = decide({ state, actor, emit });
  } else {
    delete actor.actor.queued;
  }
  actor.actor.energy -= performAction(state, actor, request, emit);
  if (inParty && state.entities[actor.id] !== undefined) perceive(state, actor.id);
}

/** One tick: every scheduled actor gains its speed in energy, and the turn counter moves on. */
function tick(state: RunState): void {
  for (const actor of scheduledActors(state)) actor.actor.energy += actor.actor.speed;
  state.turn++;
}

/** True if this is a living actor that gains energy. */
function canAct(entity: Entity | undefined): entity is ActorEntity {
  return entity?.actor !== undefined && entity.actor.speed > 0 && entity.actor.hp > 0;
}

/** The actors that take part in time, in ascending id order: those that can act on a party floor. */
function scheduledActors(state: RunState): ActorEntity[] {
  const floors = new Set(state.party.map((id: EntityId) => state.entities[id]?.floor));
  return Object.values(state.entities).filter((e): e is ActorEntity => canAct(e) && floors.has(e.floor));
}
