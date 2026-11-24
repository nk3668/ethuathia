/**
 * Monsters as entities: building one from its def, placing one by hand (tests), and the
 * `gen.monsters` generation step that stocks each floor.
 */
import { clampRange, clonePlain, Grid, Rng, seedState } from '../../core';
import type { Pos } from '../../core';
import { MONSTERS, monsterRules, templateDefs } from '../../content';
import type { DungeonDef, DungeonEcology, MonsterDef } from '../../content';
import { newAiPart } from '../ai/types';
import { actorsAt, addEntity, blockerAt, featureAt, getFloor } from '../entities';
import { floorDanger, runDungeon } from '../floors/dungeon';
import type { NewEntity } from '../entities';
import { readParams } from '../gen/params';
import { defineGenStep } from '../gen/types';
import type { Rect } from '../gen/types';
import { Terrain } from '../state';
import type { Entity, FloorId, RunState } from '../state';
import { fillVitals, newStatsPart } from '../stats/getStat';
import { populateEncounters } from './encounters';
import { withGroupAiRules } from './groupAi';
import type { MonsterAlert, MonsterPatrol } from './groupAi';
import { computeOodDanger, computeTemplateChance } from './ood';
import { overlayProblems, rollTemplates, spawnHp } from './overlay';
import type { MonsterOverlay } from './overlay';

/** A monster's per-entity combat state. */
export interface MonsterPart {
  /** True once a party member has seen it (`monsterSighted` was emitted). */
  sighted: boolean;
  /** True when spawned out-of-depth above the floor's normal Danger band (ETH-134). */
  ood?: true;
  /** What is layered on its def (ETH-117): templates, a name, stat changes, carried items. Absent on a plain monster. */
  overlay?: MonsterOverlay;
  /** Shared encounter pack/squad id on the floor (ETH-135). */
  groupId?: number;
  /** Room rectangle that an unalerted room encounter tethers to (ETH-135). */
  homeRoom?: Rect;
  /** Active threat memory `{ pos, untilTurn }` for group alert and pursuit (ETH-135). */
  alert?: MonsterAlert;
  /** Corridor patrol waypoint loop and next target index (ETH-135). */
  patrol?: MonsterPatrol;
}

/** Optional OOD, group, room-tether, alert, and patrol state attached when creating or spawning a monster. */
export interface NewMonsterOptions {
  ood?: true;
  groupId?: number;
  homeRoom?: Rect;
  alert?: MonsterAlert;
  patrol?: MonsterPatrol;
}

/**
 * A new monster of `def` at `pos`, ready for `addEntity` or a floor plan's `spawns`: full HP, the
 * rules of its role (its templates' role, if one changes it, adapted with `withGroupAiRules`), and
 * `overlay` / `options` when given. The overlay is copied and not checked here (`spawnMonster`
 * checks it).
 */
export function newMonster(
  def: MonsterDef,
  pos: Pos,
  overlay?: MonsterOverlay,
  options?: NewMonsterOptions,
): Omit<NewEntity, 'floor'> {
  const { hp, damage, accuracy, evasion, armor, speed, sight } = def.stats;
  const kept = overlay === undefined || Object.keys(overlay).length === 0 ? undefined : clonePlain(overlay);
  const monster: MonsterPart = { sighted: false };
  if (options?.ood === true) monster.ood = true;
  if (kept !== undefined) monster.overlay = kept;
  if (options?.groupId !== undefined) monster.groupId = options.groupId;
  if (options?.homeRoom !== undefined) monster.homeRoom = clonePlain(options.homeRoom);
  if (options?.alert !== undefined) monster.alert = clonePlain(options.alert);
  if (options?.patrol !== undefined) monster.patrol = clonePlain(options.patrol);

  const rules = withGroupAiRules(monsterRules(def, templateDefs(kept?.templates)), {
    hasHomeRoom: monster.homeRoom !== undefined,
    hasPatrol: monster.patrol !== undefined,
    hasGroup: monster.groupId !== undefined,
  });

  return {
    def: def.id,
    pos: { x: pos.x, y: pos.y },
    actor: { energy: 0, hp: spawnHp(def, kept), mp: 0, faction: 'monster' },
    stats: newStatsPart({ hp, damage, accuracy, evasion, armor, speed, ...(sight === undefined ? {} : { sight }) }),
    ai: newAiPart(
      rules.map((r) => ({
        condition: r.condition.params === undefined ? { id: r.condition.id } : { id: r.condition.id, params: r.condition.params },
        action: r.action.params === undefined ? { id: r.action.id } : { id: r.action.id, params: r.action.params },
        enabled: true,
      })),
    ),
    monster,
  };
}

