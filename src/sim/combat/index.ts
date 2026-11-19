/**
 * The combat domain: monsters, melee attacks, damage and death (ETH-060); monster roles come
 * with ETH-040. docs/ARCHITECTURE.md, Contracts, "Combat" describes the API.
 *
 * - `monsters.ts`: monster entities from their defs, `spawnMonster`, the `gen.monsters` step.
 * - `rules.ts`: the conditions and rule actions for fighting, fleeing and wandering.
 * - `death.ts`: `killActor`, `reapDead` and `isPartyWiped`.
 * - `roles.ts`: the conditions and rule actions behind monster roles (ETH-040).
 * - Here: the events, the `attack`, `bolt` and `aid` actions, the state and snapshot slices, the
 *   turn hooks (death sweep, sightings, recovery) and the invariants.
 *
 * Never import `domains.ts` or `index.ts` from this folder.
 */
import { Rng } from '../../core';
import type { Pos } from '../../core';
import { MONSTERS } from '../../content';
import type { ActionRecord } from '../actions';
import type { CommandRecord } from '../commands';
import { isStep } from '../coreActions';
import type { SimDomain, SnapshotCtx, TurnCtx } from '../domain';
import { actorsAt, getFloor } from '../entities';
import { registerInvariant } from '../invariants';
import { defineChronicleKind, momentAt } from '../run/chronicle';
import type { ChronicleRules } from '../run/chronicle';
import { fieldOfView, sightRadius } from '../perception';
import type { ActorEntity, EntityId, FloorId, RunConfig, RunState } from '../state';
import type { Emit } from '../events';
import { fireTrigger, runEffect } from '../stats/effects';
import { applyStatus } from '../stats/statuses';
import { statValue } from '../stats/getStat';
import type { TriggerKindDef } from '../stats/types';
import { actorName, killActor, reapDead } from './death';
import { FLEE_ACTION } from './flee';
import type { FleeRequest } from './flee';
import { GEN_MONSTERS } from './monsters';
import type { MonsterPart } from './monsters';
import { boltable, canSee, isAlly, rolePowers, ROLE_CONDITIONS, ROLE_RULE_ACTIONS } from './roles';
import { adjacentEnemies, COMBAT_CONDITIONS, COMBAT_RULE_ACTIONS, distance, hpPercent, isHostile } from './rules';

export * from './death';
export * from './flee';
export * from './monsters';
export * from './roles';
export * from './rules';

/** The events this domain emits (bodies, without `turn`). Each has wording in `ui/shell/logText/combat.ts`. */
export type CombatEvent =
  /**
   * `actor` hit `target` for `damage`, leaving it at `hp` of `maxHp`. `floor` and `pos` are the
   * target's place. The defs name both sides for the log after either has died. `ranged` is set
   * for a bolt from a distance (ETH-040).
   */
  | {
      type: 'attacked';
      actor: EntityId;
      actorDef: string;
      target: EntityId;
      targetDef: string;
      damage: number;
      hp: number;
      maxHp: number;
      floor: FloorId;
      pos: Pos;
      ranged?: boolean;
    }
  /** `actor` swung at (or, `ranged`, bolted) `target` and missed. */
  | { type: 'missed'; actor: EntityId; actorDef: string; target: EntityId; targetDef: string; ranged?: boolean }
  /**
   * `actor` used a support power on its ally `target` (ETH-040): `mend` heals it (a `healed`
   * event follows), `bolster` gives it a status (a `statusApplied` follows).
   */
  | {
      type: 'aided';
      actor: EntityId;
      actorDef: string;
      target: EntityId;
      targetDef: string;
      power: AidPower;
      floor: FloorId;
      pos: Pos;
    }
  /**
   * A monster (`actor`, def `def`, called `name`) died at `pos` and left the run, from `cause` (a
   * content id: the killer's def, a status, or `combat.unknown`). A party member at 0 HP falls
   * instead: the run domain's `fell`.
   */
  | {
      type: 'died';
      actor: EntityId;
      def: string;
      name: string;
      cause: string;
      killer: EntityId | null;
      floor: FloorId;
      pos: Pos;
    }
  /**
   * `killer` struck the blow that killed `victim` (a monster or a party member). `byParty` is
   * true when the killer is in the party; `threat` is the victim's monster threat (0 for
   * adventurers). The kills tracker credits Trophies from it. `ranged` is set when the blow was
   * a bolt (ETH-075).
   */
  | {
      type: 'killed';
      killer: EntityId;
      killerDef: string;
      byParty: boolean;
      victim: EntityId;
      victimDef: string;
      threat: number;
      floor: FloorId;
      pos: Pos;
      ranged?: boolean;
    }
  /** A party member (`actor`) saw `monster` (def `def`) for the first time, at `pos`. */
  | { type: 'monsterSighted'; actor: EntityId; monster: EntityId; def: string; floor: FloorId; pos: Pos }
  /** An adventurer caught their breath and got back `amount` HP (natural recovery). */
  | { type: 'recovered'; actor: EntityId; amount: number }
  /**
   * `actor` tried to flee but `enemy` (def `enemyDef`), next to it, held it back: it failed its
   * `chance`% Flee check (ETH-081, Finesse) and lost the turn at `pos`.
   */
  | { type: 'fleeFailed'; actor: EntityId; enemy: EntityId; enemyDef: string; chance: number; floor: FloorId; pos: Pos };

