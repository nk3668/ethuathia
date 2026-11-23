/**
 * core: seeded RNG, Grid, Registry, ids and number formatting.
 * May import: nothing. See docs/ARCHITECTURE.md §1.
 */
export { formatNumber } from './format';
export { DIRS_4, DIRS_8, Grid, isGridBuffer } from './grid';
export { hashText } from './hash';
export type { GridBuffer, GridCells, GridData, GridKind, Pos } from './grid';
export { assertPlainData, clonePlain, findNonPlain } from './plain';
export { Registry } from './registry';
export type { Def } from './registry';
export { clampRange } from './range';
export { isRngState, Rng, seedState, seedStreams } from './rng';
export type { RngState } from './rng';
export { checkGrammar, expand, MAX_GRAMMAR_DEPTH, parseTemplate, TEXT_FILTERS, textRng } from './textGen';
export type { ExpandOptions, Grammar, GrammarRule, GrammarSpec, ParseTemplateResult, TemplatePart, TextFilter, TextVars } from './textGen';
