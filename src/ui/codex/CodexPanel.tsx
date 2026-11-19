/**
 * The Codex (docs/VISUAL-DESIGN.md §5.3, ETH-065, ETH-092): a field-journal view of every class,
 * race, monster, item, Omen, deity… one section per content kind, filled in as the player
 * discovers things.
 *
 * `CodexPanel` is the two-pane journal body: categories, search and entry list on the left, the
 * selected entry's page (large glyph, lore, stat table, and kill/death record) on the right. At
 * tablet width (`NARROW_QUERY`, under 1000px) it collapses to one pane at a time with a Back
 * button on the entry page. `CodexModal` hosts `CodexPanel` in a wide modal dialog with keyboard
 * navigation and focus return; `CodexTab` is the side-panel launcher.
 *
 * Sections and entry views come from the kind renderers in `renderers/`; this file never names a
 * kind.
 */
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { CodexDiscoveries, CodexMark } from '../../sim';
import { Button } from '../kit';
import { NARROW_QUERY, useMediaQuery } from '../shell/useMediaQuery';
import { useProfileStore } from '../stores/profileStore';
import { useSimStore } from '../stores/simStore';
import { useUiStore } from '../stores/uiStore';
import styles from './CodexPanel.module.css';
import { GlyphMark } from './Explain';
import { ALL_RENDERERS, entryGlyph, entryMarks } from './registry';
import type { CodexEntry } from './registry';
import type { CodexRenderer } from './types';
import { useDiscovered } from './useDiscovered';

const MARK_LABEL: Readonly<Record<CodexMark, string>> = { seen: 'Seen', killed: 'Slain', used: 'Used' };

const DEFAULT_HINT = 'Not discovered yet.';

/** One row of a section: a known entry with its marks, or an unknown one. */
interface Row {
  readonly entry: CodexEntry;
  readonly marks: readonly CodexMark[] | null;
}

interface Section {
  readonly renderer: CodexRenderer;
  readonly kind: string;
  /** Entries by group, groups in first-appearance order; `''` is "no group". */
  readonly groups: readonly (readonly [string, readonly Row[]])[];
  readonly known: number;
  readonly total: number;
}

/** True if a known entry matches the search words (name, description, group or tags). */
function matches(entry: CodexEntry, words: readonly string[]): boolean {
  const { def, renderer } = entry;
  const haystack = [def.name, def.description, renderer.group?.(def) ?? '', renderer.label, ...def.tags].join(' ').toLowerCase();
  return words.every((w) => haystack.includes(w));
}

/** The visible sections for the current discoveries, search and filter. */
function buildSections(discovered: CodexDiscoveries, query: string, only: string | null): Section[] {
  const words = query.toLowerCase().split(/\s+/).filter((w) => w !== '');
  const out: Section[] = [];
  for (const renderer of ALL_RENDERERS) {
    const kind = renderer.registry.kind;
    const defs = renderer.registry.all();
    if (renderer.hidden === true || defs.length === 0 || (only !== null && only !== kind)) continue;
    const groups = new Map<string, Row[]>();
    let known = 0;
    for (const def of defs) {
      const entry: CodexEntry = { def, renderer };
      const marks = entryMarks(entry, discovered);
      if (marks !== null) known++;
      // Unknown entries never match a search: their names are the secret.
      if (words.length > 0 && (marks === null || !matches(entry, words))) continue;
      const group = renderer.group?.(def) ?? '';
      const rows = groups.get(group) ?? [];
      rows.push({ entry, marks });
      groups.set(group, rows);
    }
    if (groups.size > 0) out.push({ renderer, kind, groups: [...groups], known, total: defs.length });
  }
  return out;
}

/** Flattens every row across `sections` in display order, for keyboard navigation and default selection. */
function flattenRows(sections: readonly Section[]): Row[] {
  const rows: Row[] = [];
  for (const section of sections) {
    for (const [, groupRows] of section.groups) {
      for (const row of groupRows) rows.push(row);
    }
  }
  return rows;
}

/**
 * Combat record for an entry: how many times the party has slain it, and how many party members
 * have fallen to it across recorded history and the live run.
 */