/** Strike the creature one step away in `dir`. */
export interface AttackRequest {
  id: 'attack';
  dir: Pos;
}

/** Attack an enemy from a distance with the actor's bolt power (casters, ETH-040). */
export interface BoltRequest {
  id: 'bolt';
  target: EntityId;
}

/** A support power: `mend` heals an ally, `bolster` spurs one on. */
export type AidPower = 'mend' | 'bolster';

/** Use a support power on an ally (supports, ETH-040). */
export interface AidRequest {
  id: 'aid';
  target: EntityId;
  power: AidPower;
}

/** The action requests this domain defines. */
export type CombatRequest = AttackRequest | BoltRequest | AidRequest | FleeRequest;

/** The commands this domain accepts. */
export type CombatCommand = never;

/** This domain's slice of the run state, at `state.domains.combat`. Nothing yet: monsters carry their own part. */
export interface CombatState {}

/** This domain's slice of the snapshot, at `snapshot.domains.combat`. Visible actors' HP is on `ActorView`. */
export interface CombatSnapshot {}

/** Optional parts this domain adds to `Entity`. */
export interface CombatParts {
  /** On monsters: per-monster combat state. */
  monster?: MonsterPart;
}

/** Fields this domain adds to `RunConfig`. */
export interface CombatConfig {
  /** `false` builds generated floors without monsters (tests of other systems). Default true. */
  monsters?: boolean;
}

/** This domain's row in `DomainTypes` (`src/sim/domain.ts`). */
export interface CombatTypes {
  event: CombatEvent;
  request: CombatRequest;
  command: CombatCommand;
  state: CombatState;
  snapshot: CombatSnapshot;
}

// ---------------------------------------------------------------------------------------------
// Attack resolution

/** The chance to hit when accuracy equals evasion. */
export const BASE_HIT_CHANCE = 0.7;
/** How much each point of accuracy over the target's evasion adds to the chance to hit. */
export const HIT_PER_POINT = 0.05;
export const MIN_HIT_CHANCE = 0.05;
export const MAX_HIT_CHANCE = 0.95;

/** The chance that a blow with `accuracy` lands on a target with `evasion`. */
export function hitChance(accuracy: number, evasion: number): number {
  return Math.min(MAX_HIT_CHANCE, Math.max(MIN_HIT_CHANCE, BASE_HIT_CHANCE + (accuracy - evasion) * HIT_PER_POINT));
}

/**
 * Every blow that lands rolls 1 to `BASE_BLOW` before the attacker's `damage` stat is added: what
 * any creature does with fists, teeth or claws. Weapons (ETH-043) and attributes raise `damage`.
 */
export const BASE_BLOW = 3;

/** A blow's damage before armor: 1 to `BASE_BLOW`, plus the `damage` stat, at least 1. One draw. */
export function rollDamage(rng: Rng, damage: number): number {
  return Math.max(1, rng.int(1, BASE_BLOW) + damage);
}

/** The damage a blow does after `armor`: never below 1. */
export function afterArmor(raw: number, armor: number): number {
  return Math.max(1, raw - armor);
}

