/**
 * Squad blueprints (ETH-135): data-driven encounter archetypes defined over monster roles
 * (`brute`, `skirmisher`, `caster`, `support`, `swarm`) and minimum floor Danger, with zero
 * hardcoded monster ids. Any monster registered in `MONSTERS` automatically integrates into
 * matching blueprints by Danger band, role, and family tags.
 *
 * Kept outside `CONTENT_KINDS` because squad blueprints are generation patterns rather than
 * player-facing Codex entries. Validated strictly via `squadBlueprintSchema`.
 */
import { z } from 'zod';
import type { Def } from '../core';
import { MONSTER_ROLES } from './monsters';
import type { MonsterRole } from './monsters';
import { defShape, nonNegativeInt, positiveInt } from './schema';

/** One role slot in a squad pattern and its inclusive spawn count bounds. */
export interface SquadSlot {
  /** Allowed monster roles for this slot, selected dynamically at generation time. */
  readonly roles: readonly MonsterRole[];
  /** Inclusive count bounds (`0 <= min <= max`, `max >= 1`). */
  readonly min: number;
  readonly max: number;
}

/** A reusable, role-based room or patrol encounter pattern. */
export interface SquadBlueprint extends Def {
  /** Minimum floor Danger required before this blueprint may appear. */
  readonly minDanger: number;
  /** Relative selection weight among blueprints eligible at a Danger rating. */
  readonly weight: number;
  /** Role slots that compose an encounter of this pattern. */
  readonly slots: readonly SquadSlot[];
  /** When true, prefer monsters sharing at least one family/ecology tag within the squad. */
  readonly preferSameTag?: boolean;
  /** When true, this pattern is eligible for multi-monster corridor patrols. */
  readonly patrolEligible?: boolean;
}

export const squadSlotSchema: z.ZodType<SquadSlot> = z
  .strictObject({
    roles: z.array(z.enum(MONSTER_ROLES)).min(1, 'needs at least one role'),
    min: nonNegativeInt,
    max: positiveInt,
  })
  .refine((slot) => slot.min <= slot.max, { message: 'min must not exceed max', path: ['min'] });

export const squadBlueprintSchema: z.ZodType<SquadBlueprint> = z
  .strictObject({
    ...defShape('squad'),
    minDanger: positiveInt,
    weight: positiveInt,
    slots: z.array(squadSlotSchema).min(1, 'needs at least one slot'),
    preferSameTag: z.boolean().optional(),
    patrolEligible: z.boolean().optional(),
  })
  .refine((bp) => bp.slots.reduce((total, slot) => total + slot.min, 0) >= 1, {
    message: 'total minimum monsters across slots must be at least 1',
    path: ['slots'],
  });

export const SQUAD_SOLO_SCOUT: SquadBlueprint = {
  id: 'squad.solo_scout',
  name: 'Solo scout',
  description: 'A lone skirmisher or brute prowling ahead of larger dens, giving shallow floors readable early fights.',
  tags: ['encounter'],
  minDanger: 1,
  weight: 5,
  slots: [{ roles: ['skirmisher', 'brute'], min: 1, max: 1 }],
};

export const SQUAD_SWARM_PACK: SquadBlueprint = {
  id: 'squad.swarm_pack',
  name: 'Swarm pack',
  description: 'A tight cluster of kindred swarmers that spreads around exposed intruders.',
  tags: ['encounter'],
  minDanger: 1,
  weight: 4,
  preferSameTag: true,
  slots: [{ roles: ['swarm'], min: 2, max: 4 }],
};

export const SQUAD_KIN_AND_TENDER: SquadBlueprint = {
  id: 'squad.kin_and_tender',
  name: 'Kin & tender',
  description: 'A cluster of frontliners backed by a support creature that mends and bolsters its kin.',
  tags: ['encounter'],
  minDanger: 3,
  weight: 5,
  preferSameTag: true,
  slots: [
    { roles: ['swarm', 'brute'], min: 2, max: 3 },
    { roles: ['support'], min: 1, max: 1 },
  ],
};

