/**
 * Town buildings and upgrade nodes (CLAUDE.md §4, docs/ARCHITECTURE.md §6.2).
 *
 * A **building** is a Town panel with its own upgrade tree (`building.guild_hall`). An **upgrade
 * node** belongs to one building and sits on a tier row of its tree. It costs currency, may need
 * other nodes of the same building first, may be one of a pick-one group, and grants things to
 * every later run. The engine that buys and respecs nodes is in `src/meta/upgrades.ts`; the
 * Town tab draws any building's tree from these defs alone. A new building is a building def,
 * its nodes and one import line in `town/index.ts`, with no engine change.
 *
 * Tree rules (CLAUDE.md §4), checked by `UPGRADE_KIND.check`:
 * - a prerequisite is a node of the same building on an earlier tier, so trees have no cycles;
 * - a pick-one group (`exclusiveGroup`) has two or more nodes, all on one tier of one building;
 * - no two nodes of a building share a tier and column;
 * - a ranked node (ETH-172) may only have `capacity` and `bundle` grants, as an `unlock` can't stack.
 *
 * **Ranks** let a node be bought several times (`ranks`); **tier gates** keep a building's higher
 * rows locked until a milestone is met (`BuildingDef.tierGates`). Both are engine features with
 * no content yet; `src/meta/upgrades.ts` does the buying.
 */
import { z } from 'zod';
import { Registry } from '../core';
import type { Def } from '../core';
import { bundleRefs, bundleSchema } from './bundles';
import type { Bundle } from './bundles';
import type { ContentKind, ContentRef } from './kind';
import { milestoneRefs, milestoneSchema } from './milestones';
import type { Milestone } from './milestones';
import { defShape, idSchema, positiveInt } from './schema';

// --- Buildings -------------------------------------------------------------------------------

/**
 * The two kinds of upgrade tree (CLAUDE.md §4). Both can be reset or changed between runs, never
 * during one. They differ only in the respec fee: Foundations may charge one (the constant in
 * `src/meta/upgrades.ts`, 0 for now); Tactics are always free.
 */
export type TreeKind = 'foundations' | 'tactics';

/** Names and tooltip text for each tree kind, for the Town tab. */
export const TREE_KIND_INFO = {
  foundations: {
    name: 'Foundation',
    about:
      'A lasting investment in the guild: party, gear, maps and the town itself. It can be reset or ' +
      'changed between runs, never during one. A respec fee may apply (currently none).',
  },
  tactics: {
    name: 'Tactic',
    about:
      'A way of playing: rules, doctrine and class talents. It can be reset or changed between runs, ' +
      'never during one, and is always free to redo.',
  },
} as const satisfies Record<TreeKind, { name: string; about: string }>;

export const TREE_KINDS = Object.keys(TREE_KIND_INFO) as TreeKind[];

/** A Town building. Its tree is every upgrade node naming it; the Town tab lists buildings in registration order. */
export interface BuildingDef extends Def {
  /** Whether its tree is a Foundation or a Tactic (`TreeKind`). Decides the respec fee. */
  readonly kind: TreeKind;
  /**
   * The milestone that opens the building (`src/content/milestones.ts`). Without one it is open
   * from the start. Until it is met the Town tab shows the building locked, with this text, and
   * its nodes can't be bought.
   */
  readonly unlock?: Milestone;
  /**
   * Building tiers (ETH-172, CLAUDE.md §4): every node row from `fromTier` down stays locked until
   * `unlock` is met, such as a tier quest (`objectiveDone`) or a depth (`reachDepth`). A gate is a
   * milestone target with the id `tierGateId(building, fromTier)` (`building.smithy_t4`), so it is
   * recorded in the `milestones` slice like a building unlock. Gates are listed top to bottom
   * (`fromTier` 2 or more, strictly increasing); the top band, above the first gate, is always open.
   */
  readonly tierGates?: readonly TierGate[];
}

/** One building tier gate; see `BuildingDef.tierGates`. */
export interface TierGate {
  /** The first node row (`UpgradeNodeDef.tier`) the gate keeps locked, 2 or more. */
  readonly fromTier: number;
  readonly unlock: Milestone;
  /** How the unlock is named in the run summary. Defaults to "<building> tier <band>". */
  readonly name?: string;
}

/** The milestone target id of a building's tier gate: `building.smithy_t4`. */
export function tierGateId(buildingId: string, fromTier: number): string {
  return `${buildingId}_t${fromTier}`;
}

/** The band (1 is the always-open top band) a node row sits in: one more than the gates at or above it. */
export function tierBand(building: BuildingDef, tier: number): number {
  return 1 + (building.tierGates ?? []).filter((g) => g.fromTier <= tier).length;
}

