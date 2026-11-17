/**
 * The `currencies` slice: banked Renown, Trophies and Favor per deity (CLAUDE.md §3). Banked
 * currency is never at risk; a run adds `atRisk - lost` to it when it ends.
 */
import { addCurrencies, currenciesSchema, emptyCurrencies, subtractCurrencies } from '../currencies';
import { currenciesFromRewards } from '../runResult';
import type { Currencies } from '../currencies';
import { defineSlice } from '../slice';

export const currenciesSlice = defineSlice<Currencies>({
  version: 1,
  schema: currenciesSchema,
  init: emptyCurrencies,
  onRunResult: (banked, result) =>
    addCurrencies(banked, subtractCurrencies(currenciesFromRewards(result.atRisk), currenciesFromRewards(result.lost))),
});