function targetAt(state: RunState, actor: ActorEntity, dir: Pos): ActorEntity | undefined {
  const pos = { x: actor.pos.x + dir.x, y: actor.pos.y + dir.y };
  const floor = getFloor(state, actor.floor);
  if (pos.x < 0 || pos.y < 0 || pos.x >= floor.terrain.width || pos.y >= floor.terrain.height) return undefined;
  return actorsAt(state, actor.floor, pos).find((e): e is ActorEntity => e.actor !== undefined && e.actor.hp > 0 && isHostile(actor, e));
}

export const COMBAT_ACTIONS: ActionRecord<CombatRequest> = {
  attack: {
    id: 'attack',
    name: 'Attack',
    description:
      'Strike an enemy on a neighboring tile, diagonals included. The chance to hit is 70% plus 5% for each point ' +
      'of accuracy over the target’s evasion (5% to 95%). A blow that lands does 1 to 3 plus the damage stat, ' +
      'less the target’s armor, but always at least 1. At 0 HP the target dies.',
    tags: [],
    cost: 100,
    parse: (raw) =>
      isStep(raw.dir) ? { id: 'attack', dir: { x: raw.dir.x, y: raw.dir.y } } : 'The direction must be one step: x and y each -1, 0 or 1, not both 0',
    validate: ({ state, actor }, { dir }) => (targetAt(state, actor, dir) === undefined ? 'There is no enemy there' : null),
    execute: ({ state, actor, emit }, { dir }) => {
      const target = targetAt(state, actor, dir);
      if (target !== undefined) strike(state, actor, target, emit, false);
    },
  },
  bolt: {
    id: 'bolt',
    name: 'Bolt',
    description:
      'Attack an enemy in sight from a distance, up to the attacker’s bolt range. Hits and damage are worked out ' +
      'as for a blow; creatures in between don’t block it. Only creatures with a ranged attack (casters) can do this.',
    tags: [],
    cost: 100,
    parse: (raw) => (isEntityId(raw.target) ? { id: 'bolt', target: raw.target } : 'The target must be an entity id'),
    validate: ({ state, actor }, { target }) => {
      const { bolt } = rolePowers(actor);
      if (bolt === undefined) return 'Only creatures with a ranged attack can do that';
      const t = state.entities[target];
      if (t === undefined || !boltable(actor, t)) return 'There is no enemy to bolt there';
      if (distance(t.pos, actor.pos) > bolt.range || !canSee(state, actor, t)) return 'That enemy is out of sight or range';
      return null;
    },
    execute: ({ state, actor, emit }, { target }) => {
      const t = state.entities[target];
      if (t?.actor !== undefined) strike(state, actor, t as ActorEntity, emit, true);
    },
  },
  aid: {
    id: 'aid',
    name: 'Aid',
    description:
      'Use a support power on an ally in sight and within reach: mend heals them, bolster spurs them on with a ' +
      'status. Only creatures with that power (supports) can do this.',
    tags: [],
    cost: 100,
    parse: (raw) => {
      if (!isEntityId(raw.target)) return 'The target must be an entity id';
      return raw.power === 'mend' || raw.power === 'bolster'
        ? { id: 'aid', target: raw.target, power: raw.power }
        : 'The power must be "mend" or "bolster"';
    },
    validate: ({ state, actor }, { target, power }) => {
      const powers = rolePowers(actor);
      const reach = power === 'mend' ? powers.mend?.range : powers.bolster?.range;
      if (reach === undefined) return `Only creatures that can ${power} can do that`;
      const t = state.entities[target];
      if (t === undefined || !isAlly(actor, t)) return 'There is no ally there';
      if (distance(t.pos, actor.pos) > reach || !canSee(state, actor, t)) return 'That ally is out of sight or reach';
      if (power === 'mend' && hpPercent(state, t as ActorEntity) >= 100) return 'That ally isn’t hurt';
      return null;
    },
    execute: ({ state, actor, emit }, { target, power }) => {
      const t = state.entities[target];
      if (t === undefined) return;
      emit({
        type: 'aided',
        actor: actor.id,
        actorDef: actor.def,
        target: t.id,
        targetDef: t.def,
        power,
        floor: t.floor,
        pos: { x: t.pos.x, y: t.pos.y },
      });
      const { mend, bolster } = rolePowers(actor);
      if (power === 'mend' && mend !== undefined) {
        runEffect({ state, emit, self: actor.id, other: t.id, source: actor.def, potency: 1 }, { kind: 'heal', amount: mend.amount, to: 'other' });
      } else if (power === 'bolster' && bolster !== undefined) {
        applyStatus(state, t, bolster.status, bolster.turns, emit, 1, true, actor);
      }
    },
  },
  flee: FLEE_ACTION,
};

