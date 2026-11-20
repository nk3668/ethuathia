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
 * - `act.drink_fountain` walks to the nearest known fountain that isn't dry or known to be harmful
 *   (ETH-094: skips any fountain whose next draught is identified in `floors.identifiedDraughts`
 *   with `outcome === 'bane'`, explaining the skip in the trace) and drinks; `cond.hurt_no_healing`
 *   is the baseline's reason to: HP below a share of the maximum and no healing potion carried.
 */
import { DRAUGHTS, healAmount, ITEMS } from '../../content';
import type { DraughtDef } from '../../content';
import type { Pos, Rng } from '../../core';
import { aiPathGrid, followMap } from '../ai/navigate';
import { defineCondition, defineRuleAction, noParams } from '../ai/types';
import type { AiCtx, ConditionDef, ParamParser, ResolveResult, RuleActionDef } from '../ai/types';
import { featureAt } from '../entities';
import { readParams } from '../gen/params';
import { defineGenStep, rectTiles } from '../gen/types';
import type { FloorDraft, GenStepDef, Rect } from '../gen/types';
import type { FloorPlan } from '../floorText';
import { buildGoalMap, UNREACHABLE } from '../goalMap';
import { registerInvariant } from '../invariants';
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

/**
 * The starting identified draughts a config asks for (ETH-094): validated against `DRAUGHTS` and
 * deduplicated in order. Throws on any unknown draught id.
 */
