/**
 * `npm run sim -- --seeds N`: runs N seeded floors headlessly and prints the report from
 * `tools/headless.ts`. Run with `tsx`, which loads the TypeScript sources directly. Everything
 * happens on this machine; nothing is fetched.
 */
import { performance } from 'node:perf_hooks';
import { formatReport, headlessParty, parseSimArgs, runSeeds, USAGE } from './headless';
import type { SimArgs } from './headless';

function main(argv: readonly string[]): number {
  let args: SimArgs;
  try {
    args = parseSimArgs(argv);
  } catch (error) {
    console.error(`${error instanceof Error ? error.message : String(error)}\n\n${USAGE}`);
    return 2;
  }
  if (args.help) {
    console.log(USAGE);
    return 0;
  }

  const last = args.from + args.seeds - 1;
  console.log(
    `Headless run: seeds ${args.from}-${last}, party of ${args.party}, cap ${args.cap} party turns per floor\n`,
  );
  const started = performance.now();
  const results = runSeeds(args.from, args.seeds, { cap: args.cap, party: headlessParty(args.party) });
  const seconds = (performance.now() - started) / 1000;
  console.log(formatReport(results, args.cap));
  console.log(`\nRan in ${seconds.toFixed(2)} s.`);
  return 0;
}

process.exitCode = main(process.argv.slice(2));