export const SQUAD_SHIELD_AND_BOLT: SquadBlueprint = {
  id: 'squad.shield_and_bolt',
  name: 'Shield & bolt',
  description: 'Frontline brutes holding doorways while casters fire bolts from behind them.',
  tags: ['encounter'],
  minDanger: 4,
  weight: 5,
  slots: [
    { roles: ['brute'], min: 1, max: 2 },
    { roles: ['caster'], min: 1, max: 2 },
  ],
};

export const SQUAD_HUNTING_PACK: SquadBlueprint = {
  id: 'squad.hunting_pack',
  name: 'Hunting pack',
  description: 'A mobile pack of skirmishers suited to flanking rooms and patrolling corridors.',
  tags: ['encounter'],
  minDanger: 5,
  weight: 4,
  patrolEligible: true,
  slots: [{ roles: ['skirmisher'], min: 2, max: 4 }],
};

export const SQUAD_DEEP_WARBAND: SquadBlueprint = {
  id: 'squad.deep_warband',
  name: 'Deep warband',
  description: 'A combined-arms warband pairing heavy brutes with ranged fire, support, and flanking swarmers.',
  tags: ['encounter'],
  minDanger: 7,
  weight: 5,
  slots: [
    { roles: ['brute'], min: 1, max: 2 },
    { roles: ['caster'], min: 1, max: 1 },
    { roles: ['support'], min: 1, max: 1 },
    { roles: ['swarm'], min: 0, max: 2 },
  ],
};

/** All shipped role/tag squad patterns, validated at load time. */
export const SQUAD_BLUEPRINTS: readonly SquadBlueprint[] = [
  SQUAD_SOLO_SCOUT,
  SQUAD_SWARM_PACK,
  SQUAD_KIN_AND_TENDER,
  SQUAD_SHIELD_AND_BOLT,
  SQUAD_HUNTING_PACK,
  SQUAD_DEEP_WARBAND,
];

/** Returns human-readable validation problems for a list of squad blueprints (empty when valid). */
export function squadBlueprintProblems(blueprints: readonly SquadBlueprint[] = SQUAD_BLUEPRINTS): string[] {
  const problems: string[] = [];
  if (blueprints.length === 0) problems.push('SQUAD_BLUEPRINTS must not be empty');
  const seen = new Set<string>();
  for (let i = 0; i < blueprints.length; i++) {
    const bp = blueprints[i] as SquadBlueprint;
    const label = typeof bp?.id === 'string' && bp.id !== '' ? `squad "${bp.id}"` : `squad #${i + 1}`;
    const parsed = squadBlueprintSchema.safeParse(bp);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const path = issue.path.length === 0 ? '(def)' : issue.path.join('.');
        problems.push(`${label}: ${path}: ${issue.message}`);
      }
    }
    if (typeof bp?.id === 'string' && bp.id !== '') {
      if (seen.has(bp.id)) problems.push(`duplicate squad blueprint id "${bp.id}"`);
      seen.add(bp.id);
    }
  }
  return problems;
}

/** Throws if any blueprint in `blueprints` fails schema or uniqueness validation. */
export function validateSquadBlueprints(blueprints: readonly SquadBlueprint[] = SQUAD_BLUEPRINTS): void {
  const problems = squadBlueprintProblems(blueprints);
  if (problems.length > 0) {
    throw new Error(`Invalid squad blueprints:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
  }
}

/** Blueprints eligible at `danger`, optionally filtered to patrol-capable patterns. */
export function squadsForDanger(
  danger: number,
  options: { patrolOnly?: boolean; blueprints?: readonly SquadBlueprint[] } = {},
): SquadBlueprint[] {
  const list = options.blueprints ?? SQUAD_BLUEPRINTS;
  return list.filter(
    (bp) => bp.minDanger <= danger && (options.patrolOnly !== true || bp.patrolEligible === true),
  );
}

/** Finds a shipped blueprint by id, or `undefined`. */
export function findSquadBlueprint(id: string): SquadBlueprint | undefined {
  return SQUAD_BLUEPRINTS.find((bp) => bp.id === id);
}

validateSquadBlueprints(SQUAD_BLUEPRINTS);
