/**
 * `Explain` (docs/ARCHITECTURE.md §8.5): any mention of a content id, with a tooltip showing what
 * it is, rendered from the kind's Codex renderer. `ExplainCard` is the tooltip's body, also used
 * by the Codex tab and the map's tile inspector.
 */
import type { ReactNode } from 'react';
import type { Glyph } from '../../content';
import { cx } from '../kit/cx';
import { Tooltip } from '../kit';
import styles from './Explain.module.css';
import { codexEntry, entryGlyph } from './registry';
import type { CodexEntry } from './registry';

/** An entry's glyph in its map color, or a muted `?` for an unknown one. Decorative. */
export function GlyphMark({ glyph, className }: { glyph: Glyph | undefined | null; className?: string }) {
  if (glyph === null) {
    return (
      <span aria-hidden="true" className={cx(styles.glyph, styles.unknownGlyph, className)}>
        ?
      </span>
    );
  }
  if (glyph === undefined) return <span aria-hidden="true" className={cx(styles.glyph, className)} />;
  return (
    <span aria-hidden="true" className={cx(styles.glyph, glyph.bold === true && styles.bold, className)} style={{ color: glyph.color }}>
      {glyph.ch}
    </span>
  );
}

export interface ExplainCardProps {
  /** A content id. Anything else renders nothing. */
  id: string;
  /** Show the glyph and name as a heading (off where the name is already shown). */
  heading?: boolean;
  /** `key` shows the renderer's key fields; `all` the whole stat table. */
  fields?: 'key' | 'all';
  className?: string;
}

/** What a content entry is: its name, kind, description and stats, from its Codex renderer. */
export function ExplainCard({ id, heading = true, fields = 'key', className }: ExplainCardProps) {
  const entry = codexEntry(id);
  if (entry === undefined) return null;
  return <EntryCard entry={entry} heading={heading} fields={fields} className={className} />;
}

function EntryCard({ entry, heading, fields, className }: { entry: CodexEntry; heading: boolean; fields: 'key' | 'all'; className?: string }) {
  const { def, renderer } = entry;
  const group = renderer.group?.(def);
  const rows = (renderer.fields?.(def) ?? []).filter((f) => fields === 'all' || f.key === true);
  return (
    <div className={cx(styles.card, className)}>
      {heading && (
        <div className={styles.heading}>
          <GlyphMark glyph={entryGlyph(entry)} />
          <span className={styles.name}>{def.name}</span>
          <span className={styles.kind}>{group ?? renderer.registry.kind}</span>
        </div>
      )}
      <p className={styles.description}>{def.description}</p>
      {rows.length > 0 && (
        <dl className={styles.fields}>
          {rows.map((f) => (
            <div key={f.label} className={styles.field} title={f.hint}>
              <dt>{f.label}</dt>
              <dd>{f.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

export interface ExplainProps {
  /** A content id: `class.vanguard`, `feature.door`. */
  id: string;
  /** The text shown; defaults to the def's name. */
  children?: ReactNode;
}

/**
 * A content mention with a hover and focus tooltip explaining it. An id no kind knows renders
 * its text (or the id) plainly.
 */
export function Explain({ id, children }: ExplainProps) {
  const entry = codexEntry(id);
  const text = children ?? entry?.def.name ?? id;
  if (entry === undefined) return <>{text}</>;
  return (
    <Tooltip content={<EntryCard entry={entry} heading fields="key" />}>
      <span tabIndex={0} className={styles.link} data-explain={id}>
        {text}
      </span>
    </Tooltip>
  );
}
