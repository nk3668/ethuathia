/**
 * Fountains (ETH-072): a dungeon feature the party can drink from for a draught (content
 * `DRAUGHTS`): mending water, a short buff, a mild debuff, or nothing.
 *
 * - `gen.fountains` places 0–2 per generated floor and rolls the draughts each one holds from the
 *   floor's seeded RNG, so drinking itself draws no randomness and a fountain is the same however
 *   the run got there.
 * - `RunConfig.maxFountains` caps fountains per floor (the Dry Wells Omen, ETH-067, sets it to 0);
 *   `planFloor` applies it after generation, so the rest of the floor doesn't change.
 * - The `drink` action (in `index.ts`) drinks the fountain the actor stands on.
 * - `act.drink_fountain` walks to the nearest known fountain that isn't dry and drinks;
 *   `cond.hurt_no_healing` is the baseline's reason to: HP below a share of the maximum and no
 *   healing potion carried.
 */
import { DRAUGHTS, healAmount, ITEMS } from '../../content';
import type { DraughtDef } from '../../content';
import type { Pos, Rng } from '../../core';
import { aiPathGrid, followMap } from '../ai/navigate';
import { defineCondition, defineRuleAction, noParams } from '../ai/types';
import type { AiCtx, ConditionDef, ParamParser, Resolved, RuleActionDef } from '../ai/types';
import { featureAt } from '../entities';
import { readParams } from '../gen/params';
import { defineGenStep, rectTiles } from '../gen/types';
import type { FloorDraft, GenStepDef, Rect } from '../gen/types';
import type { FloorPlan } from '../floorText';
import { buildGoalMap, UNREACHABLE } from '../goalMap';
import { registerInvariant } from '../invariants';
import { isInstanceTypeKnown } from '../items/identify';
import { inventoryOf } from '../items/inventory';
import { getMemory } from '../perception';
import { statValue } from '../stats/getStat';
import { DEFS, Terrain } from '../state';
import type { ActorEntity, Entity, FloorId, RunState } from '../state';

/** A fountain feature part. */
export type FountainPart = Extract<NonNullable<Entity['feature']>, { kind: 'fountain' }>;

// ---------------------------------------------------------------------------------------------
// The fountain table

/** One draught id from the weighted table of every `DRAUGHTS` def, in registry order. */
export function rollDraught(rng: Rng): string {
  const all = DRAUGHTS.all();
  const total = all.reduce((sum, d) => sum + d.weight, 0);
  if (total <= 0) throw new Error('There are no draughts to fill a fountain with');
  let roll = rng.int(1, total);
  for (const d of all) {
    roll -= d.weight;
    if (roll <= 0) return d.id;
  }
  return (all.at(-1) as DraughtDef).id;
}

// ---------------------------------------------------------------------------------------------
// gen.fountains

const fountains = defineGenStep({
  id: 'gen.fountains',
  name: 'Place fountains',
  description:
    'Puts a random number of fountains on free room tiles, each in a different room where it can, and fills each ' +
    'one with a few draughts rolled from the fountain table.',
  parse(raw) {
    const p = readParams(raw, {
      /** Fewest fountains on the floor. */
      min: { default: 0, min: 0, max: 20, integer: true },
      /** Most fountains on the floor. */
      max: { default: 2, min: 0, max: 20, integer: true },
      /** Fewest draughts a fountain holds before it runs dry. */
      minDraughts: { default: 2, min: 1, max: 20, integer: true },
      /** Most draughts a fountain holds. */
      maxDraughts: { default: 4, min: 1, max: 20, integer: true },
    });
    if (p.min > p.max) throw new RangeError(`min (${p.min}) is above max (${p.max})`);
    if (p.minDraughts > p.maxDraughts) throw new RangeError(`minDraughts (${p.minDraughts}) is above maxDraughts (${p.maxDraughts})`);
    return p;
  },
  run(draft: FloorDraft, p, rng) {
    const count = rng.int(p.min, p.max);
    if (count === 0 || draft.rooms.length === 0) return;
    const taken = new Set(draft.features.map((f) => f.pos.y * draft.terrain.width + f.pos.x));
    const free = (room: Rect): Pos[] =>
      rectTiles(room).filter(
        (t) => draft.terrain.get(t.x, t.y) === Terrain.Floor && !taken.has(t.y * draft.terrain.width + t.x),
      );
    // Each fountain in a room that has none yet, while there are such rooms.
    const rooms = rng.shuffle([...draft.rooms]);
    for (let i = 0; i < count; i++) {
      const room = rooms[i % rooms.length] as Rect;
      const tiles = free(room);
      if (tiles.length === 0) continue;
      const pos = rng.pick(tiles);
      const n = rng.int(p.minDraughts, p.maxDraughts);
      const draughts: string[] = [];
      for (let d = 0; d < n; d++) draughts.push(rollDraught(rng));
      draft.features.push({ def: DEFS.fountain, pos, feature: { kind: 'fountain', draughts } });
      taken.add(pos.y * draft.terrain.width + pos.x);
    }
  },
});

