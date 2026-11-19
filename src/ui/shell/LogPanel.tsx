import { memo, useLayoutEffect, useMemo, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { EntityId } from '../../sim';
import { Explain } from '../codex/Explain';
import { Button, Panel, Tooltip } from '../kit';
import { useSimStore } from '../stores/simStore';
import { LOG_FILTERS, useUiStore } from '../stores/uiStore';
import type { LogFilter, MapFocus } from '../stores/uiStore';
import styles from './LogPanel.module.css';
import { LOG_PREFIX, logLines, momentLines, repeatLabel, repeatTooltip } from './text';
import type { LogLine, LogPart } from './text';

/** How close to the bottom (in pixels) still counts as "at the bottom" for auto-scrolling. */
const STICK_SLACK = 4;

const FILTER_LABEL: Readonly<Record<LogFilter, string>> = { all: 'All', highlights: 'Highlights' };

const EMPTY_TEXT: Readonly<Record<LogFilter, string>> = {
  all: 'Nothing has happened yet.',
  highlights: 'No highlights yet.',
};

/** Marks a highlight line, so it is not told apart by color alone. */
const HIGHLIGHT_MARK = '★';

/**
 * The log strip (docs/VISUAL-DESIGN.md §3.3): recent events from `simStore` as plain text,
 * newest at the bottom. It follows new lines while scrolled to the bottom and stays put when the
 * player has scrolled up to read. The Highlights filter (ETH-047) shows only notable moments, from
 * the run chronicle (ETH-120), and clicking a highlight centers the map where it happened. Identical AI decisions in a row show as
 * one line with a `×N` count (ETH-073). Category filters arrive in M1.
 */
export function LogPanel() {
  const events = useSimStore((s) => s.events);
  const chronicle = useSimStore((s) => s.chronicle);
  const names = useSimStore(
    useShallow((s) => Object.fromEntries((s.snapshot?.party ?? []).map((m) => [m.id, m.name]))),
  );
  const filter = useUiStore((s) => s.logFilter);
  const setFilter = useUiStore((s) => s.setLogFilter);
  const focusMap = useUiStore((s) => s.focusMap);
  const autoPaused = useUiStore((s) => s.autoPaused);
  const paused = useSimStore((s) => s.speed === 0);
  // The Highlights filter reads the run chronicle (ETH-120), which keeps the whole run's moments,
  // not the rolling event buffer.
  const lines = useMemo(() => {
    const nameOf = (id: EntityId) => names[id] ?? `#${id}`;
    return filter === 'highlights' ? momentLines(chronicle.entries, nameOf) : logLines(events, nameOf);
  }, [events, chronicle, names, filter]);

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

  const actions = (
    <>
      {paused && autoPaused !== null && (
        <span role="status" className={styles.notice}>
          Auto-paused: {autoPaused}
        </span>
      )}
      <div role="group" aria-label="Log filter" className={styles.filters}>
        {LOG_FILTERS.map((f) => (
          <Button key={f} variant="ghost" pressed={filter === f} onClick={() => setFilter(f)}>
            {f === 'highlights' && <span aria-hidden="true">{HIGHLIGHT_MARK} </span>}
            {FILTER_LABEL[f]}
          </Button>
        ))}
      </div>
    </>
  );

  return (
    <Panel title="Log" className={styles.log} actions={actions}>
      {lines.length === 0 ? (
        <p className={styles.empty}>{EMPTY_TEXT[filter]}</p>
      ) : (
        <ol ref={scroller} className={styles.lines} aria-label="Event log" tabIndex={0} onScroll={onScroll}>
          {lines.map((line) => (
            <Line key={line.seq} line={line} onShow={focusMap} />
          ))}
        </ol>
      )}
    </Panel>
  );
}

const Line = memo(function Line({ line, onShow }: { line: LogLine; onShow(focus: MapFocus): void }) {
  const { highlight } = line;
  const place = highlight?.place ?? null;
  return (
    <li className={styles.line} data-category={line.category} data-highlight={highlight ? '' : undefined}>
      <span className={styles.turn}>
        <span className="sr-only">Turn </span>
        {line.turn}
      </span>
      <span className={styles.prefix} aria-hidden="true">
        {LOG_PREFIX[line.category]}
      </span>
      {highlight && place !== null ? (
        <button
          type="button"
          className={styles.highlight}
          title={`${highlight.kind.label}. Click to show where on the map.`}
          onClick={() => onShow(place)}
        >
          <span className="sr-only">Highlight: </span>
          <span aria-hidden="true">{HIGHLIGHT_MARK} </span>
          {line.text}
        </button>
      ) : highlight ? (
        <span className={styles.moment} title={highlight.kind.label}>
          <span className="sr-only">Highlight: </span>
          <span aria-hidden="true">{HIGHLIGHT_MARK} </span>
          {line.text}
        </span>
      ) : (
        <span className={styles.text}>
          <Parts parts={line.parts} />
          {line.repeat && (
            <>
              {' '}
              <Tooltip content={repeatTooltip(line)}>
                <span className={styles.repeat} tabIndex={0}>
                  <span aria-hidden="true">{repeatLabel(line.repeat)}</span>
                  <span className="sr-only">{repeatTooltip(line)}</span>
                </span>
              </Tooltip>
            </>
          )}
        </span>
      )}
    </li>
  );
});

/** A sentence's parts, with each content mention as an `Explain` link. */
function Parts({ parts }: { parts: readonly LogPart[] }) {
  return parts.map((part, i) =>
    typeof part === 'string' ? (
      part
    ) : (
      <Explain key={i} id={part.ref}>
        {part.label}
      </Explain>
    ),
  );
}
