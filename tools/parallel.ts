/**
 * Runs headless seeds on a pool of worker threads (ETH-152, docs/ARCHITECTURE.md §11.4).
 * A seed's result depends only on the seed and the options, so workers share nothing: each one takes
 * a seed, runs it with `runSeed` and posts the `SeedResult` back. Results are stored by seed, so the
 * returned array is in seed order whatever order the workers finish in, and `--jobs 1` and
 * `--jobs N` give identical reports. `jobs <= 1` runs serially in this thread.
 */
import { Worker } from 'node:worker_threads';
import { formatPartySweep, MAX_PARTY, partyOptions, partySweepRow, runSeeds } from './headless';
import type { HeadlessOptions, SeedResult, SimArgs } from './headless';

interface Reply {
  seed: number;
  result?: SeedResult;
  error?: string;
}

/** Runs `count` seeds from `from` on up to `jobs` worker threads. Results are in seed order. */
export async function runSeedsParallel(
  from: number,
  count: number,
  options: HeadlessOptions,
  jobs: number,
): Promise<SeedResult[]> {
  const size = Math.min(jobs, count);
  if (size <= 1) return runSeeds(from, count, options);

  const results = new Array<SeedResult>(count);
  const workers: Worker[] = [];
  try {
    await new Promise<void>((resolve, reject) => {
      let next = 0;
      let done = 0;
      const give = (worker: Worker): void => {
        if (next < count) worker.postMessage({ seed: from + next++, options });
      };
      for (let i = 0; i < size; i++) {
        const worker = new Worker(new URL('./parallel-worker.mjs', import.meta.url));
        workers.push(worker);
        worker.on('message', (reply: Reply) => {
          if (reply.result === undefined) {
            reject(new Error(`Seed ${reply.seed} failed in a worker: ${reply.error ?? 'unknown error'}`));
            return;
          }
          results[reply.seed - from] = reply.result;
          done++;
          if (done === count) resolve();
          else give(worker);
        });
        worker.on('error', reject);
        worker.on('exit', (code) => {
          if (done < count) reject(new Error(`A harness worker exited early (code ${code}).`));
        });
        give(worker);
      }
    });
  } finally {
    await Promise.all(workers.map((w) => w.terminate()));
  }
  return results;
}

/** `--party-sweep`: runs party sizes 1 to `MAX_PARTY` on the pool, one size after another, and returns the table text. */
export async function runPartySweep(
  args: Pick<SimArgs, 'from' | 'seeds' | 'cap' | 'preset' | 'upgrades' | 'rules' | 'jobs'> &
    Partial<Pick<SimArgs, 'classId' | 'raceId' | 'recruits' | 'optIns' | 'omens' | 'contract'>>,
): Promise<string> {
  const rows = [];
  for (let size = 1; size <= MAX_PARTY; size++) {
    const results = await runSeedsParallel(
      args.from,
      args.seeds,
      {
        cap: args.cap,
        ...partyOptions(size, args),
        preset: args.preset,
        upgrades: args.upgrades,
        rules: args.rules,
        ...(args.optIns === false ? { optIns: false } : {}),
        ...(args.contract !== undefined && args.contract !== null ? { contracts: [args.contract] } : {}),
        ...(args.omens !== undefined && args.omens.length > 0 ? { omens: args.omens } : {}),
      },
      args.jobs,
    );
    rows.push(partySweepRow(size, results));
  }
  return formatPartySweep(rows);
}