/**
 * Puts a monster of def `defId` on a built floor at `pos` and returns it, at full HP. For
 * hand-built test maps, summons and profile-made monsters (a nemesis, an heirloom carrier), which
 * pass an `overlay` (ETH-117), or `options` (OOD/group/homeRoom/patrol, ETH-135). Throws on an
 * unknown def, a malformed overlay, a wall, or a tile someone it can't share with already stands on.
 */
export function spawnMonster(
  state: RunState,
  defId: string,
  floorId: FloorId,
  pos: Pos,
  overlay?: MonsterOverlay,
  options?: NewMonsterOptions,
): Entity {
  const def = MONSTERS.get(defId);
  const problems = overlay === undefined ? [] : overlayProblems(overlay, defId);
  if (problems.length > 0) throw new RangeError(`Bad overlay for a ${def.name}: ${problems.join('; ')}`);
  const template = { ...newMonster(def, pos, overlay, options), floor: floorId };
  if (Grid.wrap(getFloor(state, floorId).terrain).get(pos.x, pos.y) !== Terrain.Floor) {
    throw new RangeError(`Can't put a ${def.name} inside a wall at (${pos.x}, ${pos.y})`);
  }
  const probe = { ...template, id: 0 } as Entity;
  const blocker = blockerAt(state, probe, floorId, pos);
  if (blocker !== undefined) throw new RangeError(`(${pos.x}, ${pos.y}) on "${floorId}" is taken by entity ${blocker.id}`);
  const monster = addEntity(state, template);
  // Run-wide modifiers (ETH-115) may change max HP beyond what `spawnHp` sees.
  fillVitals(state, monster);
  return monster;
}

function ecologyMatches(def: MonsterDef, ecology?: DungeonEcology): boolean {
  if (ecology === undefined) return true;
  if (ecology.allowTags !== undefined && !ecology.allowTags.some((t) => def.tags.includes(t))) return false;
  if (ecology.denyTags !== undefined && ecology.denyTags.some((t) => def.tags.includes(t))) return false;
  return true;
}

/**
 * Effective spawn weight of `def` at `danger` under optional `ecology`: linearly tapers from `1.0`
 * at `peak ?? (min + max) / 2` down to `0.25` at the furthest edge inside `[min, max]` (`0`
 * outside or when excluded by `ecology`), multiplied by `def.weight` and ecology tag weights.
 */
export function monsterWeightAt(def: MonsterDef, danger: number, ecology?: DungeonEcology): number {
  const { min, max } = def.danger;
  if (danger < min || danger > max || !ecologyMatches(def, ecology)) return 0;
  const peak = def.danger.peak ?? (min + max) / 2;
  const span = Math.max(peak - min, max - peak);
  const taper = span <= 0 ? 1 : 1 - 0.75 * (Math.abs(danger - peak) / span);
  const tagMul =
    ecology?.tagWeights === undefined ? 1 : def.tags.reduce((mul, tag) => mul * (ecology.tagWeights?.[tag] ?? 1), 1);
  return Math.max(0, def.weight * taper * tagMul);
}

