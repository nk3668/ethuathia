/**
 * Monsters as entities: building one from its def, placing one by hand (tests), and the
 * `gen.monsters` generation step that stocks each floor.
 */
import { clonePlain, Grid } from '../../core';
import type { Pos, Rng } from '../../core';
import { MONSTERS, monsterRules, templateDefs } from '../../content';
import type { MonsterDef } from '../../content';
import { newAiPart } from '../ai/types';
import { addEntity, blockerAt, getFloor } from '../entities';
import type { NewEntity } from '../entities';
import { readParams } from '../gen/params';
import { defineGenStep, rectTiles } from '../gen/types';
import { Terrain } from '../state';
import type { Entity, FloorId, RunState } from '../state';
import { fillVitals, newStatsPart } from '../stats/getStat';
import { overlayProblems, rollTemplates, spawnHp } from './overlay';
import type { MonsterOverlay } from './overlay';

/** A monster's per-entity combat state. */
export interface MonsterPart {
  /** True once a party member has seen it (`monsterSighted` was emitted). */
  sighted: boolean;
  /** What is layered on its def (ETH-117): templates, a name, stat changes, carried items. Absent on a plain monster. */
  overlay?: MonsterOverlay;
}

/**
 * A new monster of `def` at `pos`, ready for `addEntity` or a floor plan's `spawns`: full HP, the
 * rules of its role (its templates' role, if one changes it), and `overlay` when given. The
 * overlay is copied and not checked here (`spawnMonster` checks it).
 */
export function newMonster(def: MonsterDef, pos: Pos, overlay?: MonsterOverlay): Omit<NewEntity, 'floor'> {
  const { hp, damage, accuracy, evasion, armor, speed, sight } = def.stats;
  const kept = overlay === undefined || Object.keys(overlay).length === 0 ? undefined : clonePlain(overlay);
  return {
    def: def.id,
    pos: { x: pos.x, y: pos.y },
    actor: { energy: 0, hp: spawnHp(def, kept), mp: 0, faction: 'monster' },
    stats: newStatsPart({ hp, damage, accuracy, evasion, armor, speed, ...(sight === undefined ? {} : { sight }) }),
    ai: newAiPart(
      monsterRules(def, templateDefs(kept?.templates)).map((r) => ({
        condition: r.condition.params === undefined ? { id: r.condition.id } : { id: r.condition.id, params: r.condition.params },
        action: r.action.params === undefined ? { id: r.action.id } : { id: r.action.id, params: r.action.params },
        enabled: true,
      })),
    ),
    monster: kept === undefined ? { sighted: false } : { sighted: false, overlay: kept },
  };
}

/**
 * Puts a monster of def `defId` on a built floor at `pos` and returns it, at full HP. For
 * hand-built test maps, summons and profile-made monsters (a nemesis, an heirloom carrier), which
 * pass an `overlay` (ETH-117). Throws on an unknown def, a malformed overlay, a wall, or a tile
 * someone it can't share with already stands on.
 */
export function spawnMonster(state: RunState, defId: string, floorId: FloorId, pos: Pos, overlay?: MonsterOverlay): Entity {
  const def = MONSTERS.get(defId);
  const problems = overlay === undefined ? [] : overlayProblems(overlay, defId);
  if (problems.length > 0) throw new RangeError(`Bad overlay for a ${def.name}: ${problems.join('; ')}`);
  const template = { ...newMonster(def, pos, overlay), floor: floorId };
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

/** The monster defs that can appear at `depth`, in registration order. */
export function monstersForDepth(depth: number): MonsterDef[] {
  return MONSTERS.all().filter((m) => m.depth.min <= depth && depth <= m.depth.max);
}

/** One def picked from `defs` with chance proportional to `weight`. One draw. */
function pickWeighted(defs: readonly MonsterDef[], rng: Rng): MonsterDef {
  const total = defs.reduce((n, d) => n + d.weight, 0);
  let roll = rng.int(1, total);
  for (const d of defs) {
    roll -= d.weight;
    if (roll <= 0) return d;
  }
  return defs[defs.length - 1] as MonsterDef;
}

/**
 * Stocks a floor with monsters: `base + perDepth × depth` of them (rounded), each a def that can
 * appear at the floor's depth picked by weight, on a free room tile at least `stairsDistance`
 * tiles from every stairs, so nobody arrives into a fight. Draws only from the floor's own RNG.
 * With `templateChance` above 0 (ETH-117), each monster may get up to `MAX_TEMPLATES` templates
 * (`rollTemplates`); at 0, the default, nothing more is drawn, so floors come out as before.
 */
export const GEN_MONSTERS = defineGenStep({
  id: 'gen.monsters',
  name: 'Place monsters',
  description:
    'Puts monsters in the rooms, more on deeper floors, picked by how common each kind is at that depth and kept ' +
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
    const defs = monstersForDepth(draft.depth);
    const count = Math.round(p.base + p.perDepth * draft.depth);
    if (defs.length === 0 || count <= 0) return;
    const stairs = draft.features.filter((f) => f.feature.kind === 'stairs').map((f) => f.pos);
    const taken = new Set(draft.features.map((f) => f.pos.y * draft.terrain.width + f.pos.x));
    const tiles = draft.rooms
      .flatMap(rectTiles)
      .filter(
        (t) =>
          draft.terrain.get(t.x, t.y) === Terrain.Floor &&
          !taken.has(t.y * draft.terrain.width + t.x) &&
          stairs.every((s) => Math.max(Math.abs(s.x - t.x), Math.abs(s.y - t.y)) >= p.stairsDistance),
      );
    for (let i = 0; i < count && tiles.length > 0; i++) {
      const def = pickWeighted(defs, rng);
      const at = rng.int(0, tiles.length - 1);
      const [pos] = tiles.splice(at, 1) as [Pos];
      const templates = rollTemplates(def, rng, p.templateChance);
      draft.spawns.push(newMonster(def, pos, templates.length === 0 ? undefined : { templates }));
    }
  },
});
