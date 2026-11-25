/**
 * Wording and figures for the run summary (`RunSummary.tsx`), kept apart from the components so
 * they can be tested on their own.
 */
import { addCurrencies, CURRENCY_INFO, latestUnlocks, milestoneTargets, RUN_RECORD_MOMENTS } from '../../meta';
import type { Currencies, Profile, RunRecord } from '../../meta';
import { BUILDINGS, CONTRACTS, defName, DEITIES, describeMilestoneMet, tierBand, tierGateId, UPGRADES } from '../../content';
import type { Milestone } from '../../content';
import {
  CHRONICLE_TRACKER,
  depthRenown,
  describeRequirement,
  favorDeity,
  favorKey,
  RENOWN,
  RENOWN_DEPTH_EXPONENT,
  RENOWN_PER_FLOOR,
  renownByFloor,
  renownForFloor,
  topMoments,
  TROPHIES,
  TURNS_PER_RENOWN,
  turnsRenown,
  WIPE_LOSS_SHARE,
} from '../../sim';
import type { ChronicleEntry, ContractRecord, OmensRecord, FallenRecord, FloorRenown, GoldConversionRecord, ItemSaleRecord, PartyMemberRecord, RewardAmounts, RunEnd, RunOutcome, RunReport } from '../../sim';

/** Each outcome's heading and icon, so it never rests on color alone. */
export const OUTCOME_LOOK: Readonly<Record<RunOutcome, { title: string; icon: string }>> = {
  victory: { title: 'Victory', icon: '★' },
  retreat: { title: 'Retreat', icon: '⇡' },
  wipe: { title: 'Wipe', icon: '✝' },
};

/** A currency id's name: Renown, Trophies, or "Favor (Dawn)" for `favor:<deity>`. */
export function currencyName(key: string): string {
  if (key === RENOWN) return CURRENCY_INFO.renown.name;
  if (key === TROPHIES) return CURRENCY_INFO.trophies.name;
  const deity = favorDeity(key);
  if (deity === null) return key;
  return `${CURRENCY_INFO.favor.name} (${DEITIES.has(deity) ? DEITIES.get(deity).name : deity})`;
}

export interface CurrencyRow {
  key: string;
  /** Earned this run, before any wipe loss. */
  atRisk: number;
  /** Lost to a wipe (ETH-023). */
  lost: number;
  /** What went into the banked total. */
  banked: number;
}

/** One row per currency earned or lost. Renown and Trophies always show. */
export function currencyRows(report: RunReport): CurrencyRow[] {
  const { atRisk, lost, converted } = report.result;
  const keys = [...new Set([RENOWN, TROPHIES, ...Object.keys(atRisk), ...Object.keys(lost), ...Object.keys(converted ?? {})])];
  return keys.map((key) => {
    const earned = (atRisk[key] ?? 0) + (converted?.[key] ?? 0);
    const gone = lost[key] ?? 0;
    return { key, atRisk: earned, lost: gone, banked: earned - gone };
  });
}

/** The carried-item sale record (`extras['run.items']`, ETH-171), or `null` when absent, malformed or empty. */
export function itemSaleOf(report: RunReport): ItemSaleRecord | null {
  const raw = report.result.extras['run.items'];
  if (typeof raw !== 'object' || raw === null) return null;
  const { items, value, trophies, rate } = raw as Partial<ItemSaleRecord>;
  if (
    typeof items !== 'number' ||
    !Number.isInteger(items) ||
    items <= 0 ||
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < 0 ||
    typeof trophies !== 'number' ||
    !Number.isInteger(trophies) ||
    trophies < 0 ||
    typeof rate !== 'number' ||
    !Number.isFinite(rate) ||
    rate <= 0
  ) {
    return null;
  }
  return { items, value, trophies, rate };
}

/** The Omens the run had on and the reward multiplier they paid (`extras['run.omens']`, ETH-185), or `null` when none was on. */
export function omensOf(report: RunReport): { lines: { name: string; rank: number }[]; multiplier: number } | null {
  const raw = report.result.extras['run.omens'] as Partial<OmensRecord> | undefined;
  if (typeof raw !== 'object' || raw === null || !Array.isArray(raw.omens) || raw.omens.length === 0) return null;
  const multiplier = typeof raw.multiplier === 'number' && Number.isFinite(raw.multiplier) ? raw.multiplier : 1;
  return { lines: raw.omens.map((o) => ({ name: defName(o.id), rank: o.rank })), multiplier };
}