/** The monster defs that can appear at `danger` under optional `ecology`, in registration order. */
export function monstersForDanger(danger: number, ecology?: DungeonEcology): MonsterDef[] {
  return MONSTERS.all().filter((m) => monsterWeightAt(m, danger, ecology) > 0);
}

/** One def picked from `defs` with chance proportional to `weight`. One draw. */
export function pickWeighted(defs: readonly MonsterDef[], rng: Rng): MonsterDef {
  const total = defs.reduce((n, d) => n + d.weight, 0);
  let roll = rng.int(1, total);
  for (const d of defs) {
    roll -= d.weight;
    if (roll <= 0) return d;
  }
  return defs[defs.length - 1] as MonsterDef;
}

/** One def picked from `defs` proportional to `monsterWeightAt(d, danger, ecology)`. One draw. */
export function pickWeightedForDanger(
  defs: readonly MonsterDef[],
  danger: number,
  rng: Rng,
  ecology?: DungeonEcology,
): MonsterDef {
  const weights = defs.map((d) => monsterWeightAt(d, danger, ecology));
  const total = weights.reduce((n, w) => n + w, 0);
  if (total <= 0) return pickWeighted(defs, rng);
  let roll = rng.float() * total;
  for (let i = 0; i < defs.length; i++) {
    roll -= weights[i] as number;
    if (roll < 0) return defs[i] as MonsterDef;
  }
  return defs[defs.length - 1] as MonsterDef;
}

/**
 * Pure Wave-2 extension hook: resolves template spawn probability from `dungeon.encounters.templateRamp`
 * at `danger`, or returns `fallback` (default `0`) when no ramp is configured.
 */
export function templateChanceFor(dungeon: DungeonDef | undefined, danger: number, fallback = 0): number {
  return computeTemplateChance(dungeon, danger, fallback);
}

/**
 * Pure Wave-2 extension hook: rolls out-of-depth (OOD) Danger elevation when `ETH-134` enables it.
 */
export function rollOodDanger(
  dungeon: DungeonDef | undefined,
  danger: number,
  rng: Rng,
): { danger: number; ood: boolean } {
  return computeOodDanger(dungeon, danger, rng);
}

/** Tunable options for repopulating an already-visited floor (ETH-025). */
export interface RespawnOptions {
  /** Minimum monsters to spawn (defaults scale lightly with depth). */
  min?: number;
  /** Maximum monsters to spawn (defaults scale lightly with depth). */
  max?: number;
  /**
   * Added to the floor's Danger when picking return-trip monsters, so climbing back out pits the
   * party against stronger creatures than it met going down (default 1; tuned in ETH-080).
   */
  depthShift?: number;
  /** Minimum Chebyshev distance from the arrival stairs and living party members (default 7). */
  stairsDistance?: number;
  /** Chance per respawned monster to roll a template (default 0). */
  templateChance?: number;
}

/** Default depth boost for return-trip monsters (ETH-025; tuned in ETH-080). */
export const DEFAULT_RESPAWN_DEPTH_SHIFT = 1;

/** Default minimum Chebyshev distance from the arrival stairs when repopulating a floor. */
export const DEFAULT_RESPAWN_STAIRS_DISTANCE = 7;

/**
 * Spawns a deterministic wave of monsters on an already-built floor away from `arrivalPos` and
 * any living party members on that floor (ETH-025). Draws only from a per-floor, per-wave seed
 * (`respawn/<floor>/<wave>`), so shared RNG streams are never shifted. Returns how many monsters
 * were placed.
 */
