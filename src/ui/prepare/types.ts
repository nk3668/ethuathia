/**
 * Prepare screen panels (ETH-064, docs/VISUAL-DESIGN.md §6.1). Each panel is one `.ts` file in
 * `panels/` whose default export is a `definePreparePanel` result (its component lives in
 * `components/`, so fast refresh keeps working); `registry.ts` picks every file up on its own.
 * A later feature (contracts, bounties, Omens, the patron) adds its panel and component with no
 * edit to the screen, next to its choice section in `src/meta/prepare/`.
 */
import type { ComponentType } from 'react';
import type { Profile, RunChoiceKey, RunChoices } from '../../meta';

/** The screen's columns, in the order the decisions are made (CLAUDE.md §2). */
export const PREPARE_COLUMNS = [
  { id: 'party', label: 'Party' },
  { id: 'loadout', label: 'Loadout & rules' },
  { id: 'risk', label: 'Where & how hard' },
] as const;

export type PrepareColumn = (typeof PREPARE_COLUMNS)[number]['id'];

export interface PreparePanelProps {
  readonly profile: Profile;
  /** The remembered choices, every section filled in. */
  readonly choices: RunChoices;
  /** Replaces one section's choice; the profile remembers it for the next run and auto-restart. */
  update<K extends RunChoiceKey>(key: K, value: RunChoices[K]): void;
}

export interface PreparePanelDef {
  /** Unique; also the panel's test id (`prepare-<id>`). */
  readonly id: string;
  /** The panel heading. */
  readonly title: string;
  readonly column: PrepareColumn;
  /** Order within the column: lower first. */
  readonly order: number;
  readonly Component: ComponentType<PreparePanelProps>;
  /** Leave the panel out for this profile (e.g. Omens before any is unlocked). Default: shown. */
  shown?(profile: Profile): boolean;
}

/** Declares a panel. Make it the default export of a `.ts` file in `ui/prepare/panels/`. */
export function definePreparePanel(def: PreparePanelDef): PreparePanelDef {
  return def;
}