/** The floors domain's generation steps. */
export const FOUNTAIN_GEN_STEPS: readonly GenStepDef[] = [fountains];

/**
 * Keeps at most `max` fountains in `plan` (the first ones, in placement order), for
 * `RunConfig.maxFountains`. `undefined` keeps them all. Draws nothing, so the rest of the floor
 * is the same whatever the cap.
 */
export function capFountains(plan: FloorPlan, max: number | undefined): void {
  if (max === undefined) return;
  let kept = 0;
  plan.features = plan.features.filter((f) => f.feature.kind !== 'fountain' || kept++ < max);
}

/** The fountain cap a config asks for. Throws on anything but `undefined` or a whole number ≥ 0. */
export function configMaxFountains(max: number | undefined): number | undefined {
  if (max !== undefined && (!Number.isSafeInteger(max) || max < 0)) {
    throw new RangeError(`maxFountains must be a whole number of 0 or more, got ${String(max)}`);
  }
  return max;
}

// ---------------------------------------------------------------------------------------------
// Reading fountains

/** The fountain at `pos` on `floorId` and its part, if there is one. */
export function fountainAt(state: RunState, floorId: FloorId, pos: Pos): (Entity & { feature: FountainPart }) | undefined {
  const e = featureAt(state, floorId, pos);
  return e?.feature?.kind === 'fountain' ? (e as Entity & { feature: FountainPart }) : undefined;
}

/** Where the party remembers fountains that weren't dry when last seen on `floorId`, in tile order. */
export function knownFlowingFountains(state: RunState, floorId: FloorId): Pos[] {
  const memory = getMemory(state, floorId);
  const { width } = memory.terrain;
  const out: Pos[] = [];
  for (const key of Object.keys(memory.features)) {
    const i = Number(key);
    const f = memory.features[i]?.feature;
    if (f?.kind === 'fountain' && f.draughts.length > 0) out.push({ x: i % width, y: Math.floor(i / width) });
  }
  return out;
}

/**
 * Whether `actor` carries a known healing potion: any pack entry whose type is known to the party
 * (ETH-044) and whose use heals its user (`healAmount`), matching `act.quaff_healing` (ETH-061).
 */
export function carriesHealingPotion(state: RunState, actor: ActorEntity): boolean {
  return inventoryOf(actor).some((item) => ITEMS.has(item.def) && isInstanceTypeKnown(state, item) && healAmount(ITEMS.get(item.def)) > 0);
}

// ---------------------------------------------------------------------------------------------
// Conditions and rule actions

/** `cond.hurt_no_healing`'s params: HP below `below` percent of the maximum. */
export interface HurtParams {
  below: number;
}

