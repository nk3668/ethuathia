/**
 * The Codex tab (docs/VISUAL-DESIGN.md §5.3): every class, race, monster, item, Omen, deity…
 * one section per content kind, filled in as the player discovers things. Undiscovered entries
 * read `???` with a hint. A search box and a section filter narrow the list.
 *
 * Sections and entry views come from the kind renderers in `renderers/`; this file never names a
 * kind.
 */
import { useId, useMemo, useState } from 'react';
import type { CodexDiscoveries, CodexMark } from '../../sim';
import { Button } from '../kit';
import styles from './CodexPanel.module.css';
import { ExplainCard, GlyphMark } from './Explain';
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

export function CodexPanel() {
  const discovered = useDiscovered();
  const [query, setQuery] = useState('');
  const [only, setOnly] = useState<string | null>(null);
  const searchId = useId();
  const sections = useMemo(() => buildSections(discovered, query, only), [discovered, query, only]);
  const kinds = useMemo(() => ALL_RENDERERS.filter((r) => r.hidden !== true && r.registry.all().length > 0), []);

  return (
    <div className={styles.codex}>
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
          onChange={(e) => setQuery(e.target.value)}
        />
        <div role="group" aria-label="Codex sections" className={styles.filters}>
          <Button variant="ghost" pressed={only === null} onClick={() => setOnly(null)}>
            All
          </Button>
          {kinds.map((r) => (
            <Button key={r.registry.kind} variant="ghost" pressed={only === r.registry.kind} onClick={() => setOnly(r.registry.kind)}>
              {r.label}
            </Button>
          ))}
        </div>
      </div>
      {sections.length === 0 ? (
        <p className={styles.empty}>{query.trim() === '' ? 'Nothing here yet.' : `Nothing you have discovered matches “${query.trim()}”.`}</p>
      ) : (
        sections.map((s) => <CodexSection key={s.kind} section={s} />)
      )}
    </div>
  );
}

function CodexSection({ section }: { section: Section }) {
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
              <CodexRow key={row.entry.def.id} row={row} />
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

function CodexRow({ row }: { row: Row }) {
  const { entry, marks } = row;
  if (marks === null) {
    const hint = entry.renderer.hint ?? DEFAULT_HINT;
    return (
      <li className={styles.unknown} title={hint}>
        <GlyphMark glyph={null} />
        <span>???</span>
        <span className={styles.hint}>{hint}</span>
      </li>
    );
  }
  return (
    <li className={styles.entry}>
      <details>
        <summary className={styles.summary} data-entry={entry.def.id}>
          <GlyphMark glyph={entryGlyph(entry)} />
          <span className={styles.name}>{entry.def.name}</span>
          {marks.length > 0 && <span className={styles.marks}>{marks.map((m) => MARK_LABEL[m]).join(' · ')}</span>}
        </summary>
        <ExplainCard id={entry.def.id} heading={false} fields="all" className={styles.detail} />
      </details>
    </li>
  );
}
