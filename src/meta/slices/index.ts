/**
 * The one place profile slices are composed (docs/ARCHITECTURE.md §6.1). A feature that keeps
 * data between runs adds its slice file next to these and one line here; the `Profile` type,
 * `newProfile`, `applyRunResult`, validation and saves all follow from this record.
 *
 * Order matters only for `applyRunResult`: slices run their `onRunResult` steps in this order.
 */
import { codexSlice } from './codex';
import { currenciesSlice } from './currencies';
import { historySlice } from './history';
import { milestonesSlice } from './milestones';
import { settingsSlice } from './settings';
import { upgradesSlice } from './upgrades';

export const PROFILE_SLICES = {
  currencies: currenciesSlice,
  history: historySlice,
  upgrades: upgradesSlice,
  codex: codexSlice,
  settings: settingsSlice,
  milestones: milestonesSlice,
} as const;
