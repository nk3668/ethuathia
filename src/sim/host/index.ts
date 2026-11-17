/**
 * Running the sim (docs/ARCHITECTURE.md §7). The worker half of `WorkerHost` needs timers and
 * worker globals, so it lives in `src/ui/host/`; everything here is pure.
 */
export { InlineHost } from './inline';
export { MAX_SLICE_MS, MAX_STEPS_PER_PUMP, PacedRunner, SNAPSHOT_INTERVAL_MS, TURNS_PER_SECOND } from './paced';
export type { Clock } from './paced';
export { readHostRequest } from './protocol';
export type { HostMessage, HostRequest } from './protocol';
export { SimSession } from './session';
export { deliver, isSpeed, Listeners, SPEEDS } from './types';
export type { HostUpdate, SimHost, Speed, Unsubscribe } from './types';
