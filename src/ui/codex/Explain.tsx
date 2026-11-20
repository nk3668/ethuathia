/**
 * `Explain` (docs/ARCHITECTURE.md §8.5, ETH-091): any mention of a content id, with a tooltip
 * showing what it is, rendered from the kind's Codex renderer. Undiscovered entries show only
 * their glyph and riddle-like hint (`def.hint`); tiered entries (monsters) reveal their fields and
 * lore according to the player's kill count.
 */
import type { ReactNode } from 'react';
import type { Glyph } from '../../content';
import { cx } from '../kit/cx';
import { Tooltip } from '../kit';
import styles from './Explain.module.css';
import { codexEntry, entryGlyph, entryMarks } from './registry';
import type { CodexEntry } from './registry';
import { monsterKillCount, useDiscovered, useMonsterKills } from './useDiscovered';

const DEFAULT_HINT = 'Not discovered yet.';

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
  reveal = false,
  className,
}: {
  entry: CodexEntry;
  heading: boolean;
  fields: 'key' | 'all';
  name?: string | undefined;
  note?: string | undefined;
  reveal?: boolean | undefined;
  className?: string | undefined;
}) {
  const discovered = useDiscovered();
  const kills = useMonsterKills();
  const { def, renderer } = entry;
  const marks = entryMarks(entry, discovered);
  const group = renderer.group?.(def);
  const glyph = entryGlyph(entry);
  const hintText = def.hint ?? renderer.hint ?? DEFAULT_HINT;

  // Undiscovered entries show only their glyph and riddle-like hint (ETH-091), unless the caller
  // explicitly reveals an already-unlocked choice (such as classes and races on Prepare).
  if (marks === null && !reveal) {
    return (
      <div className={cx(styles.card, className)}>
        {heading && (
          <div className={styles.heading}>
            <GlyphMark glyph={glyph ?? null} />
            <span className={styles.name}>???</span>
            <span className={styles.kind}>{group ?? renderer.registry.kind}</span>
          </div>
        )}
        <p className={styles.description}>{hintText}</p>
      </div>
    );
  }

  const killCount = monsterKillCount(def.id, discovered, kills);
  const loreReady = renderer.loreKills === undefined || killCount >= renderer.loreKills;
  const bodyText = loreReady ? def.description : hintText;
  const rows = (renderer.fields?.(def) ?? []).filter(
    (f) => (fields === 'all' || f.key === true) && (f.minKills ?? 0) <= killCount,
  );
  return (
    <div className={cx(styles.card, className)}>
      {heading && (
        <div className={styles.heading}>
          <GlyphMark glyph={glyph} />
          <span className={styles.name}>{name ?? def.name}</span>
          <span className={styles.kind}>{group ?? renderer.registry.kind}</span>
        </div>
      )}
      <p className={styles.description}>{bodyText}</p>
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
   * attribute changes its wielder's damage (ETH-082).
   */
  note?: string;
  /**
   * Reveal the full description and key fields even if the entry is not yet in the Codex (e.g.
   * unlocked classes and races on Prepare, so the player isn't picking blind).
   */
  reveal?: boolean;
  /** The text shown; defaults to `name`, else the def's name. */
  children?: ReactNode;
}

/**
 * A content mention with a hover and focus tooltip explaining it. An id no kind knows renders
 * its text (or the id) plainly.
 */
export function Explain({ id, name, note, reveal, children }: ExplainProps) {
  const entry = codexEntry(id);
  const text = children ?? name ?? entry?.def.name ?? id;
  if (entry === undefined) return <>{text}</>;
  return (
    <Tooltip content={<EntryCard entry={entry} heading fields="key" name={name} note={note} reveal={reveal} />}>
      <span tabIndex={0} className={styles.link} data-explain={id}>
        {text}
      </span>
    </Tooltip>
  );
}