export function respawnFloor(
  state: RunState,
  floorId: FloorId,
  arrivalPos: Pos,
  wave: number,
  options: RespawnOptions = {},
): number {
  const floor = getFloor(state, floorId);
  const depth = floor.depth;
  const depthShift = options.depthShift ?? DEFAULT_RESPAWN_DEPTH_SHIFT;
  const ecology = runDungeon(state).ecology;
  const baseDanger = floorDanger(state, depth);
  const allDefs = MONSTERS.all();
  if (allDefs.length === 0) return 0;
  const maxDefDanger = allDefs.reduce((m, d) => Math.max(m, d.danger.max), baseDanger);
  const effectiveDanger = Math.max(1, Math.min(maxDefDanger, baseDanger + depthShift));
  const defs = monstersForDanger(effectiveDanger, ecology);
  const pool = defs.length > 0 ? defs : monstersForDanger(baseDanger, ecology);
  if (pool.length === 0) return 0;
  const poolDanger = defs.length > 0 ? effectiveDanger : baseDanger;

  const defaultMin = Math.max(1, Math.round((1 + 0.4 * depth) * 0.4));
  const defaultMax = Math.max(defaultMin, Math.round((1 + 0.4 * depth) * 0.7));
  const { min, max } = clampRange(options, { min: defaultMin, max: defaultMax });
  const stairsDistance = Math.max(0, options.stairsDistance ?? DEFAULT_RESPAWN_STAIRS_DISTANCE);
  const templateChance = options.templateChance ?? 0;

  const rng = new Rng(seedState(state.seed, `respawn/${floorId}/${wave}`));
  const count = rng.int(min, max);
  if (count <= 0) return 0;

  const avoid: Pos[] = [arrivalPos];
  for (const id of state.party) {
    const member = state.entities[id];
    if (member?.actor !== undefined && member.actor.hp > 0 && member.floor === floorId) avoid.push(member.pos);
  }

  const terrain = Grid.wrap(floor.terrain);
  const tiles: Pos[] = [];
  for (let y = 0; y < terrain.height; y++) {
    for (let x = 0; x < terrain.width; x++) {
      if (terrain.get(x, y) !== Terrain.Floor) continue;
      const pos = { x, y };
      if (featureAt(state, floorId, pos) !== undefined) continue;
      if (actorsAt(state, floorId, pos).length > 0) continue;
      if (avoid.some((a) => Math.max(Math.abs(a.x - x), Math.abs(a.y - y)) < stairsDistance)) continue;
      tiles.push(pos);
    }
  }

  let placed = 0;
  for (let i = 0; i < count && tiles.length > 0; i++) {
    const def = pickWeightedForDanger(pool, poolDanger, rng, ecology);
    const at = rng.int(0, tiles.length - 1);
    const [pos] = tiles.splice(at, 1) as [Pos];
    const templates = rollTemplates(def, rng, templateChance);
    spawnMonster(state, def.id, floorId, pos, templates.length === 0 ? undefined : { templates });
    placed++;
  }
  return placed;
}

/**
 * Stocks a floor with monsters: `base + perDepth × depth` of them (rounded), each a def that can
 * appear at the floor's Danger picked by peak-weighted selection, on a free room tile at least
 * `stairsDistance` tiles from every stairs, so nobody arrives into a fight. Draws only from the
 * floor's own RNG. With `templateChance` above 0 (ETH-117), each monster may get up to
 * `MAX_TEMPLATES` templates (`rollTemplates`); at 0, the default, nothing more is drawn, so floors
 * come out as before.
 */
export const GEN_MONSTERS = defineGenStep({
  id: 'gen.monsters',
  name: 'Place monsters',
  description:
    'Puts monsters in the rooms, more on deeper floors, picked by how common each kind is at that Danger and kept ' +
    'away from the stairs. A floor type can ask for some of them to be variants (Venomous, Swift and so on).',
  parse(raw) {
    return readParams(raw, {
      base: { default: 1, min: 0, max: 100 },
      perDepth: { default: 0.4, min: 0, max: 20 },
      stairsDistance: { default: 7, min: 0, max: 100, integer: true },
      templateChance: { default: 0, min: 0, max: 1 },
    });
  },
  run(draft, p, rng) {
    populateEncounters(draft, p, rng);
  },
});
