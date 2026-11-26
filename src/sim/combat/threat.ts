/**
 * Threats and fleeing (ETH-148, docs/ARCHITECTURE.md §4). Three things the baseline needs to flee
 * well, all built on one question, "will this enemy come and hurt me?":
 *
 * - `isThreat` / `visibleThreats`: which enemies count. Fleeing, "safe to test a scroll" and the
 *   avoidance below ignore harmless ones (a moss tender that only mends its kin).
 * - Hysteresis: once an adventurer starts to flee (HP below `BASELINE_FLEE_PERCENT` with a threat in
 *   sight) it keeps fleeing until HP is back to `FLEE_RELEASE_PERCENT` or no threat has been seen for
 *   `FLEE_CALM_TURNS`. `updateThreatMemory` keeps `AiMemory.fleeing` and `AiMemory.threats`.
 * - No walking back: while wounded with no healing potion, `avoidThreats` makes the ground near a
 *   remembered threat cost more on the grid exploring and picking up plan on. The cost fades with
 *   distance and with the age of the sighting.
 */
import { MONSTERS, monsterPowers, STATUSES } from '../../content';
import type { Bundle, Effect } from '../../content';
import { bundleOf, statValue } from '../stats/getStat';
import { carriesHealingPotion } from '../floors/fountains';
import { fleeBelowOf, fleeReleaseOf } from '../ai/stanceParams';
import type { PathGrid } from '../goalMap';
import type { AiActor, AiCtx, ThreatMark } from '../ai/types';
import { sourcesByTag } from '../ai/abilities';
import { nameOf } from '../ai/navigate';
import type { ActorEntity, Entity, RunState } from '../state';
import { AVOID_PENALTY, AVOID_RADIUS, FLEE_CALM_TURNS, FLEE_CYCLE_RADIUS, FLEE_CYCLE_WINDOW, FLEE_HOLD_TURNS, THREAT_MEMORY_TURNS } from './fleeConfig';
import { hpPercent, visibleEnemies } from './rules';
import { blockFleeZone, cycleRecoverPercent } from './zone';
import { overlayOf, templatesOf } from './overlay';

/** Rule actions that make a creature come after its enemies. */
const PROACTIVE_ACTIONS: ReadonlySet<string> = new Set(['act.approach_enemy', 'act.surround', 'act.cast_bolt']);

function bundleHurts(bundle: Bundle | undefined): boolean {
  const effects: Effect[] = [...(bundle?.effects ?? []), ...(bundle?.triggers ?? []).flatMap((t) => [...t.effects])];
  return effects.some((e) => {
    if (e.kind === 'damage') return e.to !== 'self';
    if (e.kind === 'applyStatus') return e.to === 'other' && STATUSES.has(e.status) && STATUSES.get(e.status).harmful;
    return false;
  });
}

/**
 * Whether `enemy` will come and hurt the party: "threat" here means "will come after you", not "can
 * deal damage". A blow always does at least 1 damage (`rollDamage`), so every monster can hurt
 * something it is cornered next to; a moss tender that only mends and spurs on its kin and never
 * pursues is not a threat. A monster is one when its `damage` stat is above 0, it has a bolt, one of
 * its rules chases, surrounds or bolts its enemies, or its bundle or templates deal damage or apply
 * a harmful status. Adventurers always are. Content-driven: no ids are named.
 */
export function isThreat(state: RunState, enemy: Entity): boolean {
  if (enemy.actor === undefined) return false;
  if (enemy.adventurer !== undefined || enemy.actor.faction === 'party') return true;
  if (!MONSTERS.has(enemy.def)) return true;
  const def = MONSTERS.get(enemy.def);
  if (statValue(state, enemy as ActorEntity, 'damage') > 0) return true;
  if (monsterPowers(def, templatesOf(enemy)).bolt !== undefined) return true;
  if ((enemy.ai?.rules ?? []).some((r) => PROACTIVE_ACTIONS.has(r.action.id))) return true;
  if (bundleHurts(def.bundle) || templatesOf(enemy).some((t) => bundleHurts(t.bundle))) return true;
  return (overlayOf(enemy)?.bundles ?? []).some((id) => bundleHurts(bundleOf(id)));
}

/** The enemies `actor` can see that are threats, nearest first. */
export function visibleThreats(state: RunState, actor: ActorEntity): ActorEntity[] {
  return visibleEnemies(state, actor).filter((e) => isThreat(state, e));
}

/** The remembered threat sightings on `actor`'s floor that are still fresh. */
export function freshThreats(state: RunState, actor: AiActor): ThreatMark[] {
  return actor.ai.memory.threats.filter((m) => m.floor === actor.floor && state.turn - m.seen <= THREAT_MEMORY_TURNS);
}

/**
 * Whether `actor` is wounded enough, and without anything that heals (a healing potion, or any
 * known `heal`-tagged item such as a field ration), to steer clear of remembered threats.
 */
export function isWounded(state: RunState, actor: AiActor): boolean {
  if (hpPercent(state, actor) >= fleeReleaseOf(actor)) return false;
  return !carriesHealingPotion(state, actor) && sourcesByTag({ state, actor }, 'heal').length === 0;
}

