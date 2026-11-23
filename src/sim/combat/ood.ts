/**
 * Depth-ramped template probability and out-of-depth (OOD) Danger elevation (ETH-134).
 *
 * Pure helpers driven by `DungeonDef.encounters`: `templateRamp` keeps templates at 0% on
 * Danger 1–2 and ramps smoothly from Danger 3+, while `ood` grants a small chance (~5% from
 * Danger 3+) to elevate an encounter's Danger by `+2` when eligible deeper monsters exist.
 */
import type { Rng } from '../../core';
import { MONSTERS } from '../../content';
import type { DungeonDef, DungeonEcology, MonsterDef } from '../../content';
import { defineChronicleKind } from '../run/chronicle';

/** Highlight and chronicle kind id when an out-of-depth monster is spotted. */
export const HIGHLIGHT_OOD_ID = 'oodSighted';

/** Run chronicle moment kind for spotting an out-of-depth monster (priority 35). */
export const CHRONICLE_OOD_SIGHTED = defineChronicleKind({ id: HIGHLIGHT_OOD_ID, priority: 35 });

function matchesEcology(def: MonsterDef, ecology?: DungeonEcology): boolean {
  if (ecology === undefined) return true;
  if (ecology.allowTags !== undefined && !ecology.allowTags.some((t) => def.tags.includes(t))) return false;
  if (ecology.denyTags !== undefined && ecology.denyTags.some((t) => def.tags.includes(t))) return false;
  return true;
}

/**
 * Resolves template spawn probability from `dungeon.encounters.templateRamp` at `danger`, or
 * returns `fallback` (clamped to `[0, 1]`, default `0`) when no ramp is configured.
 */
export function computeTemplateChance(dungeon: DungeonDef | undefined, danger: number, fallback = 0): number {
  const ramp = dungeon?.encounters?.templateRamp;
  if (ramp === undefined) return Math.max(0, Math.min(1, fallback));
  if (danger < ramp.minDanger) return 0;
  const raw = ramp.base + (danger - ramp.minDanger) * ramp.perDanger;
  return Math.max(0, Math.min(1, Math.min(ramp.max, raw)));
}

/**
 * Rolls out-of-depth Danger elevation from `dungeon.encounters.ood` using `rng`.
 *
 * Returns `{ danger, ood: false }` without drawing from `rng` when no OOD curve is set, `danger`
 * is below `ood.minDanger`, or `chance`/`boost` are non-positive. Only marks `ood: true` when
 * Danger actually shifts upward and at least one monster matching `dungeon.ecology` exists at that
 * elevated Danger.
 */
export function computeOodDanger(
  dungeon: DungeonDef | undefined,
  danger: number,
  rng: Rng,
): { danger: number; ood: boolean } {
  const ood = dungeon?.encounters?.ood;
  if (ood === undefined || danger < ood.minDanger || ood.chance <= 0 || ood.boost <= 0) {
    return { danger, ood: false };
  }
  if (!rng.chance(ood.chance)) return { danger, ood: false };
  const elevated = danger + ood.boost;
  if (elevated <= danger) return { danger, ood: false };
  const hasMonster = MONSTERS.all().some(
    (def) =>
      elevated >= def.danger.min &&
      elevated <= def.danger.max &&
      def.danger.min > danger &&
      matchesEcology(def, dungeon?.ecology),
  );
  return hasMonster ? { danger: elevated, ood: true } : { danger, ood: false };
}
