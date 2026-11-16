/**
 * The messages between the worker host and its worker (docs/ARCHITECTURE.md §7). All plain
 * data, posted with structured clone.
 */
import type { Command } from '../commands';
import type { RunConfig } from '../state';
import { isSpeed } from './types';
import type { HostUpdate, Speed } from './types';

/** From the UI thread to the worker. */
export type HostRequest =
  | { type: 'start'; config: RunConfig; seed: number }
  | { type: 'command'; command: Command }
  | { type: 'setSpeed'; speed: Speed };

/** From the worker to the UI thread. */
export type HostMessage =
  /** Events since the last update, in order, then the snapshot after them. */
  | ({ type: 'update' } & HostUpdate)
  /** The worker could not do what it was asked, or the sim threw. The run is paused. */
  | { type: 'error'; message: string };

/**
 * Checks the shape of a message the worker received, or returns why it is malformed. Commands
 * and configs are checked again where they are used (`applyCommand`, `createRun`).
 */
export function readHostRequest(data: unknown): HostRequest | string {
  if (typeof data !== 'object' || data === null) return 'Not a message object';
  const message = data as Record<string, unknown>;
  switch (message.type) {
    case 'start':
      if (typeof message.config !== 'object' || message.config === null) return 'start needs a config';
      if (typeof message.seed !== 'number' || !Number.isFinite(message.seed)) return 'start needs a numeric seed';
      return { type: 'start', config: message.config as RunConfig, seed: message.seed };
    case 'command':
      return { type: 'command', command: message.command as Command };
    case 'setSpeed':
      if (!isSpeed(message.speed)) return `Unknown speed ${String(message.speed)}`;
      return { type: 'setSpeed', speed: message.speed };
    default:
      return `Unknown message type "${String(message.type)}"`;
  }
}
