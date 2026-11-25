/**
 * Command-line argument parsing and usage help for `tools/sim.ts` (and `int` helper shared with `tools/run-soak.ts`).
 */
import { parseArgs } from 'node:util';
import { CLASSES, CONTRACTS, RACES } from '../../src/content';
import { partySize } from '../../src/meta';
import {
  buildHeadlessProfile,
  DEFAULT_TURN_CAP,
  defaultJobs,
  HEADLESS_PRESETS,
  HEADLESS_RULES_PRESETS,
  MAX_JOBS,
  MAX_PARTY,
} from './config';
import type { HeadlessPreset, HeadlessRulesPreset } from './config';
import { PARTY_SWEEP_MIN_RATIO } from './summary';

export interface SimArgs {
  /** Run party sizes 1 to `MAX_PARTY` and check the win-rate ordering (`--party-sweep`, ETH-145). */
  partySweep: boolean;
  /** The first seed. */
  from: number;
  /** How many seeds (one run each) to run. */
  seeds: number;
  cap: number;
  party: number;
  preset: HeadlessPreset;
  upgrades: string[];
  rules: HeadlessRulesPreset;
  /** Class of every adventurer (`--class`, ETH-160); null is the Vanguard. */
  classId: string | null;
  /** Race of every adventurer (`--race`, ETH-160); null is the Human. */
  raceId: string | null;
  /** The one contract every run takes (`--contract`, ETH-093); null is the default, Recover the relic. */
  contract: string | null;
  /** Field the Prepare screen's random party per seed (`--recruits`, ETH-178); `party` is its size. */
  recruits: boolean;
  /** Worker threads to run seeds on (`--jobs`); 1 is a serial run. Doesn't change the results. */
  jobs: number;
  /** Write the report as JSON to this file (`--json`). */
  json: string | null;
  /** Compare with the report in this file (`--baseline`). */
  baseline: string | null;
  /** Compare with the same run on this git ref (`--compare`). */
  compare: string | null;
  help: boolean;
}

export const USAGE = `Usage: npm run sim -- [--seeds N] [--from S] [--cap T] [--party P]
                      [--preset fresh|progressed] [--upgrades id1,id2,...] [--rules baseline|cautious]
                      [--class ID | --race ID | --recruits] [--contract ID]
                      [--party-sweep] [--jobs N] [--json FILE] [--compare REF | --baseline FILE]

Runs N seeded runs headlessly, each until the party settles on the bottom floor or the cap is
hit, and reports per seed the turns taken, the depth reached, how much of the last floor was
explored and the final state hash, then the turns per floor. Seeds that hit the turn cap, settle
above the bottom or trigger stuck detection are listed at the end.

  --seeds N               how many seeds to run (default 10)
  --from S                the first seed (default 1)
  --cap T                 party turns allowed per run (default ${DEFAULT_TURN_CAP})
  --party P               adventurers in the party, 1 to ${MAX_PARTY} (default from preset/upgrades, 1 when fresh)
  --preset NAME           profile preset: fresh (default) or progressed
  --upgrades ID1,ID2,...  comma-separated upgrade node ids to apply (e.g. upgrade.hardy_recruits,upgrade.contract_bounty)
  --rules NAME            behavior rule preset: baseline (default) or cautious
  --class ID              class of every adventurer, e.g. outrider or class.outrider (default vanguard)
  --race ID               race of every adventurer, e.g. fenling or race.fenling (default human)
  --contract ID           the contract every run takes, e.g. cold_anvil or contract.cold_anvil (default recover_relic)
  --recruits              field the party the Prepare screen gives a new player: random recruits from the
                          available classes and races, drawn from each seed (--party sets the size), and add
                          a per-class and per-race breakdown to the report (not with --class or --race)
  --party-sweep           run party sizes 1 to ${MAX_PARTY} on the same seeds and preset, print win rate and
                          level per size, and warn when win rate does not rise with party size or party
                          ${MAX_PARTY} wins less than ${PARTY_SWEEP_MIN_RATIO}x as often as solo (--party is ignored; not with
                          --compare, --baseline or --json)
  --jobs N                worker threads to run seeds on, 1 to ${MAX_JOBS} (default: CPU cores - 1; 1 runs
                          serially). The report is identical for any N. Lower it to leave CPU free
  --json FILE             also write the report as JSON, to keep as a baseline
  --compare REF           run the same seeds on git ref REF (e.g. origin/main, or merge-base for the
                          merge base with origin/main) and print a before/after table of the report
                          metrics
  --baseline FILE         print the before/after table against a report saved with --json
  --help                  show this text`;

