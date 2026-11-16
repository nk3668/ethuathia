/**
 * core: seeded RNG, Grid, Registry, ids and number formatting.
 * May import: nothing. See docs/ARCHITECTURE.md §1.
 */
export { formatNumber } from './format';
export { DIRS_4, DIRS_8, Grid, isGridBuffer } from './grid';
export type { GridBuffer, GridCells, GridData, GridKind, Pos } from './grid';
export { assertPlainData, clonePlain, findNonPlain } from './plain';
export { Registry } from './registry';
export type { Def } from './registry';
export { isRngState, Rng, seedState, seedStreams } from './rng';
export type { RngState } from './rng';
