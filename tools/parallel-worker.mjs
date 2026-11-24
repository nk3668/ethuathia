// Worker for tools/parallel.ts. Plain JS because a worker thread has no TypeScript loader of its
// own: it registers tsx, then loads the harness. Takes { seed, options }, replies with the result.
import { parentPort } from 'node:worker_threads';

const { register } = await import('tsx/esm/api');
register();
const { runSeed } = await import('./headless.ts');

parentPort.on('message', ({ seed, options }) => {
  try {
    parentPort.postMessage({ seed, result: runSeed(seed, options) });
  } catch (error) {
    parentPort.postMessage({ seed, error: error instanceof Error ? error.stack ?? error.message : String(error) });
  }
});
