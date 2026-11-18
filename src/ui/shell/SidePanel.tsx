import { useEffect, useRef } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { CodexPanel } from '../codex/CodexPanel';
import { Button, Panel, Tabs } from '../kit';
import type { TabItem } from '../kit';
import { isSideTab, SIDE_TABS, useUiStore } from '../stores/uiStore';
import type { SideTab } from '../stores/uiStore';
import { TownPanel } from '../town/TownPanel';
import { OptionsPanel } from './OptionsPanel';
import { SaveOptions } from './SaveOptions';
import styles from './SidePanel.module.css';

/** Each tab's label and, until its feature lands, a line saying when it will. */
const TAB_INFO: Readonly<Record<SideTab, { label: string; empty: string }>> = {
  rules: { label: 'Rules', empty: 'Behavior rules arrive in M3.' },
  town: { label: 'Town', empty: 'The Town opens in M2.' },
  codex: { label: 'Codex', empty: 'The Codex fills in as you discover things, from M2.' },
  graveyard: { label: 'Graveyard', empty: 'No one has fallen yet.' },
  stats: { label: 'Stats', empty: 'Run statistics arrive in M1.' },
  options: { label: 'Options', empty: 'No options yet.' },
};

/** Tabs whose feature has landed: one line per tab. The rest show their `empty` line. */
const TAB_CONTENT: Partial<Record<SideTab, ReactNode>> = {
  town: <TownPanel />,
  codex: <CodexPanel />,
  options: (
    <>
      <OptionsPanel />
      <SaveOptions />
    </>
  ),
};

const ITEMS: TabItem[] = SIDE_TABS.map((id) => ({
  id,
  label: TAB_INFO[id].label,
  content: TAB_CONTENT[id] ?? <p className={styles.empty}>{TAB_INFO[id].empty}</p>,
}));

/** The tabbed side panel: Rules, Town, Codex, Graveyard, Stats and Options. */
export function SidePanel({ className }: { className?: string }) {
  const tab = useUiStore((s) => s.tab);
  const openTab = useUiStore((s) => s.openTab);
  return (
    <Panel aria-label="Side panel" className={className}>
      <Tabs
        label="Side panel"
        items={ITEMS}
        value={tab}
        onChange={(id) => {
          if (isSideTab(id)) openTab(id);
        }}
        className={styles.tabs}
      />
    </Panel>
  );
}

export interface SideDrawerProps {
  id: string;
  onClose(): void;
}

/**
 * The side panel as a slide-over drawer, for narrow windows. It is a modal dialog: the shell
 * makes everything behind it inert, Escape and the backdrop close it, and focus starts on its
 * close button.
 */
export function SideDrawer({ id, onClose }: SideDrawerProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
    }
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.backdrop} aria-hidden="true" onClick={onClose} />
      <div
        id={id}
        role="dialog"
        aria-modal="true"
        aria-label="Side panel"
        className={styles.drawer}
        onKeyDown={onKeyDown}
      >
        <div className={styles.drawerHeader}>
          <Button ref={closeRef} variant="ghost" onClick={onClose}>
            <span aria-hidden="true">✕</span> Close
          </Button>
        </div>
        <SidePanel className={styles.drawerPanel} />
      </div>
    </div>
  );
}