/**
 * Updates what a party member remembers before it decides: the threats in sight (and where), and
 * whether it is fleeing. Starts fleeing below `BASELINE_FLEE_PERCENT` with a threat in sight; stops
 * at `FLEE_RELEASE_PERCENT` HP or after `FLEE_CALM_TURNS` without seeing one. Deterministic: reads
 * the run state alone.
 */
export function updateThreatMemory(state: RunState, actor: AiActor): void {
  const memory = actor.ai.memory;
  const visible = visibleThreats(state, actor);
  for (const e of visible) {
    const mark: ThreatMark = { id: e.id, name: nameOf(e), floor: e.floor, pos: { x: e.pos.x, y: e.pos.y }, seen: state.turn };
    const i = memory.threats.findIndex((m) => m.id === e.id);
    if (i === -1) memory.threats.push(mark);
    else memory.threats[i] = mark;
  }
  memory.threats = memory.threats.filter((m) => {
    if (m.floor !== actor.floor || state.turn - m.seen > THREAT_MEMORY_TURNS) return false;
    const e = state.entities[m.id];
    return e?.actor !== undefined && e.actor.hp > 0;
  });
  const hp = hpPercent(state, actor);
  // Recovered: whatever flee/return cycle there was is over (ETH-189).
  if (memory.fleeCycle !== undefined && hp >= cycleRecoverPercent(memory.fleeCycle, fleeReleaseOf(actor))) delete memory.fleeCycle;
  const fleeing = memory.fleeing;
  if (fleeing === null) {
    if (hp < fleeBelowOf(actor) && visible.length > 0) {
      memory.fleeing = { since: state.turn, lastSeen: state.turn, held: 0 };
      const cycle = memory.fleeCycle;
      const pos = { x: actor.pos.x, y: actor.pos.y };
      const again = cycle !== undefined && state.turn - cycle.last <= FLEE_CYCLE_WINDOW && Math.max(Math.abs(cycle.pos.x - pos.x), Math.abs(cycle.pos.y - pos.y)) <= FLEE_CYCLE_RADIUS;
      // A cycle that goes on keeps its rest and give-up marks, so each is announced once; a new one
      // after a long gap (the rest) still remembers how many rests failed to bring HP back.
      // A flight after a rest that has ended (or was cut short) clears `restUntil`, so the next rest can start in the same cycle.
      const next = again ? { ...cycle, episodes: cycle.episodes + 1, last: state.turn, pos } : null;
      if (next !== null) delete next.restUntil;
      memory.fleeCycle = next ?? { episodes: 1, last: state.turn, pos, ...(cycle?.rests === undefined ? {} : { rests: cycle.rests }), ...(cycle?.blocked === undefined ? {} : { blocked: cycle.blocked }) };
    }
    return;
  }
  if (visible.length > 0) fleeing.lastSeen = state.turn;
  // Holding still with nowhere to run only works for so long: then give up fleeing and carry on.
  fleeing.held = memory.intent?.action === 'act.hold_position' ? fleeing.held + 1 : 0;
  if (fleeing.held > FLEE_HOLD_TURNS) {
    memory.fleeing = null;
    return;
  }
  if (hp >= fleeReleaseOf(actor) || state.turn - fleeing.lastSeen >= FLEE_CALM_TURNS) memory.fleeing = null;
}

/**
 * While `ctx.actor` is wounded with no healing, raises the cost of ground near the threats it
 * remembers on `paths`, fading with distance and with how long ago they were seen, so exploring and
 * picking up lead around them when another way exists. Returns the trace note ("avoiding the crypt
 * sentinel's last position while wounded"), or null when nothing was changed.
 */
export function avoidThreats(ctx: AiCtx, paths: PathGrid): string | null {
  const { state, actor } = ctx;
  if (actor.actor.faction !== 'party') return null;
  const zone = blockFleeZone(ctx, paths);
  if (zone !== null) return zone;
  const marks = freshThreats(state, actor);
  if (marks.length === 0 || !isWounded(state, actor)) return null;
  const { width, height, cost } = paths;
  for (const m of marks) {
    const age = 1 - (state.turn - m.seen) / THREAT_MEMORY_TURNS;
    for (let y = Math.max(0, m.pos.y - AVOID_RADIUS); y <= Math.min(height - 1, m.pos.y + AVOID_RADIUS); y++) {
      for (let x = Math.max(0, m.pos.x - AVOID_RADIUS); x <= Math.min(width - 1, m.pos.x + AVOID_RADIUS); x++) {
        const i = y * width + x;
        const c = cost[i] as number;
        if (c === 0) continue;
        const d = Math.max(Math.abs(x - m.pos.x), Math.abs(y - m.pos.y));
        const extra = Math.ceil(AVOID_PENALTY * (1 - d / (AVOID_RADIUS + 1)) * age);
        if (extra > 0) cost[i] = Math.min(0xffff, c + extra);
      }
    }
  }
  const names = marks.map((m) => m.name);
  const list = names.length <= 1 ? (names[0] as string) : `${names.slice(0, -1).join(', ')} and ${names.at(-1) as string}`;
  return `avoiding ${list}'s last ${marks.length === 1 ? 'position' : 'positions'} while wounded`;
}