const tierGateSchema = z.strictObject({
  fromTier: z.number().int('must be a whole number').min(2, 'must be 2 or more: the first row is always open'),
  unlock: milestoneSchema,
  name: z.string().trim().min(1).optional(),
});

export const BUILDINGS = new Registry<BuildingDef>('building');

export const BUILDING_KIND: ContentKind<BuildingDef> = {
  registry: BUILDINGS,
  schema: z.strictObject({
    ...defShape('building'),
    kind: z.enum(TREE_KINDS as [TreeKind, ...TreeKind[]]),
    unlock: milestoneSchema.optional(),
    tierGates: z
      .array(tierGateSchema)
      .refine((gates) => gates.every((g, i) => i === 0 || g.fromTier > (gates[i - 1]?.fromTier ?? 0)), 'fromTier must strictly increase')
      .optional(),
  }),
  refs: (def) => [
    ...(def.unlock === undefined ? [] : milestoneRefs('unlock', def.unlock)),
    ...(def.tierGates ?? []).flatMap((g, i) => milestoneRefs(`tierGates[${i}].unlock`, g.unlock)),
  ],
};

/** Registers a building def and returns it. Its shape is checked by `validateContent`. */
export function defineBuilding(def: BuildingDef): BuildingDef {
  return BUILDINGS.register(def);
}

// --- Capacities ------------------------------------------------------------------------------

/**
 * Named limits that upgrades raise. Each consumer asks meta's `capacity(profile, key, base)`
 * with its own base value. A new capacity is one entry here (name and tooltip text).
 */
export const CAPACITY_INFO = {
  partySize: { name: 'Party size', about: 'How many adventurers descend together.' },
  rosterSize: { name: 'Roster size', about: 'How many named adventurers the guild keeps between runs.' },
  contractSlots: { name: 'Contract slots', about: 'How many contracts a run can take on at once.' },
  ruleSlots: { name: 'Rule slots', about: 'How many behavior rules each adventurer can hold.' },
} as const satisfies Record<string, { name: string; about: string }>;

export type CapacityKey = keyof typeof CAPACITY_INFO;

export const CAPACITY_KEYS = Object.keys(CAPACITY_INFO) as CapacityKey[];

export function isCapacityKey(value: unknown): value is CapacityKey {
  return typeof value === 'string' && Object.hasOwn(CAPACITY_INFO, value);
}

// --- Grants ----------------------------------------------------------------------------------

/** What owning an upgrade node gives every later run. */
export type UpgradeGrant =
  /**
   * A bundle (docs/ARCHITECTURE.md §2.2: stat modifiers, effects, triggers) for each adventurer
   * (`party`) or for the run as a whole (`run`).
   */
  | { readonly kind: 'bundle'; readonly scope: 'party' | 'run'; readonly bundle: Bundle }
  /** Makes a content def available: a class, race, rule condition, floor type, Omen… */
  | { readonly kind: 'unlock'; readonly id: string }
  /** Raises a named limit by `amount`. */
  | { readonly kind: 'capacity'; readonly key: CapacityKey; readonly amount: number };

export type UpgradeGrantKind = UpgradeGrant['kind'];

/**
 * Every `bundle` grant of `node` with this `scope`, merged into one bundle (modifiers, effects
 * and triggers in grant order), or `undefined` if it has none. This is one rank's worth. The sim
 * attaches an upgrade's party bundle by the node's id (ETH-064), so tooltips credit the upgrade by
 * name; a ranked node is attached once per rank (`upgradePartyBundles`).
 */
export function upgradeBundle(node: UpgradeNodeDef, scope: 'party' | 'run'): Bundle | undefined {
  const bundles = node.grants.flatMap((g) => (g.kind === 'bundle' && g.scope === scope ? [g.bundle] : []));
  if (bundles.length === 0) return undefined;
  if (bundles.length === 1) return bundles[0];
  return {
    modifiers: bundles.flatMap((b) => b.modifiers ?? []),
    effects: bundles.flatMap((b) => b.effects ?? []),
    triggers: bundles.flatMap((b) => b.triggers ?? []),
  };
}

// --- Upgrade nodes ---------------------------------------------------------------------------

