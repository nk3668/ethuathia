/**
 * The `currencies` slice: banked Renown, Trophies and Favor per deity (CLAUDE.md §3). Banked
 * currency is never at risk; a run adds `(atRisk - lost) + (converted ?? {})` to it when it ends.
 */
import { addCurrencies, currenciesSchema, emptyCurrencies } from '../currencies';
import { bankedFromRunResult } from '../runResult';
import type { Currencies } from '../currencies';
import { defineSlice } from '../slice';

export const currenciesSlice = defineSlice<Currencies>({
  version: 1,
  schema: currenciesSchema,
  init: emptyCurrencies,
  onRunResult: (banked, result) => addCurrencies(banked, bankedFromRunResult(result)),
});