function isEntityId(value: unknown): value is EntityId {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

/**
 * One blow (or, `ranged`, one bolt) from `actor` at `target`: the hit roll, damage after armor,
 * the hit and struck triggers, and death. Draws from the combat stream: one roll to hit, one for
 * damage when it lands.
 */
function strike(state: RunState, actor: ActorEntity, target: ActorEntity, emit: Emit, ranged: boolean): void {
  const rng = new Rng(state.rng.combat);
  const how = ranged ? { ranged: true } : {};
  const chance = hitChance(statValue(state, actor, 'accuracy'), statValue(state, target, 'evasion'));
  if (!rng.chance(chance)) {
    emit({ type: 'missed', actor: actor.id, actorDef: actor.def, target: target.id, targetDef: target.def, ...how });
    return;
  }
  const dealt = Math.min(target.actor.hp, afterArmor(rollDamage(rng, statValue(state, actor, 'damage')), statValue(state, target, 'armor')));
  target.actor.hp -= dealt;
  emit({
    type: 'attacked',
    actor: actor.id,
    actorDef: actor.def,
    target: target.id,
    targetDef: target.def,
    damage: dealt,
    hp: target.actor.hp,
    maxHp: statValue(state, target, 'hp'),
    floor: target.floor,
    pos: { x: target.pos.x, y: target.pos.y },
    ...how,
  });
  if (target.actor.hp > 0) fireTrigger(state, target, TRIGGER_STRUCK.id, emit, actor.id);
  if (actor.actor.hp > 0) fireTrigger(state, actor, TRIGGER_HIT.id, emit, target.id);
  const floor = actor.floor;
  if (state.entities[target.id] !== undefined && target.actor.hp <= 0) {
    killActor(state, target, emit, { cause: actor.def, killer: actor, ranged });
  }
  reapDead(state, floor, emit);
}

export const COMBAT_COMMANDS: CommandRecord<CombatCommand> = {};

/** The state slice for a new run. */
export function initCombat(_config: RunConfig): CombatState {
  return {};
}

/** The snapshot slice. Shares nothing with the state. */
export function combatSnapshot(_ctx: SnapshotCtx): CombatSnapshot {
  return {};
}

// ---------------------------------------------------------------------------------------------
// Triggers and turn hooks

export const TRIGGER_HIT: TriggerKindDef = {
  id: 'trigger.hit',
  name: 'Hit',
  description: 'When the holder lands a blow, after the damage. The one struck is the other party.',
  tags: [],
};

export const TRIGGER_STRUCK: TriggerKindDef = {
  id: 'trigger.struck',
  name: 'Struck',
  description: 'When a blow lands on the holder and it survives. The attacker is the other party.',
  tags: [],
};

/** An adventurer with no enemy next to them gets back 1 HP every this many game turns. */
export const RECOVERY_INTERVAL = 2;

/** Turn start: anyone left at 0 HP by the stats domain's turn-start triggers dies. */
function combatTurnStart({ state, actor, emit }: TurnCtx): void {
  reapDead(state, actor.floor, emit);
}

/**
 * Turn end: deaths from the action's triggers, then for a party member, monsters it sees for
 * the first time and natural recovery.
 */
function combatTurnEnd({ state, actor, emit }: TurnCtx): void {
  reapDead(state, actor.floor, emit);
  if (state.entities[actor.id] === undefined || actor.actor.faction !== 'party' || actor.actor.hp <= 0) return;
  noticeMonsters(state, actor, emit);
  if (state.turn % RECOVERY_INTERVAL === 0 && actor.actor.hp < statValue(state, actor, 'hp') && adjacentEnemies(state, actor).length === 0) {
    actor.actor.hp += 1;
    emit({ type: 'recovered', actor: actor.id, amount: 1 });
  }
}

/** Emits `monsterSighted` for each monster `viewer` can see that the party hasn't seen yet. */
function noticeMonsters(state: RunState, viewer: ActorEntity, emit: TurnCtx['emit']): void {
  const radius = sightRadius(state, viewer);
  const unseen = getFloor(state, viewer.floor)
    .entities.map((id) => state.entities[id])
    .filter((e) => e?.monster !== undefined && !e.monster.sighted && e.actor !== undefined && distance(e.pos, viewer.pos) <= radius);
  if (unseen.length === 0) return;
  const { width } = getFloor(state, viewer.floor).terrain;
  const seen = new Set(fieldOfView(state, viewer).map((p) => p.y * width + p.x));
  for (const m of unseen) {
    if (m?.monster === undefined || !seen.has(m.pos.y * width + m.pos.x)) continue;
    m.monster.sighted = true;
    emit({ type: 'monsterSighted', actor: viewer.id, monster: m.id, def: m.def, floor: m.floor, pos: { x: m.pos.x, y: m.pos.y } });
  }
}

// ---------------------------------------------------------------------------------------------
// Invariants (docs/ARCHITECTURE.md §11.1)

/**
 * Dead monsters are gone: no actor outside the party stays in the run at 0 HP between steps.
 * (Fallen party members stay, at 0 HP, for the run domain.)
 */
registerInvariant('combat.noDead', (state) =>
  Object.values(state.entities)
    .filter((e) => e.actor !== undefined && e.actor.hp <= 0 && !state.party.includes(e.id))
    .map((e) => `actor ${e.id} (${actorName(e)}) is at ${e.actor?.hp} HP but still in the run`),
);

/** Monsters are monster-faction actors of a known def with a monster part, and only they have one. */
registerInvariant('combat.monsters', (state) => {
  const problems: string[] = [];
  for (const e of Object.values(state.entities)) {
    const isMonster = MONSTERS.has(e.def);
    if (isMonster && (e.actor?.faction !== 'monster' || e.monster === undefined || e.ai === undefined || e.stats === undefined)) {
      problems.push(`monster ${e.id} (${e.def}) is missing its actor, monster, ai or stats part`);
    }
    if (!isMonster && e.monster !== undefined) problems.push(`entity ${e.id} (${e.def}) has a monster part but is not a monster`);
  }
  return problems;
});

/** The share of max HP under which a blow on an adventurer leaves them near death (a highlight, ETH-047). */
export const NEAR_DEATH_FRACTION = 0.25;

/** True when an `attacked` blow left an adventurer (not a monster) alive with under `NEAR_DEATH_FRACTION` of their HP. */
export function isNearDeathBlow(e: { targetDef: string; hp: number; maxHp: number }): boolean {
  return !MONSTERS.has(e.targetDef) && e.hp > 0 && e.hp < e.maxHp * NEAR_DEATH_FRACTION;
}

/**
 * A run chronicle moment (ETH-120): a blow left an adventurer near death. `actors` are the
 * adventurer and the attacker, `ids` the attacker's def, `amount` the HP left.
 */
export const CHRONICLE_NEAR_DEATH = defineChronicleKind({ id: 'nearDeath', priority: 30 });

/** Which of this domain's events are run chronicle moments. */
export const COMBAT_CHRONICLE: ChronicleRules = {
  attacked: (e) => (isNearDeathBlow(e) ? momentAt(CHRONICLE_NEAR_DEATH, e, [e.target, e.actor], [e.actorDef], { amount: e.hp }) : null),
};

/** What this domain registers with the shared code, in this order. */
export const COMBAT_DOMAIN: SimDomain<CombatTypes> = {
  actions: COMBAT_ACTIONS,
  commands: COMBAT_COMMANDS,
  init: initCombat,
  snapshot: combatSnapshot,
  conditions: [...COMBAT_CONDITIONS, ...ROLE_CONDITIONS],
  ruleActions: [...COMBAT_RULE_ACTIONS, ...ROLE_RULE_ACTIONS],
  genSteps: [GEN_MONSTERS],
  triggers: [TRIGGER_HIT, TRIGGER_STRUCK],
  turnStart: combatTurnStart,
  turnEnd: combatTurnEnd,
  discoveries: {
    monsterSighted: (e) => (MONSTERS.has(e.def) ? [{ id: e.def, mark: 'seen' }] : []),
    killed: (e) => (MONSTERS.has(e.victimDef) ? [{ id: e.victimDef, mark: 'killed' }] : []),
  },
  chronicle: COMBAT_CHRONICLE,
  chronicleKinds: [CHRONICLE_NEAR_DEATH],
};