export interface UpgradeNodeDef extends Def {
  /** The building whose tree this node is in (`building.guild_hall`). */
  readonly building: string;
  /** The node's row in the tree, from 1 at the top. */
  readonly tier: number;
  /** The node's column on its row, from 0 at the left. A layout hint for the node graph. */
  readonly column: number;
  /** Price per currency id: `renown`, `trophies` or `favor:deity.<id>`. */
  readonly cost: Readonly<Record<string, number>>;
  /** Nodes that must be owned first: same building, earlier tier. */
  readonly requires: readonly string[];
  /** Nodes sharing a group are a pick-one choice: owning one excludes the others until a respec. */
  readonly exclusiveGroup?: string;
  readonly grants: readonly UpgradeGrant[];
  /**
   * Makes the node buyable `max` times (ETH-172). `cost` is rank 1's price; rank `r` costs
   * `cost × costGrowth^(r−1)` per currency, rounded by `roundCost` and never below the rank
   * before (`rankPrice`). Each rank adds the node's `grants` once more, so only `capacity` and
   * `bundle` grants may be on a ranked node. Without it the node has one rank.
   */
  readonly ranks?: NodeRanks;
}

export interface NodeRanks {
  /** 2 to `MAX_NODE_RANKS`. */
  readonly max: number;
  /** Price growth per rank, 1 or more (1 keeps every rank at the same price). */
  readonly costGrowth: number;
}

export const MAX_NODE_RANKS = 10;

/** Help text for the two ideas the Town tooltips lean on (ETH-172): shown in the tooltips of ranked nodes and tier dividers. */
export const UPGRADE_HELP = {
  ranks: {
    name: 'Ranks',
    about:
      'Some upgrades can be bought several times. Each rank costs more than the one before and adds the ' +
      "upgrade's effect once more. A reset or respec pays back every rank.",
  },
  tiers: {
    name: 'Building tiers',
    about:
      "A building's lower rows stay locked until its tier quest is done (or its other goal is met). " +
      'Once a tier opens, it stays open.',
  },
} as const satisfies Record<string, { name: string; about: string }>;

/** A node's top rank: 1 unless it has `ranks`. */
export function maxRank(node: UpgradeNodeDef): number {
  return node.ranks?.max ?? 1;
}

/**
 * A computed rank price made readable: whole numbers under 100, else two significant figures
 * (1,234 becomes 1,200). Never below 1.
 */
export function roundCost(n: number): number {
  if (n < 100) return Math.max(1, Math.round(n));
  const step = 10 ** (Math.floor(Math.log10(n)) - 1);
  return Math.round(n / step) * step;
}

/**
 * What rank `rank` (1 to `maxRank`) of `node` costs, per currency id. Rank 1 is `node.cost` as
 * written; later ranks grow by `costGrowth`, rounded with `roundCost`, never below the rank before.
 */
export function rankPrice(node: UpgradeNodeDef, rank: number): Record<string, number> {
  const growth = node.ranks?.costGrowth ?? 1;
  const out: Record<string, number> = {};
  for (const [key, base] of Object.entries(node.cost)) {
    let price = base;
    for (let r = 2; r <= rank; r++) price = Math.max(price, roundCost(base * growth ** (r - 1)));
    out[key] = price;
  }
  return out;
}

export const UPGRADES = new Registry<UpgradeNodeDef>('upgrade');

/** A currency id as costs name them. */
export const CURRENCY_KEY = /^(renown|trophies|favor:deity\.[a-z][a-z0-9_]*)$/;

const groupSchema = z
  .string()
  .regex(/^[a-z][a-z0-9_]*(\.[a-z0-9_]+)*$/, 'must be lowercase words joined by "." (e.g. "guild_hall.tier2")');

/** A granted bundle must do something: at least one modifier or trigger. */
const grantBundleSchema = bundleSchema.refine(
  (b) => (b.modifiers?.length ?? 0) + (b.triggers?.length ?? 0) > 0,
  'must change at least one stat or have a trigger',
);

const grantSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('bundle'),
    scope: z.enum(['party', 'run']),
    bundle: grantBundleSchema,
  }),
  z.strictObject({
    kind: z.literal('unlock'),
    id: z.string().regex(/^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/, 'must be a content id'),
  }),
  z.strictObject({
    kind: z.literal('capacity'),
    key: z.enum(CAPACITY_KEYS as [CapacityKey, ...CapacityKey[]]),
    amount: positiveInt,
  }),
]);

const upgradeSchema = z.strictObject({
  ...defShape('upgrade'),
  building: idSchema('building'),
  tier: positiveInt,
  column: z.number().int('must be a whole number').nonnegative('must not be negative'),
  cost: z
    .record(z.string().regex(CURRENCY_KEY, 'must be renown, trophies or favor:deity.<id>'), positiveInt)
    .refine((cost) => Object.keys(cost).length > 0, 'must cost something'),
  requires: z.array(idSchema('upgrade')),
  exclusiveGroup: groupSchema.optional(),
  grants: z.array(grantSchema).min(1, 'must grant something'),
  ranks: z
    .strictObject({
      max: z.number().int('must be a whole number').min(2, 'must be 2 or more').max(MAX_NODE_RANKS, `must be at most ${MAX_NODE_RANKS}`),
      costGrowth: z.number().min(1, 'must be 1 or more'),
    })
    .optional(),
});

