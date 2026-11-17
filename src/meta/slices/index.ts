/**
 * The one place profile slices are composed (docs/ARCHITECTURE.md §6.1). A feature that keeps
 * data between runs adds its slice file next to these and one line here; the `Profile` type,
 * `newProfile`, `applyRunResult`, validation and saves all follow from this record.
 *
 * Order matters only for `applyRunResult`: slices run their `onRunResult` steps in this order.
 */
import { currenciesSlice } from './currencies';
import { historySlice } from './history';

export const PROFILE_SLICES = {
  currencies: currenciesSlice,
  history: historySlice,
} as const;
