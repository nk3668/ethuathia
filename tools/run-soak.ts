/**
 * `npm run soak -- --seeds N --cap T`: the soak from `tools/soak.ts` at a larger scale than the
 * one in `npm test`. Exits with code 1 if any seed fails.
 */
import { parseArgs } from 'node:util';
import { performance } from 'node:perf_hooks';
import { DEFAULT_SOAK_CAP, formatSoakReport, soakSeeds } from './soak';
import { int } from './headless';

const USAGE = `Usage: npm run soak -- [--seeds N] [--from S] [--cap T]

Plays N seeded runs (party sizes 1 to 4 in turn) for T party turns each, checks every state
invariant after every step, saves and loads each run halfway and checks it carries on the same,
and fails on any throw or stuck storm.

  --seeds N   how many seeds to run (default 100)
  --from S    the first seed (default 1)
  --cap T     party turns per seed (default ${DEFAULT_SOAK_CAP})
  --help      show this text`;

function main(argv: readonly string[]): number {
  let seeds: number, from: number, cap: number;
  try {
    const { values } = parseArgs({
      args: [...argv],
      options: {
        seeds: { type: 'string', short: 'n' },
        from: { type: 'string' },
        cap: { type: 'string' },
        help: { type: 'boolean', short: 'h' },
      },
      strict: true,
      allowPositionals: false,
    });
    if (values.help) {
      console.log(USAGE);
      return 0;
    }
    seeds = int('--seeds', values.seeds, 100, 1);
    from = int('--from', values.from, 1, 0);
    cap = int('--cap', values.cap, DEFAULT_SOAK_CAP, 1);
  } catch (error) {
    console.error(`${error instanceof Error ? error.message : String(error)}\n\n${USAGE}`);
    return 2;
  }

  console.log(`Soak: seeds ${from}-${from + seeds - 1}, cap ${cap} party turns\n`);
  const started = performance.now();
  const results = soakSeeds(from, seeds, { cap });
  console.log(formatSoakReport(results, cap));
  console.log(`\nRan in ${((performance.now() - started) / 1000).toFixed(2)} s.`);
  return results.some((r) => r.outcome === 'failed') ? 1 : 0;
}

process.exitCode = main(process.argv.slice(2));