function useEncounterRecord(entry: CodexEntry, marks: readonly CodexMark[] | null): { kills: number; deaths: number } | null {
  const id = entry.def.id;
  const nameLower = entry.def.name.toLowerCase();
  const profile = useProfileStore((s) => s.profile);
  const events = useSimStore((s) => s.events);
  const chronicle = useSimStore((s) => s.chronicle);

  return useMemo(() => {
    const profileKillsRecord = (profile.codex as { kills?: Readonly<Record<string, number>> }).kills;
    const bankedKills = profileKillsRecord?.[id] ?? 0;
    let liveKills = 0;
    for (const { event } of events) {
      if (event.type === 'killed' && event.byParty && event.victimDef === id) liveKills++;
    }
    const minFromMark = marks?.includes('killed') === true ? 1 : 0;
    const kills = Math.max(bankedKills + liveKills, minFromMark);

    let deaths = 0;
    for (const run of profile.history.recent) {
      const momentDeaths = run.moments.filter((m) => m.kind === 'adventurerFell' && m.ids.includes(id)).length;
      if (momentDeaths > 0) {
        deaths += momentDeaths;
      } else {
        for (const member of run.party) {
          if (member.fell?.how?.toLowerCase().includes(nameLower) === true) deaths++;
        }
      }
    }
    for (const moment of chronicle.entries) {
      if (moment.kind === 'adventurerFell' && moment.ids.includes(id)) deaths++;
    }

    const isCombatKind = entry.renderer.registry.kind === 'monster';
    if (!isCombatKind && kills === 0 && deaths === 0) return null;
    return { kills, deaths };
  }, [id, nameLower, profile, events, chronicle, marks, entry.renderer.registry.kind]);
}

export function CodexPanel() {
  const discovered = useDiscovered();
  const narrow = useMediaQuery(NARROW_QUERY);
  const [query, setQuery] = useState('');
  const [only, setOnly] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const searchId = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  const pendingFocusId = useRef<string | null>(null);

  const sections = useMemo(() => buildSections(discovered, query, only), [discovered, query, only]);
  const allRows = useMemo(() => flattenRows(sections), [sections]);
  const kinds = useMemo(() => ALL_RENDERERS.filter((r) => r.hidden !== true && r.registry.all().length > 0), []);

  // Keep a valid active row: the user's pick if still visible, else the first discovered row, else the first row.
  const activeRow = useMemo((): Row | null => {
    if (allRows.length === 0) return null;
    if (selectedId !== null) {
      const found = allRows.find((r) => r.entry.def.id === selectedId);
      if (found !== undefined) return found;
    }
    return allRows.find((r) => r.marks !== null) ?? allRows[0] ?? null;
  }, [allRows, selectedId]);

  const activeId = activeRow?.entry.def.id ?? null;

  // When returning from the tablet detail pane to the list pane, restore focus to the entry row.
  useEffect(() => {
    if (!detailOpen && pendingFocusId.current !== null) {
      const id = pendingFocusId.current;
      pendingFocusId.current = null;
      const btn = listRef.current?.querySelector<HTMLButtonElement>(`button[data-entry="${id}"]`);
      btn?.focus();
    }
  }, [detailOpen]);

  const selectEntry = (id: string, openDetailPane: boolean) => {
    setSelectedId(id);
    if (narrow && openDetailPane) {
      setDetailOpen(true);
      queueMicrotask(() => backRef.current?.focus());
    }
  };

  const handleBackToList = () => {
    pendingFocusId.current = activeId;
    setDetailOpen(false);
  };

  const handleListKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null;
    const currentId = target?.getAttribute('data-entry');
    if (!currentId || allRows.length === 0) return;
    const index = allRows.findIndex((r) => r.entry.def.id === currentId);
    if (index === -1) return;

    let nextIndex = -1;
    if (event.key === 'ArrowDown') nextIndex = Math.min(allRows.length - 1, index + 1);
    else if (event.key === 'ArrowUp') nextIndex = Math.max(0, index - 1);
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = allRows.length - 1;

    if (nextIndex !== -1 && nextIndex !== index) {
      event.preventDefault();
      const nextRow = allRows[nextIndex];
      if (nextRow !== undefined) {
        const nextId = nextRow.entry.def.id;
        setSelectedId(nextId);
        const btn = listRef.current?.querySelector<HTMLButtonElement>(`button[data-entry="${nextId}"]`);
        btn?.focus();
      }
    }
  };

  const showListPane = !narrow || !detailOpen || activeRow === null;
  const showDetailPane = !narrow || (detailOpen && activeRow !== null);

  return (
    <div className={styles.codex} data-layout={narrow ? 'single' : 'split'}>
      {showListPane && (
        <div className={styles.listPane} ref={listRef} onKeyDown={handleListKeyDown}>
          <div className={styles.controls}>
            <label htmlFor={searchId} className="sr-only">
              Search the Codex
            </label>
            <input
              id={searchId}
              type="search"
              className={styles.search}
              placeholder="Search the Codex"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setDetailOpen(false);
              }}
            />
            <div role="group" aria-label="Codex sections" className={styles.filters}>
              <Button
                variant="ghost"
                pressed={only === null}
                onClick={() => {
                  setOnly(null);
                  setDetailOpen(false);
                }}
              >
                All
              </Button>
              {kinds.map((r) => (
                <Button
                  key={r.registry.kind}
                  variant="ghost"
                  pressed={only === r.registry.kind}
                  onClick={() => {
                    setOnly(r.registry.kind);
                    setDetailOpen(false);
                  }}
                >
                  {r.label}
                </Button>
              ))}
            </div>
          </div>
          <div className={styles.sectionsList}>
            {sections.length === 0 ? (
              <p className={styles.empty}>
                {query.trim() === '' ? 'Nothing here yet.' : `Nothing you have discovered matches “${query.trim()}”.`}
              </p>
            ) : (
              sections.map((s) => (
                <CodexSection key={s.kind} section={s} activeId={activeId} onSelect={(id) => selectEntry(id, true)} />
              ))
            )}
          </div>
        </div>
      )}
      {showDetailPane && (
        <div className={styles.detailPane} role="region" aria-label="Codex entry">
          {narrow && detailOpen && (
            <div className={styles.backBar}>
              <Button ref={backRef} variant="ghost" onClick={handleBackToList}>
                <span aria-hidden="true">←</span> Back to list
              </Button>
            </div>
          )}
          {activeRow === null ? (
            <p className={styles.emptyDetail}>Select an entry from the list to read its page.</p>
          ) : (
            <CodexEntryPage row={activeRow} />
          )}
        </div>
      )}
    </div>
  );
}

