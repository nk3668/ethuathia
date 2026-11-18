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
import { ruleDecide } from './ai/engine';
import type { ActionRequest } from './actions';
import { applyCommand } from './commands';
import type { Command } from './commands';
import { runTurnEnd, runTurnStart } from './domains';
import { statValue } from './stats/getStat';
import type { Emit, SimEvent } from './events';
import { perceive } from './perception';
import { announceStart, runOver, settleRun } from './run/end';
import { reduceTrackers } from './run/trackers';
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
 * `Math.random()`. The default is the decision engine, `ruleDecide` (`src/sim/ai`).
 */
export type Decide = (ctx: DecideCtx) => ActionRequest;

/** A decide function that always waits, for tests of the scheduler itself. */
export const waitDecide: Decide = () => ({ id: 'wait' });

export interface StepOptions {
  /** Chooses every actor's action. Defaults to the decision engine, `ruleDecide`. */
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
  const decide = options.decide ?? ruleDecide;
  // A finished run stays as it ended (ETH-062).
  if (runOver(state)) return events;
  announceStart(state, emit);

  for (const command of commands) applyCommand(state, command, emit);
  let over = settleRun(state, events, 0, emit);

  const due = new Set(over ? [] : state.party.filter((id) => canActIn(state, state.entities[id])));
  while (due.size > 0 && !over) {
    let acted = false;
    for (const actor of scheduledActors(state)) {
      // An earlier action this pass may have removed or disabled it.
      if (!canActIn(state, state.entities[actor.id]) || actor.actor.energy < ENERGY_THRESHOLD) continue;
      const from = events.length;
      takeTurn(state, actor, decide, emit);
      acted = true;
      // The party may have left the dungeon, or its last member fallen.
      over = settleRun(state, events, from, emit);
      if (over) break;
      due.delete(actor.id);
      for (const id of due) if (!canActIn(state, state.entities[id])) due.delete(id);
      if (due.size === 0) break;
    }
    if (!acted) tick(state);
  }
  // Run trackers see the whole step's events, `runEnded` included (docs/ARCHITECTURE.md, "Rewards").
  reduceTrackers(state, events);
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
  // Domain turn hooks (statuses' triggers). Something there may kill or remove the actor.
  runTurnStart({ state, actor, emit });
  if (state.entities[actor.id] === undefined || actor.actor.hp <= 0) {
    delete actor.actor.queued;
    return;
  }
  let request = actor.actor.queued;
  if (request === undefined) {
    request = decide({ state, actor, emit });
  } else {
    delete actor.actor.queued;
  }
  actor.actor.energy -= performAction(state, actor, request, emit);
  if (state.entities[actor.id] === undefined) return;
  runTurnEnd({ state, actor, emit });
  if (inParty && state.entities[actor.id] !== undefined) perceive(state, actor.id);
}

/** One tick: every scheduled actor gains its speed in energy, and the turn counter moves on. */
function tick(state: RunState): void {
  for (const actor of scheduledActors(state)) actor.actor.energy += statValue(state, actor, 'speed');
  state.turn++;
}

/** True if this is a living actor that gains energy. Must be called on an entity of `state`. */
function canActIn(state: RunState, entity: Entity | undefined): entity is ActorEntity {
  return entity?.actor !== undefined && entity.actor.hp > 0 && statValue(state, entity, 'speed') > 0;
}

/** The actors that take part in time, in ascending id order: those that can act on a party floor. */
function scheduledActors(state: RunState): ActorEntity[] {
  const floors = new Set(state.party.map((id: EntityId) => state.entities[id]?.floor));
  return Object.values(state.entities).filter((e): e is ActorEntity => floors.has(e.floor) && canActIn(state, e));
}