/** Leftover gold conversion record (`extras['run.gold']`, ETH-083), or `null` when absent or malformed. */
export function goldConversionOf(report: RunReport): GoldConversionRecord | null {
  const raw = report.result.extras['run.gold'];
  if (typeof raw !== 'object' || raw === null) return null;
  const { gold, trophies, rate } = raw as Partial<GoldConversionRecord>;
  if (
    typeof gold !== 'number' ||
    !Number.isFinite(gold) ||
    gold < 0 ||
    typeof trophies !== 'number' ||
    !Number.isInteger(trophies) ||
    trophies < 0 ||
    typeof rate !== 'number' ||
    !Number.isFinite(rate) ||
    rate <= 0
  ) {
    return null;
  }
  return { gold, trophies, rate };
}

/** The wipe loss as a whole percentage: "25%". */
export const WIPE_LOSS_PERCENT = `${Math.round(WIPE_LOSS_SHARE * 100)}%`;

/** The Renown formula shown in tooltips, derived from the tuneable constants in `trackers.ts` (ETH-085). */
export const RENOWN_FORMULA_TEXT =
  `${RENOWN_PER_FLOOR} × floor^${RENOWN_DEPTH_EXPONENT} (rounded) per floor below floor 1, ` +
  `plus 1 per ${TURNS_PER_RENOWN} turns survived.`;

/** Concrete per-floor sample amounts for the Renown formula tooltip, derived from `renownForFloor`. */
export const RENOWN_FORMULA_EXAMPLES = [2, 5, 10].map((d) => `Floor ${d}: ${renownForFloor(d)}`).join(' · ');

/** How a run's earned Renown breaks down by floor, turns, contracts and other bonuses (ETH-085). */
export interface RenownBreakdown {
  /** Per-floor depth Renown for floors `2..deepestDepth` (empty when `deepestDepth <= 1`). */
  readonly floors: readonly FloorRenown[];
  /** Sum of `floors`. */
  readonly depth: number;
  /** Renown from turns survived (`turnsRenown(turns)`). */
  readonly turns: number;
  /** Total turns survived, for the label. */
  readonly turnCount: number;
  /** Renown from completed contracts. */
  readonly contracts: number;
  /** Remaining earned Renown (e.g. run-wide reward multipliers), when positive. */
  readonly other: number;
}

/**
 * Breaks a finished run's earned Renown down into per-floor depth rewards, turns survived,
 * completed contracts and any remaining bonus (such as run modifiers). Works identically for
 * live runs and past runs rebuilt from Run History (`reportFromRecord`). Returns `null` when
 * the current formula's components exceed the recorded earned Renown (e.g. a past run saved
 * before ETH-085's depth-weighted formula), rather than showing numbers that contradict the total.
 */
export function renownBreakdown(report: RunReport): RenownBreakdown | null {
  const floors = renownByFloor(report.result.deepestDepth);
  const depth = depthRenown(report.result.deepestDepth);
  const turns = turnsRenown(report.result.turns);
  const contracts = contractsOf(report).reduce((sum, c) => sum + (c.complete ? (c.reward[RENOWN] ?? 0) : 0), 0);
  const earned = report.result.atRisk[RENOWN] ?? 0;
  const other = earned - (depth + turns + contracts);
  if (other < 0) return null;
  return { floors, depth, turns, turnCount: report.result.turns, contracts, other };
}

/** The line under the currency table: how this outcome treated the run's at-risk earnings. */
export function lossNote(outcome: RunOutcome): string {
  return outcome === 'wipe'
    ? `The wipe took ${WIPE_LOSS_PERCENT} of each currency earned this run, rounded in your disfavor. The rest is banked.`
    : `Everything earned this run is banked: only a wipe loses ${WIPE_LOSS_PERCENT} of a run’s earnings.`;
}

/** Who fell this run, from the deaths tracker (`extras['track.deaths']`). */
export function fallenOf(report: RunReport): readonly FallenRecord[] {
  const deaths = report.result.extras['track.deaths'] as { fallen?: FallenRecord[] } | undefined;
  return deaths?.fallen ?? [];
}

