/**
 * The Web Worker that runs the sim for `WorkerHost`. Loaded with
 * `new Worker(new URL('./sim.worker.ts', import.meta.url), { type: 'module' })`.
 */
import { serveSim } from './serve';
import type { ServePort } from './serve';

serveSim(self as unknown as ServePort);
