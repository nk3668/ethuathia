/**
 * Turning a `RunState` into a string and back, for saves and for sending a run between hosts.
 *
 * The format is JSON. Grids (`GridBuffer`s) are written as `{ "$grid": GridData }`, the
 * run-length encoding from core, and read back into typed arrays. Any grid anywhere in the state
 * is handled this way, so new grids need no serializer changes.
 */
import { assertPlainData, Grid, hashText, isGridBuffer, isRngState } from '../core';
import type { GridData } from '../core';
import { RNG_STREAMS, STATE_VERSION } from './state';
import type { RunState } from './state';

const GRID_TAG = '$grid';

/**
 * The state as a string. Throws if the state is not plain data (see `findNonPlain`), naming the
 * offending path, since such a state would not load back the same.
 */
export function serialize(state: RunState): string {
  assertPlainData(state, 'Run state');
  return JSON.stringify(state, replacer);
}

function replacer(_key: string, value: unknown): unknown {
  if (typeof value !== 'object' || value === null) return value;
  if (isGridBuffer(value)) return { [GRID_TAG]: Grid.wrap(value).toData() };
  if (ArrayBuffer.isView(value)) {
    throw new TypeError('Run state has a typed array outside a grid; only GridBuffer cells may be typed arrays');
  }
  if (Object.hasOwn(value, GRID_TAG)) {
    throw new TypeError(`Run state has an object with a "${GRID_TAG}" key, which is reserved for grids`);
  }
  return value;
}

function reviver(_key: string, value: unknown): unknown {
  if (typeof value === 'object' && value !== null && Object.hasOwn(value, GRID_TAG)) {
    return Grid.fromData((value as Record<string, GridData>)[GRID_TAG] as GridData).toBuffer();
  }
  return value;
}

/**
 * Reads a state written by `serialize`. Throws on malformed text, a different `STATE_VERSION`
 * (migrations belong to the save layer), bad RNG state or a corrupt grid.
 */
export function deserialize(text: string): RunState {
  const state = JSON.parse(text, reviver) as unknown;
  if (typeof state !== 'object' || state === null || Array.isArray(state)) {
    throw new TypeError('Run state text does not hold an object');
  }
  const { version, rng } = state as Partial<RunState>;
  if (version !== STATE_VERSION) {
    throw new Error(`Run state version ${String(version)} is not the current version ${STATE_VERSION}`);
  }
  for (const stream of RNG_STREAMS) {
    if (!isRngState(rng?.[stream])) throw new TypeError(`Run state has a bad "${stream}" RNG state`);
  }
  return state as RunState;
}

/**
 * A short fingerprint of the whole state: the hash of `serialize(state)`. Two states with the same
 * hash are, for all practical purposes, the same run at the same moment, so determinism tests and
 * the headless run report compare these rather than whole saves (docs/ARCHITECTURE.md §10).
 */
export function stateHash(state: RunState): string {
  return hashText(serialize(state));
}
