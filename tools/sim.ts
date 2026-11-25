/**
 * `npm run sim -- --seeds N`: runs N seeded dungeons headlessly and prints the report from
 * `tools/headless.ts`. `--json FILE` also saves the report; `--compare REF` and `--baseline FILE`
 * print a before/after table (`tools/compare.ts`). Run with `tsx`, which loads the TypeScript
 * sources directly. Everything happens on this machine; nothing is fetched.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { formatComparison, makeReport, parseReport, resolveCompareRef, runRef } from './compare';
import type { SimReport } from './compare';
import { formatReport, parseSimArgs, partyOptions, USAGE } from './headless';
import type { SimArgs } from './headless';
import { runPartySweep, runSeedsParallel } from './parallel';

async function main(argv: readonly string[]): Promise<number> {
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

  if (args.partySweep && (args.compare !== null || args.baseline !== null || args.json !== null)) {
    console.error(`--party-sweep prints its own table and can't be combined with --compare, --baseline or --json

${USAGE}`);
    return 2;
  }
  if (args.partySweep) {
    console.log(`Party sweep: seeds ${args.from}-${args.from + args.seeds - 1}, preset ${args.preset}, rules ${args.rules}, cap ${args.cap}\n`);
    const started = performance.now();
    console.log(await runPartySweep(args));
    console.log(`\nRan in ${((performance.now() - started) / 1000).toFixed(2)} s on ${args.jobs} job${args.jobs === 1 ? '' : 's'}.`);
    return 0;
  }

  let before: SimReport | null = null;
  let label = 'before';
  const warnings: string[] = [];
  try {
    if (args.baseline !== null) {
      before = parseReport(readFileSync(args.baseline, 'utf8'), args.baseline);
      label = 'baseline';
    } else if (args.compare !== null) {
      const resolved = resolveCompareRef(args.compare);
      if (resolved.warning !== null) {
        console.warn(resolved.warning);
        warnings.push(resolved.warning);
      }
      const target =
        resolved.baseRef !== null
          ? `${resolved.label} (${resolved.sha.slice(0, 7)}, with ${resolved.baseRef})`
          : resolved.label;
      console.log(`Running the same seeds on ${target} for the baseline...`);
      before = runRef(resolved, args);
      label = resolved.label;
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }

  const last = args.from + args.seeds - 1;
  const details = [
    `seeds ${args.from}-${last}`,
    `party of ${args.party}`,
    `cap ${args.cap} party turns per run`,
    `preset ${args.preset}`,
    `rules ${args.rules}`,
    ...(args.recruits ? ['random recruits'] : []),
    ...(args.classId === null ? [] : [`class ${args.classId}`]),
    ...(args.raceId === null ? [] : [`race ${args.raceId}`]),
    ...(args.contract === null ? [] : [`contract ${args.contract}`]),
    ...(args.omens.length === 0 ? [] : [`omens ${args.omens.map((o) => `${o.id}:${o.rank}`).join(',')}`]),
    ...(args.upgrades.length === 0 ? [] : [`upgrades ${args.upgrades.join(',')}`]),
    ...(args.optIns ? [] : ['opt-ins off']),
  ].join(', ');
  console.log(`Headless run: ${details}\n`);
  const started = performance.now();
  const results = await runSeedsParallel(
    args.from,
    args.seeds,
    {
      cap: args.cap,
      ...partyOptions(args.party, args),
      preset: args.preset,
      upgrades: args.upgrades,
      optIns: args.optIns,
      rules: args.rules,
      ...(args.contract === null ? {} : { contracts: [args.contract] }),
      ...(args.omens.length === 0 ? {} : { omens: args.omens }),
    },
    args.jobs,
  );
  const seconds = (performance.now() - started) / 1000;
  console.log(formatReport(results, args.cap));
  console.log(`\nRan in ${seconds.toFixed(2)} s on ${args.jobs} job${args.jobs === 1 ? '' : 's'}.`);

  const report = makeReport(args, results);
  if (args.json !== null) {
    writeFileSync(args.json, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`Report written to ${args.json}.`);
  }
  if (before !== null) {
    let table: string;
    try {
      table = formatComparison(before, report, { before: label, after: 'this' }, warnings);
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      return 1;
    }
    console.log(`\nComparison (${label} -> this checkout):\n`);
    console.log(table);
  }
  return 0;
}

process.exitCode = await main(process.argv.slice(2));
