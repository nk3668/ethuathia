import { memo, useLayoutEffect, useMemo, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { EntityId } from '../../sim';
import { Panel } from '../kit';
import { useSimStore } from '../stores/simStore';
import styles from './LogPanel.module.css';
import { LOG_PREFIX, logLines } from './text';
import type { LogLine } from './text';

/** How close to the bottom (in pixels) still counts as "at the bottom" for auto-scrolling. */
const STICK_SLACK = 4;

/**
 * The log strip (docs/VISUAL-DESIGN.md §3.3): recent events from `simStore` as plain text,
 * newest at the bottom. It follows new lines while scrolled to the bottom and stays put when the
 * player has scrolled up to read. Category filters (`actions` slot) arrive in M1.
 */
export function LogPanel() {
  const events = useSimStore((s) => s.events);
  const names = useSimStore(
    useShallow((s) => Object.fromEntries((s.snapshot?.party ?? []).map((m) => [m.id, m.name]))),
  );
  const lines = useMemo(
    () => logLines(events, (id: EntityId) => names[id] ?? `#${id}`),
    [events, names],
  );

  const scroller = useRef<HTMLOListElement>(null);
  const stick = useRef(true);
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [lines]);

  const onScroll = () => {
    const el = scroller.current;
    if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight <= STICK_SLACK;
  };

  return (
    <Panel title="Log" className={styles.log}>
      {lines.length === 0 ? (
        <p className={styles.empty}>Nothing has happened yet.</p>
      ) : (
        <ol ref={scroller} className={styles.lines} aria-label="Event log" tabIndex={0} onScroll={onScroll}>
          {lines.map((line) => (
            <Line key={line.seq} line={line} />
          ))}
        </ol>
      )}
    </Panel>
  );
}

const Line = memo(function Line({ line }: { line: LogLine }) {
  return (
    <li className={styles.line} data-category={line.category}>
      <span className={styles.turn}>
        <span className="sr-only">Turn </span>
        {line.turn}
      </span>
      <span className={styles.prefix} aria-hidden="true">
        {LOG_PREFIX[line.category]}
      </span>
      <span className={styles.text}>{line.text}</span>
    </li>
  );
});