export function configIdentifiedDraughts(ids: readonly string[] | undefined): string[] {
  if (ids === undefined) return [];
  const out: string[] = [];
  for (const id of ids) {
    if (!DRAUGHTS.has(id)) throw new RangeError(`identifiedDraughts contains unknown draught "${id}"`);
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Reading fountains

/** The fountain at `pos` on `floorId` and its part, if there is one. */
export function fountainAt(state: RunState, floorId: FloorId, pos: Pos): (Entity & { feature: FountainPart }) | undefined {
  const e = featureAt(state, floorId, pos);
  return e?.feature?.kind === 'fountain' ? (e as Entity & { feature: FountainPart }) : undefined;
}

/** A remembered flowing fountain on a floor, with its next draught id. */
interface KnownFountain {
  pos: Pos;
  nextDraught: string;
}

/** Remembered fountains on `floorId` that weren't dry when last seen, in tile order. */
function rememberedFlowingFountains(state: RunState, floorId: FloorId): KnownFountain[] {
  const memory = getMemory(state, floorId);
  const { width } = memory.terrain;
  const out: KnownFountain[] = [];
  for (const key of Object.keys(memory.features)) {
    const i = Number(key);
    const f = memory.features[i]?.feature;
    if (f?.kind === 'fountain' && f.draughts.length > 0) {
      out.push({ pos: { x: i % width, y: Math.floor(i / width) }, nextDraught: f.draughts[0] as string });
    }
  }
  return out;
}

/** Where the party remembers fountains that weren't dry when last seen on `floorId`, in tile order. */
export function knownFlowingFountains(state: RunState, floorId: FloorId): Pos[] {
  return rememberedFlowingFountains(state, floorId).map((f) => f.pos);
}

/** True if `draughtId` is a known draught def whose outcome is harmful (`bane`, ETH-094). */
export function isHarmfulDraught(draughtId: string): boolean {
  return DRAUGHTS.has(draughtId) && DRAUGHTS.get(draughtId).outcome === 'bane';
}

/** True if the party has identified `draughtId` this run (ETH-094). */
export function isDraughtIdentified(state: RunState, draughtId: string): boolean {
  return state.domains.floors.identifiedDraughts.includes(draughtId);
}

/** True if `draughtId` has been identified by the party and its outcome is harmful (`bane`, ETH-094). */
export function isKnownHarmfulDraught(state: RunState, draughtId: string): boolean {
  return isDraughtIdentified(state, draughtId) && isHarmfulDraught(draughtId);
}

/** Lowercase draught names joined for a trace: "brackish water", "brackish water and bitter water". */
function draughtNames(ids: readonly string[]): string {
  const list = ids.map((id) => (DRAUGHTS.has(id) ? DRAUGHTS.get(id).name.toLowerCase() : id));
  return list.length <= 1 ? (list[0] ?? '') : `${list.slice(0, -1).join(', ')} and ${list.at(-1) as string}`;
}

/** Trace phrase explaining why one or more fountains were skipped (ETH-094). */
function describeSkippedFountains(draughtIds: readonly string[]): string {
  const verb = draughtIds.length === 1 ? 'is' : 'are';
  return `skipped fountain (${draughtNames(draughtIds)} ${verb} harmful)`;
}

/**
 * Whether `actor` carries a healing potion: any pack entry whose use heals its user (`healAmount`),
 * the same items the baseline's `act.quaff_healing` drinks (ETH-061).
 */
export function carriesHealingPotion(_state: RunState, actor: ActorEntity): boolean {
  return inventoryOf(actor).some((item) => ITEMS.has(item.def) && healAmount(ITEMS.get(item.def)) > 0);
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

/** Walk to the nearest known fountain that isn't dry or known to be harmful, and drink from it. */
export const ACT_DRINK_FOUNTAIN = defineRuleAction({
  id: 'act.drink_fountain',
  name: 'Drink from a fountain',
  description:
    'Walk to the nearest fountain on this floor that the party has seen and that isn’t dry, and drink from it. ' +
    'Most draughts mend wounds, but some do nothing and a few sit badly. Skips any fountain whose next draught ' +
    'has been identified as harmful. Can’t be done before a usable fountain is found.',
  parse: noParams,
  resolve(ctx: AiCtx): ResolveResult {
    const { state, actor } = ctx;
    const here = fountainAt(state, actor.floor, actor.pos);
    let skippedHere: string | null = null;
    if (here !== undefined && here.feature.draughts.length > 0) {
      const next = here.feature.draughts[0] as string;
      if (!isKnownHarmfulDraught(state, next)) {
        return { request: { id: 'drink' }, detail: 'drinking from the fountain' };
      }
      skippedHere = next;
    }

    const remembered = rememberedFlowingFountains(state, actor.floor);
    const safe: Pos[] = [];
    const harmful: KnownFountain[] = [];
    for (const f of remembered) {
      if (f.pos.x === actor.pos.x && f.pos.y === actor.pos.y) continue;
      if (isKnownHarmfulDraught(state, f.nextDraught)) harmful.push(f);
      else safe.push(f.pos);
    }
    if (safe.length === 0 && harmful.length === 0 && skippedHere === null) return null;

    const paths = aiPathGrid(ctx);
    const safeMap = safe.length > 0 ? buildGoalMap(paths, safe) : null;
    const safeCost = safeMap === null ? UNREACHABLE : safeMap.get(actor.pos.x, actor.pos.y);

    const skippedDraughts: string[] = [];
    const note = (id: string) => {
      if (!skippedDraughts.includes(id)) skippedDraughts.push(id);
    };
    if (skippedHere !== null) note(skippedHere);
    for (const f of harmful) {
      const cost = buildGoalMap(paths, [f.pos]).get(actor.pos.x, actor.pos.y);
      if (cost !== UNREACHABLE && (safeCost === UNREACHABLE || cost <= safeCost)) note(f.nextDraught);
    }

    if (safeMap !== null && safeCost !== UNREACHABLE) {
      const base = `heading for a fountain, ${safeCost} ${safeCost === 1 ? 'turn' : 'turns'} away`;
      const detail = skippedDraughts.length === 0 ? base : `${base}; ${describeSkippedFountains(skippedDraughts)}`;
      return followMap(ctx, paths, safeMap, detail);
    }

    return skippedDraughts.length > 0 ? { skipped: describeSkippedFountains(skippedDraughts) } : null;
  },
  describe: () => 'drink from the nearest fountain',
});

export const FOUNTAIN_CONDITIONS: readonly ConditionDef[] = [COND_HURT_NO_HEALING];
export const FOUNTAIN_RULE_ACTIONS: readonly RuleActionDef[] = [ACT_DRINK_FOUNTAIN];

// ---------------------------------------------------------------------------------------------
// Invariants

/**
 * Every fountain holds only known draught ids, sits on a floor tile, no floor has more
 * fountains than `RunConfig.maxFountains`, and `identifiedDraughts` holds unique known draught ids.
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
  const identified = state.domains.floors.identifiedDraughts;
  if (!Array.isArray(identified)) {
    problems.push('floors state has no identifiedDraughts list');
  } else {
    if (new Set(identified).size !== identified.length) problems.push('a draught is recorded as identified twice');
    for (const id of identified) if (!DRAUGHTS.has(id)) problems.push(`identifiedDraughts holds unknown draught "${id}"`);
  }
  return problems;
});