/** How many turns cursed gear was worn this run (`extras['track.cursedGear']`, ETH-142); 0 if the result doesn't say. */
export function cursedGearTurnsOf(report: RunReport): number {
  const value = report.result.extras['track.cursedGear'];
  const turns = typeof value === 'object' && value !== null ? (value as { turns?: unknown }).turns : undefined;
  return typeof turns === 'number' && Number.isFinite(turns) ? turns : 0;
}

/** The content ids the Codex tracker discovered this run (`extras['track.codex']`, ETH-065). */
export function discoveriesOf(report: RunReport): string[] {
  const codex = report.result.extras['track.codex'];
  return typeof codex === 'object' && codex !== null ? Object.keys(codex) : [];
}

/** One line per thing the latest run's milestones opened (ETH-074). */
export interface UnlockLine {
  id: string;
  name: string;
  /** The milestone met, as a past-tense clause: "you reached floor 3". */
  why: string;
  /** For a building tier (ETH-170): the building and the band that opened, which is 2 or more. */
  tier?: { building: string; band: number };
  /** For an upgrade node a milestone revealed (ETH-036): the building that sells it. The line says it can now be bought. */
  reveals?: { building: string };
}

const ORDINALS = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'];

/** "The Smithy's second tier is open", the run summary's line for a building tier (ETH-170). */
export function tierOpenText(tier: { building: string; band: number }): string {
  return `The ${tier.building}'s ${ORDINALS[tier.band - 1] ?? `${tier.band}th`} tier is open`;
}

/** The building and band a tier gate target id (`tierGateId`) opens, or `undefined` for any other id. */
function tierOfTarget(id: string): UnlockLine['tier'] {
  for (const building of BUILDINGS.all()) {
    for (const gate of building.tierGates ?? []) {
      if (tierGateId(building.id, gate.fromTier) === id) return { building: building.name, band: tierBand(building, gate.fromTier) };
    }
  }
  return undefined;
}

/** What the profile's latest run opened, or run number `run`'s (ETH-048), from the `milestones` slice. */
export function unlockLines(profile: Profile, run?: number): UnlockLine[] {
  const targets = milestoneTargets();
  const unlocks = run === undefined ? latestUnlocks(profile) : profile.milestones.unlocked.filter((u) => u.run === run);
  return unlocks.flatMap((u) => {
    const target = targets.find((t) => t.id === u.id);
    if (target === undefined) return [];
    const tier = tierOfTarget(u.id);
    const node = UPGRADES.has(u.id) ? UPGRADES.get(u.id) : undefined;
    const reveals = node === undefined ? undefined : { building: BUILDINGS.has(node.building) ? BUILDINGS.get(node.building).name : node.building };
    return [{ id: u.id, name: target.name, why: unlockWhy(target.unlock), ...(tier === undefined ? {} : { tier }), ...(reveals === undefined ? {} : { reveals }) }];
  });
}

/** The milestone met as a clause; a building quest says its own ("you brought the anvil home", ETH-093). */
function unlockWhy(unlock: Milestone): string {
  if (unlock.kind === 'objectiveDone' && unlock.owner.kind === 'contract' && CONTRACTS.has(unlock.owner.id)) {
    const text = CONTRACTS.get(unlock.owner.id).openedText;
    if (text !== undefined) return text;
  }
  return describeMilestoneMet(unlock, describeRequirement, defName);
}

/** Who set out (`extras['run.party']`, ETH-048), or an empty list if the result doesn't say. */
export function partyOf(report: RunReport): readonly PartyMemberRecord[] {
  const party = report.result.extras['run.party'];
  return Array.isArray(party) ? (party as PartyMemberRecord[]) : [];
}

/** The run's contracts (`extras['track.contracts']`, ETH-024), or an empty list if the result doesn't say. */
export function contractsOf(report: RunReport): readonly ContractRecord[] {
  const contracts = report.result.extras['track.contracts'];
  return Array.isArray(contracts) ? (contracts as ContractRecord[]) : [];
}

/**
 * How many moments the run summary lists: as many as the run history keeps, so a past run's
 * summary shows the same list as when it ended.
 */
export const SUMMARY_MOMENTS = RUN_RECORD_MOMENTS;