const parseHurt: ParamParser<HurtParams> = (raw) => {
  if (raw === undefined || raw === null) return { below: 50 };
  if (typeof raw !== 'object' || Array.isArray(raw)) return 'Params must be an object';
  const { below, ...rest } = raw as Record<string, unknown>;
  if (Object.keys(rest).length > 0) return `Unknown parameter "${Object.keys(rest)[0] as string}"`;
  if (below === undefined) return { below: 50 };
  if (typeof below !== 'number' || !Number.isFinite(below) || below <= 0 || below > 100) return '"below" must be a percentage above 0, up to 100';
  return { below };
};

/** HP under a share of the maximum, with no healing potion to drink instead. */
export const COND_HURT_NO_HEALING = defineCondition({
  id: 'cond.hurt_no_healing',
  name: 'Hurt, with no healing potion',
  description:
    'True when HP is below a share of the maximum (half, unless set) and the adventurer carries no healing potion.',
  parse: parseHurt,
  evaluate({ state, actor }, { below }) {
    const max = statValue(state, actor, 'hp');
    const hp = actor.actor.hp;
    if (hp <= 0 || hp * 100 >= max * below || carriesHealingPotion(state, actor)) return { ok: false, detail: '' };
    return { ok: true, detail: `HP ${hp}/${max}, below ${below}%, and no healing potion` };
  },
  describe: ({ below }) => `HP below ${below}% and no healing potion`,
});

/** Walk to the nearest known fountain that isn't dry and drink from it. */
export const ACT_DRINK_FOUNTAIN = defineRuleAction({
  id: 'act.drink_fountain',
  name: 'Drink from a fountain',
  description:
    'Walk to the nearest fountain on this floor that the party has seen and that isn’t dry, and drink from it. ' +
    'Most draughts mend wounds, but some do nothing and a few sit badly. Can’t be done before a fountain is found.',
  parse: noParams,
  resolve(ctx: AiCtx): Resolved | null {
    const { state, actor } = ctx;
    const here = fountainAt(state, actor.floor, actor.pos);
    if (here !== undefined && here.feature.draughts.length > 0) {
      return { request: { id: 'drink' }, detail: 'drinking from the fountain' };
    }
    const goals = knownFlowingFountains(state, actor.floor);
    if (goals.length === 0) return null;
    const paths = aiPathGrid(ctx);
    const map = buildGoalMap(paths, goals);
    const cost = map.get(actor.pos.x, actor.pos.y);
    if (cost === UNREACHABLE) return null;
    return followMap(ctx, paths, map, `heading for a fountain, ${cost} ${cost === 1 ? 'turn' : 'turns'} away`);
  },
  describe: () => 'drink from the nearest fountain',
});

export const FOUNTAIN_CONDITIONS: readonly ConditionDef[] = [COND_HURT_NO_HEALING];
export const FOUNTAIN_RULE_ACTIONS: readonly RuleActionDef[] = [ACT_DRINK_FOUNTAIN];

// ---------------------------------------------------------------------------------------------
// Invariants

/**
 * Every fountain holds only known draught ids, sits on a floor tile, and no floor has more
 * fountains than `RunConfig.maxFountains`.
 */
registerInvariant('floors.fountains', (state) => {
  const problems: string[] = [];
  const max = state.config.maxFountains;
  const counts: Record<FloorId, number> = {};
  for (const e of Object.values(state.entities)) {
    if (e.feature?.kind !== 'fountain') continue;
    counts[e.floor] = (counts[e.floor] ?? 0) + 1;
    if (e.def !== DEFS.fountain) problems.push(`fountain ${e.id} has def "${e.def}"`);
    if (!Array.isArray(e.feature.draughts)) {
      problems.push(`fountain ${e.id} has no draught list`);
      continue;
    }
    for (const id of e.feature.draughts) if (!DRAUGHTS.has(id)) problems.push(`fountain ${e.id} holds unknown draught "${id}"`);
  }
  if (max !== undefined) {
    for (const [floor, n] of Object.entries(counts)) {
      if (n > max) problems.push(`floor "${floor}" has ${n} fountains, the config allows ${max}`);
    }
  }
  return problems;
});
