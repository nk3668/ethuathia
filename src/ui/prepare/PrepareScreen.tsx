import { useCallback, useEffect, useRef } from 'react';
import type { RunChoiceKey, RunChoices } from '../../meta';
import { Button, Panel } from '../kit';
import { useProfileStore } from '../stores/profileStore';
import { useRunStore } from '../stores/runStore';
import styles from './PrepareScreen.module.css';
import { PREPARE_PANELS } from './registry';
import { PREPARE_COLUMNS } from './types';
import type { PreparePanelDef } from './types';

/**
 * The Prepare screen (CLAUDE.md §2, docs/VISUAL-DESIGN.md §6.1): where the player sets up the
 * next run and presses **Descend**. It fills the middle of the shell (party, map and log areas);
 * the side tabs stay, so the Town can be visited before descending.
 *
 * The screen only lays out the panels from `PREPARE_PANELS` in their columns. Each panel edits
 * its section of the profile's remembered choices (`profileStore.updateRunChoices`), so the
 * choices survive a reload and auto-restart reuses them. Descend starts a run from them through
 * the starter `App` registers (`buildRunConfig`).
 */
export function PrepareScreen() {
  const profile = useProfileStore((s) => s.profile);
  const updateRunChoices = useProfileStore((s) => s.updateRunChoices);
  const startNext = useRunStore((s) => s.startNext);
  const startError = useRunStore((s) => s.startError);
  const descend = useRef<HTMLButtonElement>(null);
  const choices = profile.prepare.choices;

  const update = useCallback(
    <K extends RunChoiceKey>(key: K, value: RunChoices[K]) => updateRunChoices({ [key]: value } as Partial<RunChoices>),
    [updateRunChoices],
  );

  useEffect(() => descend.current?.focus(), []);

  const shown = PREPARE_PANELS.filter((p) => p.shown?.(profile) ?? true);
  const columns = PREPARE_COLUMNS.map((c) => ({ ...c, panels: shown.filter((p) => p.column === c.id) })).filter((c) => c.panels.length > 0);

  const panel = (p: PreparePanelDef) => (
    <Panel key={p.id} title={p.title} data-testid={`prepare-${p.id}`}>
      <p.Component profile={profile} choices={choices} update={update} />
    </Panel>
  );

  return (
    <section className={styles.screen} aria-labelledby="prepare-title">
      <header className={styles.header}>
        <h1 id="prepare-title" className={styles.title}>
          Prepare the next run
        </h1>
        <p className={styles.lead}>Choose who goes and where. Spend currencies in the Town tab first: upgrades apply from the next run.</p>
      </header>
      {startError !== null && (
        <p role="alert" className={styles.error}>
          <span aria-hidden="true">✕ </span>
          The run could not start: {startError}
        </p>
      )}
      <div className={styles.columns}>
        {columns.map((c) => (
          <div key={c.id} className={styles.column} role="group" aria-label={c.label}>
            <h2 className={styles.columnLabel}>{c.label}</h2>
            {c.panels.map(panel)}
          </div>
        ))}
      </div>
      <footer className={styles.footer}>
        <Button ref={descend} variant="primary" className={styles.descend} onClick={startNext}>
          Descend
        </Button>
      </footer>
    </section>
  );
}