/**
 * The registry kind an unlock id refers to, from its prefix. Ids whose prefix differs from their
 * registry's kind name are listed; the rest use the prefix (`class.x` → `class`).
 */
const UNLOCK_KIND_BY_PREFIX: Readonly<Record<string, string>> = {
  floor: 'floor type',
  cond: 'rule condition',
  act: 'rule action',
};

function unlockKind(id: string): string {
  const prefix = id.slice(0, id.indexOf('.'));
  return UNLOCK_KIND_BY_PREFIX[prefix] ?? prefix;
}

function upgradeRefs(def: UpgradeNodeDef): ContentRef[] {
  const refs: ContentRef[] = [{ path: 'building', kind: 'building', id: def.building }];
  def.requires.forEach((id, i) => refs.push({ path: `requires[${i}]`, kind: 'upgrade', id }));
  for (const key of Object.keys(def.cost)) {
    if (key.startsWith('favor:')) refs.push({ path: `cost.${key}`, kind: 'deity', id: key.slice('favor:'.length) });
  }
  def.grants.forEach((grant, i) => {
    if (grant.kind === 'unlock') refs.push({ path: `grants[${i}].id`, kind: unlockKind(grant.id), id: grant.id });
    if (grant.kind === 'bundle') refs.push(...bundleRefs(`grants[${i}].bundle`, grant.bundle));
  });
  return refs;
}

/** The tree rules that span several nodes (see the module comment). */
export function checkUpgradeTrees(defs: readonly UpgradeNodeDef[]): string[] {
  const problems: string[] = [];
  const byId = new Map(defs.map((d) => [d.id, d]));
  const label = (d: UpgradeNodeDef) => `upgrade "${d.id}"`;

  const cells = new Map<string, UpgradeNodeDef>();
  for (const def of defs) {
    const cell = `${def.building}/${def.tier}/${def.column}`;
    const other = cells.get(cell);
    if (other) problems.push(`${label(def)}: tier ${def.tier} column ${def.column} is already taken by "${other.id}"`);
    else cells.set(cell, def);

    const seen = new Set<string>();
    def.requires.forEach((id, i) => {
      if (seen.has(id)) problems.push(`${label(def)}: requires[${i}] lists "${id}" twice`);
      seen.add(id);
      const req = byId.get(id);
      if (!req) return; // an unknown id is reported by the ref check
      if (req.building !== def.building) {
        problems.push(`${label(def)}: requires[${i}] "${id}" is in another building (${req.building})`);
      } else if (req.tier >= def.tier) {
        problems.push(`${label(def)}: requires[${i}] "${id}" must be on an earlier tier (it is on tier ${req.tier}, this node on ${def.tier}); this also rules out cycles`);
      }
    });
  }

  for (const def of defs) {
    if (def.ranks !== undefined && def.grants.some((g) => g.kind === 'unlock')) {
      problems.push(`${label(def)}: a ranked node may only have capacity and bundle grants, as an unlock can't stack`);
    }
  }

  const groups = new Map<string, UpgradeNodeDef[]>();
  for (const def of defs) {
    if (def.exclusiveGroup === undefined) continue;
    groups.set(def.exclusiveGroup, [...(groups.get(def.exclusiveGroup) ?? []), def]);
  }
  for (const [group, members] of groups) {
    const [first] = members;
    if (!first) continue;
    if (members.length < 2) problems.push(`${label(first)}: pick-one group "${group}" has no other node to choose between`);
    for (const m of members.slice(1)) {
      if (m.building !== first.building || m.tier !== first.tier) {
        problems.push(`${label(m)}: pick-one group "${group}" must be on one tier of one building, like "${first.id}"`);
      }
    }
  }
  return problems;
}

export const UPGRADE_KIND: ContentKind<UpgradeNodeDef> = {
  registry: UPGRADES,
  schema: upgradeSchema,
  refs: upgradeRefs,
  check: checkUpgradeTrees,
};

/** Registers an upgrade node def and returns it. Its shape is checked by `validateContent`. */
export function defineUpgrade(def: UpgradeNodeDef): UpgradeNodeDef {
  return UPGRADES.register(def);
}

/** The nodes of one building's tree, in registration order. */
export function buildingNodes(buildingId: string): UpgradeNodeDef[] {
  return UPGRADES.all().filter((node) => node.building === buildingId);
}

/** The nodes of a pick-one group. */
export function groupNodes(group: string): UpgradeNodeDef[] {
  return UPGRADES.all().filter((node) => node.exclusiveGroup === group);
}
