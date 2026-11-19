/**
 * Wording and figures for the run summary (`RunSummary.tsx`), kept apart from the components so
 * they can be tested on their own.
 */
import { addCurrencies, CURRENCY_INFO, latestUnlocks, milestoneTargets } from '../../meta';
import type { Currencies, Profile, RunRecord } from '../../meta';
import { DEITIES, describeMilestoneMet } from '../../content';
import { describeRequirement, favorDeity, favorKey, RENOWN, TROPHIES, WIPE_LOSS_SHARE } from '../../sim';
import type { ContractRecord, FallenRecord, PartyMemberRecord, RewardAmounts, RunEnd, RunOutcome, RunReport } from '../../sim';

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
  const { atRisk, lost } = report.result;
  const keys = [...new Set([RENOWN, TROPHIES, ...Object.keys(atRisk), ...Object.keys(lost)])];
  return keys.map((key) => {
    const earned = atRisk[key] ?? 0;
    const gone = lost[key] ?? 0;
    return { key, atRisk: earned, lost: gone, banked: earned - gone };
  });
}

/** The wipe loss as a whole percentage: "25%". */
export const WIPE_LOSS_PERCENT = `${Math.round(WIPE_LOSS_SHARE * 100)}%`;

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
}

/** What the profile's latest run opened, or run number `run`'s (ETH-048), from the `milestones` slice. */
export function unlockLines(profile: Profile, run?: number): UnlockLine[] {
  const targets = milestoneTargets();
  const unlocks = run === undefined ? latestUnlocks(profile) : profile.milestones.unlocked.filter((u) => u.run === run);
  return unlocks.flatMap((u) => {
    const target = targets.find((t) => t.id === u.id);
    return target === undefined ? [] : [{ id: u.id, name: target.name, why: describeMilestoneMet(target.unlock, describeRequirement) }];
  });
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

/** The cause shown for a past run recorded before causes were kept. */
export const NO_CAUSE = 'No details were kept for this run.';

/**
 * A recorded run (the profile's `history`, ETH-048) as a `RunReport`, so the run summary can show
 * it again. Party members are numbered by their place in the party.
 */
export function reportFromRecord(record: RunRecord): RunReport {
  const earned = addCurrencies(record.banked, record.lost);
  const party: PartyMemberRecord[] = record.party.map((m, i) => ({ actor: i, name: m.name, classId: m.classId, raceId: m.raceId }));
  // The record keeps how they died as words only (`how`); runs recorded before ETH-075 just fell.
  const fallen: FallenRecord[] = record.party.flatMap((m, i) =>
    m.fell === null ? [] : [{ actor: i, name: m.name, depth: m.fell.depth, turn: m.fell.turn, killer: null, how: m.fell.how ?? 'fell' }],
  );
  const end: RunEnd = { outcome: record.outcome, turn: record.turns, cause: record.cause === '' ? NO_CAUSE : record.cause, depth: record.deepestDepth };
  return {
    result: {
      outcome: record.outcome,
      atRisk: rewardsFromCurrencies(earned),
      lost: rewardsFromCurrencies(record.lost),
      turns: record.turns,
      deepestDepth: record.deepestDepth,
      extras: {
        'run.end': end,
        'run.party': party,
        'track.deaths': { fallen },
        'track.codex': Object.fromEntries(record.met.map((id) => [id, []])),
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
