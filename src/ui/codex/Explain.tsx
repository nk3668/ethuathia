/**
 * `Explain` (docs/ARCHITECTURE.md §8.5): any mention of a content id, with a tooltip showing what
 * it is, rendered from the kind's Codex renderer. `ExplainCard` is the tooltip's body, also used
 * by the Codex tab and the map's tile inspector.
 */
import type { ReactNode } from 'react';
import { ITEM_STATE_INFO } from '../../content';
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
  /** The heading's name, when it isn't the def's: one item's `itemName` ("+2 Iron hatchet", ETH-118). */
  name?: string;
  className?: string;
}

/** What a content entry is: its name, kind, description and stats, from its Codex renderer. */
export function ExplainCard({ id, heading = true, fields = 'key', name, className }: ExplainCardProps) {
  const entry = codexEntry(id);
  if (entry === undefined) return null;
  return <EntryCard entry={entry} heading={heading} fields={fields} name={name} className={className} />;
}

function EntryCard({
  entry,
  heading,
  fields,
  name,
  note,
  className,
}: {
  entry: CodexEntry;
  heading: boolean;
  fields: 'key' | 'all';
  name?: string | undefined;
  note?: string | undefined;
  className?: string | undefined;
}) {
  const { def, renderer } = entry;
  const group = renderer.group?.(def);
  const rows = (renderer.fields?.(def) ?? []).filter((f) => fields === 'all' || f.key === true);
  return (
    <div className={cx(styles.card, className)}>
      {heading && (
        <div className={styles.heading}>
          <GlyphMark glyph={entryGlyph(entry)} />
          <span className={styles.name}>{name ?? def.name}</span>
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
      {note !== undefined && <p className={styles.note}>{note}</p>}
    </div>
  );
}

export interface ExplainProps {
  /** A content id: `class.vanguard`, `feature.door`. */
  id: string;
  /**
   * The name of this particular thing when it isn't the def's: one item's `itemName` ("+2 Iron
   * hatchet", ETH-118). Shown as the text (unless `children` is given) and as the card's heading.
   */
  name?: string;
  /**
   * A line about this particular thing for this viewer, after the fields: how a weapon's
   * attribute changes its wielder's damage (ETH-082) or its enchantment/curse state (ETH-044).
   */
  note?: string;
  /**
   * When set (ETH-044), hides the real def behind a generic unidentified card so hovering an
   * unidentified potion, scroll or jewelry never spoils what it is.
   */
  unidentified?: { readonly name: string; readonly category: string };
  /** The text shown; defaults to `name`, else the def's name. */
  children?: ReactNode;
}

/**
 * A content mention with a hover and focus tooltip explaining it. An id no kind knows renders
 * its text (or the id) plainly.
 */
export function Explain({ id, name, note, unidentified, children }: ExplainProps) {
  const entry = codexEntry(id);
  if (unidentified !== undefined) {
    const label = children ?? unidentified.name;
    return (
      <Tooltip
        content={
          <div className={styles.card}>
            <div className={styles.heading}>
              <GlyphMark glyph={entry === undefined ? null : entryGlyph(entry)} />
              <span className={styles.name}>{unidentified.name}</span>
              <span className={styles.kind}>{unidentified.category}</span>
            </div>
            <p className={styles.description}>{ITEM_STATE_INFO.unidentified}</p>
          </div>
        }
      >
        <span tabIndex={0} className={styles.link}>
          {label}
        </span>
      </Tooltip>
    );
  }
  const text = children ?? name ?? entry?.def.name ?? id;
  if (entry === undefined) return <>{text}</>;
  return (
    <Tooltip content={<EntryCard entry={entry} heading fields="key" name={name} note={note} />}>
      <span tabIndex={0} className={styles.link} data-explain={id}>
        {text}
      </span>
    </Tooltip>
  );
}
