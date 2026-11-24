/**
 * Headless runs (docs/ARCHITECTURE.md §10): runs seeded dungeons with no UI through `SimSession`,
 * the same loop the hosts use, and reports how each went: how deep the party got, the turns it
 * spent on each floor, and whether it settled at the bottom. The seed of the balance harness: in
 * M1 it grows death causes and currency per hour. `tools/sim.ts` is the command line for it
 * (`npm run sim -- --seeds N [--jobs N]`); `test/tools/headless.test.ts` runs it in the test suite.
 *
 * Public barrel re-exporting focused modules under `tools/headless/`.
 */
export {
  buildHeadlessConfig,
  buildHeadlessProfile,
  CAUTIOUS_RULES,
  DEFAULT_TURN_CAP,
  defaultJobs,
  HEADLESS_CONTRACTS,
  HEADLESS_PRESETS,
  HEADLESS_RULES_PRESETS,
  headlessParty,
  MAX_JOBS,
  MAX_PARTY,
  partyOptions,
  PROGRESSED_UPGRADES,
  resolveHeadlessRules,
} from './headless/config';
export type { HeadlessOptions, HeadlessPreset, HeadlessRulesPreset } from './headless/config';

export { runSeed, runSeeds } from './headless/runner';
export type { FloorResult, MemberResult, Outcome, SeedResult } from './headless/runner';

export { formatMixed, summarizeMixed } from './headless/mixed';
export type { MixedRow, MixedSummary } from './headless/mixed';

export {
  bankedRenown,
  flagReason,
  floorTurns,
  median,
  PARTY_SWEEP_MIN_RATIO,
  partySweepRow,
  partySweepWarnings,
  renownPerHour,
  STEPS_PER_HOUR_AT_1X,
  summarizeReport,
} from './headless/summary';
export type { PartySweepRow, ReportSummary } from './headless/summary';

export { formatPartySweep, formatReport } from './headless/format';

export { int, parseSimArgs, USAGE } from './headless/args';
export type { SimArgs } from './headless/args';