function CodexSection({
  section,
  activeId,
  onSelect,
}: {
  section: Section;
  activeId: string | null;
  onSelect(id: string): void;
}) {
  const headingId = useId();
  const { renderer, groups, known, total } = section;
  return (
    <section className={styles.section} aria-labelledby={headingId}>
      <h3 id={headingId} className={styles.sectionHeading}>
        {renderer.label}
        <span className={styles.count}>
          {known} / {total}
          <span className="sr-only"> discovered</span>
        </span>
      </h3>
      {groups.map(([group, rows]) => (
        <div key={group} className={styles.group}>
          {group !== '' && <h4 className={styles.groupHeading}>{group}</h4>}
          <ul className={styles.entries}>
            {rows.map((row) => (
              <CodexRow
                key={row.entry.def.id}
                row={row}
                selected={row.entry.def.id === activeId}
                onSelect={() => onSelect(row.entry.def.id)}
              />
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

function CodexRow({ row, selected, onSelect }: { row: Row; selected: boolean; onSelect(): void }) {
  const { entry, marks } = row;
  if (marks === null) {
    const hint = entry.renderer.hint ?? DEFAULT_HINT;
    return (
      <li className={styles.unknown} title={hint}>
        <button
          type="button"
          className={styles.rowButton}
          data-entry={entry.def.id}
          aria-current={selected ? 'true' : undefined}
          onClick={onSelect}
        >
          <GlyphMark glyph={null} />
          <span>???</span>
          <span className={styles.hint}>{hint}</span>
        </button>
      </li>
    );
  }
  return (
    <li className={styles.entry}>
      <button
        type="button"
        className={styles.rowButton}
        data-entry={entry.def.id}
        aria-current={selected ? 'true' : undefined}
        onClick={onSelect}
      >
        <GlyphMark glyph={entryGlyph(entry)} />
        <span className={styles.name}>{entry.def.name}</span>
        {marks.length > 0 && <span className={styles.marks}>{marks.map((m) => MARK_LABEL[m]).join(' · ')}</span>}
      </button>
    </li>
  );
}

function CodexEntryPage({ row }: { row: Row }) {
  const { entry, marks } = row;
  const { def, renderer } = entry;
  const group = renderer.group?.(def);
  const record = useEncounterRecord(entry, marks);

  if (marks === null) {
    const hint = renderer.hint ?? DEFAULT_HINT;
    return (
      <article className={styles.page}>
        <header className={styles.pageHeader}>
          <div className={styles.heroGlyphBox}>
            <GlyphMark glyph={null} className={styles.heroGlyph} />
          </div>
          <div className={styles.pageHeading}>
            <h3 className={styles.pageTitle}>???</h3>
            <p className={styles.pageSubtitle}>{group !== undefined ? `${group} · ${renderer.label}` : renderer.label}</p>
          </div>
        </header>
        <p className={styles.lore}>{hint}</p>
      </article>
    );
  }

  const fields = renderer.fields?.(def) ?? [];
  return (
    <article className={styles.page}>
      <header className={styles.pageHeader}>
        <div className={styles.heroGlyphBox}>
          <GlyphMark glyph={entryGlyph(entry)} className={styles.heroGlyph} />
        </div>
        <div className={styles.pageHeading}>
          <div className={styles.pageTitleRow}>
            <h3 className={styles.pageTitle}>{def.name}</h3>
            {marks.length > 0 && <span className={styles.pageMarks}>{marks.map((m) => MARK_LABEL[m]).join(' · ')}</span>}
          </div>
          <p className={styles.pageSubtitle}>{group !== undefined ? `${group} · ${renderer.label}` : renderer.label}</p>
        </div>
      </header>

      <p className={styles.lore}>{def.description}</p>

      {record !== null && (
        <dl className={styles.record} aria-label="Encounter record">
          <div className={styles.recordItem}>
            <dt>Slain</dt>
            <dd>{record.kills}</dd>
          </div>
          <div className={styles.recordItem}>
            <dt>Adventurers lost</dt>
            <dd>{record.deaths}</dd>
          </div>
        </dl>
      )}

      {fields.length > 0 && (
        <dl className={styles.statTable}>
          {fields.map((f) => (
            <div key={f.label} className={styles.statRow} title={f.hint}>
              <dt>{f.label}</dt>
              <dd>{f.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </article>
  );
}

/** Discovery counts across all visible Codex kinds, for the modal header and side-tab launcher. */
function useDiscoveryTotals(discovered: CodexDiscoveries): { known: number; total: number } {
  return useMemo(() => {
    let known = 0;
    let total = 0;
    for (const renderer of ALL_RENDERERS) {
      const defs = renderer.registry.all();
      if (renderer.hidden === true || defs.length === 0) continue;
      total += defs.length;
      for (const def of defs) {
        if (entryMarks({ def, renderer }, discovered) !== null) known++;
      }
    }
    return { known, total };
  }, [discovered]);
}

/**
 * The side-panel Codex tab: shows overall discovery progress and opens the wide two-pane Codex
 * modal (ETH-092).
 */
export function CodexTab() {
  const discovered = useDiscovered();
  const { known, total } = useDiscoveryTotals(discovered);
  const setCodexOpen = useUiStore((s) => s.setCodexOpen);

  return (
    <div className={styles.launcher}>
      <p className={styles.launcherCount}>
        <strong>
          {known} / {total}
        </strong>{' '}
        entries discovered
      </p>
      <p className={styles.launcherText}>
        Classes, races, monsters, items, features and lore recorded from your expeditions.
      </p>
      <div>
        <Button variant="primary" onClick={() => setCodexOpen(true)}>
          Open Codex
        </Button>
      </div>
    </div>
  );
}

/**
 * The wide two-pane Codex modal (docs/VISUAL-DESIGN.md §5.3, ETH-092). Trap/inert background is
 * handled by `AppShell`; Escape, the backdrop or the Close button closes it and restores focus to
 * the element that opened it.
 */
export function CodexModal() {
  const open = useUiStore((s) => s.codexOpen);
  const setCodexOpen = useUiStore((s) => s.setCodexOpen);
  const discovered = useDiscovered();
  const { known, total } = useDiscoveryTotals(discovered);
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (open) {
      triggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      closeRef.current?.focus();
    } else if (triggerRef.current !== null) {
      const el = triggerRef.current;
      triggerRef.current = null;
      el.focus();
    }
  }, [open]);

  if (!open) return null;

  const close = () => setCodexOpen(false);

  return (
    <div className={styles.modalBackdrop} onClick={close}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={styles.modal}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            close();
          }
        }}
      >
        <header className={styles.modalHeader}>
          <h2 id={titleId} className={styles.modalTitle}>
            Codex
          </h2>
          <span className={styles.modalCount}>
            {known} / {total} discovered
          </span>
          <Button ref={closeRef} variant="ghost" onClick={close}>
            <span aria-hidden="true">✕</span> Close
          </Button>
        </header>
        <div className={styles.modalBody}>
          <CodexPanel />
        </div>
      </div>
    </div>
  );
}