/**
 * The run's most notable chronicle moments (`extras['track.chronicle']`, ETH-120), at most
 * `SUMMARY_MOMENTS`, in the order they happened; empty if the result doesn't say.
 */
export function momentsOf(report: RunReport): ChronicleEntry[] {
  const entries = report.result.extras[CHRONICLE_TRACKER.id];
  return Array.isArray(entries) ? topMoments(entries as ChronicleEntry[], SUMMARY_MOMENTS) : [];
}

/** The cause shown for a past run recorded before causes were kept. */
export const NO_CAUSE = 'No details were kept for this run.';

/**
 * A recorded run (the profile's `history`, ETH-048) as a `RunReport`, so the run summary can show
 * it again. Party members are numbered by their place in the party.
 */
export function reportFromRecord(record: RunRecord): RunReport {
  const earned = addCurrencies(record.banked, record.lost);
  const convertedTrophies =
    record.outcome !== 'wipe' ? Math.min(earned.trophies, (record.gold?.trophies ?? 0) + (record.items?.trophies ?? 0)) : 0;
  const atRiskCurrencies =
    convertedTrophies > 0 ? { ...earned, trophies: earned.trophies - convertedTrophies } : earned;
  const converted = convertedTrophies > 0 ? { [TROPHIES]: convertedTrophies } : undefined;
  const party: PartyMemberRecord[] = record.party.map((m, i) => ({ actor: i, name: m.name, classId: m.classId, raceId: m.raceId }));
  // The record keeps how they died as words only (`how`); runs recorded before ETH-075 just fell.
  const fallen: FallenRecord[] = record.party.flatMap((m, i) =>
    m.fell === null ? [] : [{ actor: i, name: m.name, depth: m.fell.depth, turn: m.fell.turn, killer: null, how: m.fell.how ?? 'fell' }],
  );
  const end: RunEnd = { outcome: record.outcome, turn: record.turns, cause: record.cause === '' ? NO_CAUSE : record.cause, depth: record.deepestDepth };
  return {
    result: {
      outcome: record.outcome,
      atRisk: rewardsFromCurrencies(atRiskCurrencies),
      lost: rewardsFromCurrencies(record.lost),
      ...(converted !== undefined ? { converted } : {}),
      turns: record.turns,
      deepestDepth: record.deepestDepth,
      extras: {
        'run.end': end,
        'run.party': party,
        ...(record.gold !== undefined ? { 'run.gold': { ...record.gold } } : {}),
        ...(record.items !== undefined ? { 'run.items': { ...record.items } } : {}),
        ...(record.omens !== undefined ? { 'run.omens': { omens: record.omens.omens.map((o) => ({ ...o })), multiplier: record.omens.multiplier } } : {}),
        'track.deaths': { fallen },
        'track.codex': Object.fromEntries(record.met.map((id) => [id, []])),
        // Party members in the kept moments are numbered by party place, like `party` above.
        [CHRONICLE_TRACKER.id]: record.moments.map((m) => ({ ...m, actors: [...m.actors], ids: [...m.ids] })),
        'track.contracts': record.contracts.map((c) => ({ contract: c.id, complete: c.complete, reward: rewardsFromCurrencies(c.reward) })),
      },
    },
    end,
  };
}

/** `Currencies` as flat reward amounts (`renown`, `trophies`, `favor:<deity>`), leaving out zeros. */
function rewardsFromCurrencies(c: Currencies): RewardAmounts {
  const out: RewardAmounts = {};
  if (c.renown > 0) out[RENOWN] = c.renown;
  if (c.trophies > 0) out[TROPHIES] = c.trophies;
  for (const [deity, n] of Object.entries(c.favor)) if (n > 0) out[favorKey(deity)] = n;
  return out;
}

/** A placeholder epitaph until the lineage system writes real ones (M5, CLAUDE.md §7). */
export function epitaph(report: RunReport): string {
  const last = fallenOf(report).at(-1);
  if (report.end.outcome === 'wipe' && last !== undefined) return `Here lies ${last.name}, who went no further than floor ${last.depth}.`;
  if (report.end.outcome === 'victory') return 'They went down, did what was asked, and came back up to tell of it.';
  return `They went as deep as floor ${report.end.depth} and lived to say so.`;
}