function parsePreset(raw: string | undefined): HeadlessPreset {
  if (raw === undefined) return 'fresh';
  if ((HEADLESS_PRESETS as readonly string[]).includes(raw)) return raw as HeadlessPreset;
  throw new Error(`--preset must be one of ${HEADLESS_PRESETS.join(', ')}, got "${raw}"`);
}

function parseRulesPreset(raw: string | undefined): HeadlessRulesPreset {
  if (raw === undefined) return 'baseline';
  if ((HEADLESS_RULES_PRESETS as readonly string[]).includes(raw)) return raw as HeadlessRulesPreset;
  throw new Error(`--rules must be one of ${HEADLESS_RULES_PRESETS.join(', ')}, got "${raw}"`);
}

/** Resolves `--class` / `--race`: a full id or the part after the dot. Throws a readable `Error` listing the choices. */
function parseContentId(flag: string, kind: 'class' | 'race', raw: string | undefined): string | null {
  if (raw === undefined) return null;
  const registry = kind === 'class' ? CLASSES : RACES;
  const id = raw.includes('.') ? raw : `${kind}.${raw}`;
  if (registry.has(id)) return id;
  throw new Error(`${flag} "${raw}" is not a ${kind}. Available: ${registry.all().map((d) => d.id).join(', ')}`);
}

/** Resolves `--contract`: a full id or the part after the dot. */
function parseContract(raw: string | undefined): string | null {
  if (raw === undefined) return null;
  const id = raw.includes('.') ? raw : `contract.${raw}`;
  if (CONTRACTS.has(id)) return id;
  throw new Error(`--contract "${raw}" is not a contract. Available: ${CONTRACTS.all().map((d) => d.id).join(', ')}`);
}

function parseUpgradeList(raw: string | undefined): string[] {
  if (raw === undefined) return [];
  if (raw.trim() === '') throw new Error('--upgrades must be a comma-separated list of upgrade ids');
  const ids = raw.split(',').map((part) => part.trim());
  if (ids.some((id) => id === '')) throw new Error('--upgrades must not contain empty upgrade ids');
  return ids;
}

/** Reads the command line. Throws an `Error` with a readable message on a bad argument. */
export function parseSimArgs(argv: readonly string[]): SimArgs {
  const { values } = parseArgs({
    args: [...argv],
    options: {
      seeds: { type: 'string', short: 'n' },
      from: { type: 'string' },
      cap: { type: 'string' },
      party: { type: 'string' },
      preset: { type: 'string' },
      upgrades: { type: 'string' },
      rules: { type: 'string' },
      class: { type: 'string' },
      race: { type: 'string' },
      contract: { type: 'string' },
      recruits: { type: 'boolean' },
      'party-sweep': { type: 'boolean' },
      jobs: { type: 'string' },
      json: { type: 'string' },
      compare: { type: 'string' },
      baseline: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
    strict: true,
    allowPositionals: false,
  });
  if (values.compare !== undefined && values.baseline !== undefined) {
    throw new Error('Use --compare or --baseline, not both');
  }
  if (values.recruits === true && (values.class !== undefined || values.race !== undefined)) {
    throw new Error('--recruits fields random classes and races, so it can not be combined with --class or --race');
  }
  const preset = parsePreset(values.preset);
  const upgrades = parseUpgradeList(values.upgrades);
  const rules = parseRulesPreset(values.rules);
  const profile = buildHeadlessProfile(preset, upgrades);
  return {
    seeds: int('--seeds', values.seeds, 10, 1),
    from: int('--from', values.from, 1, 0),
    cap: int('--cap', values.cap, DEFAULT_TURN_CAP, 1),
    party: int('--party', values.party, partySize(profile), 1, MAX_PARTY),
    preset,
    upgrades,
    rules,
    classId: parseContentId('--class', 'class', values.class),
    raceId: parseContentId('--race', 'race', values.race),
    contract: parseContract(values.contract),
    recruits: values.recruits ?? false,
    partySweep: values['party-sweep'] ?? false,
    jobs: int('--jobs', values.jobs, defaultJobs(), 1, MAX_JOBS),
    json: values.json ?? null,
    compare: values.compare ?? null,
    baseline: values.baseline ?? null,
    help: values.help ?? false,
  };
}

/** Reads a whole-number option, or `fallback` when absent. Throws a readable `Error` when out of range. */
export function int(name: string, raw: string | undefined, fallback: number, min: number, max = Number.MAX_SAFE_INTEGER): number {
  if (raw === undefined) return fallback;
  const n = Number(raw);
  if (!Number.isSafeInteger(n) || n < min || n > max) {
    throw new Error(`${name} must be a whole number from ${min}${max === Number.MAX_SAFE_INTEGER ? ' up' : ` to ${max}`}, got "${raw}"`);
  }
  return n;
}
