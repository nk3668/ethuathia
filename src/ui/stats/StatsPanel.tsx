import { useEffect, useRef } from 'react';
import { formatNumber } from '../../core';
import { CURRENCY_INFO, HISTORY_LIMIT } from '../../meta';
import type { History, RunRecord } from '../../meta';
import { Tooltip } from '../kit';
import { OUTCOME_LOOK } from '../shell/runSummaryText';
import { useProfileStore } from '../stores/profileStore';
import { useRunStore } from '../stores/runStore';
import styles from './StatsPanel.module.css';

/** Turn counts in full, as in the top bar and the run summary. */
const TURN_FORMAT = new Intl.NumberFormat('en-US');

/**
 * The Stats tab (ETH-048, docs/VISUAL-DESIGN.md §5.5): lifetime totals, then the run history,
 * newest first. Each run opens its run summary again.
 */
export function StatsPanel() {
  const history = useProfileStore((s) => s.profile.history);
  return (
    <div className={styles.stats}>
      <Totals totals={history.totals} />
      <RunHistory recent={history.recent} total={history.totals.runs} />
    </div>
  );
}

function Totals({ totals }: { totals: History['totals'] }) {
  const rows: [string, string, string][] = [
    ['Runs', TURN_FORMAT.format(totals.runs), 'Every run you have finished.'],
    [`${OUTCOME_LOOK.victory.icon} Victories`, TURN_FORMAT.format(totals.victories), 'Runs that did everything asked and walked out.'],
    [`${OUTCOME_LOOK.retreat.icon} Retreats`, TURN_FORMAT.format(totals.retreats), 'Runs that walked out before everything was done.'],
    [`${OUTCOME_LOOK.wipe.icon} Wipes`, TURN_FORMAT.format(totals.wipes), 'Runs where the whole party fell.'],
    ['Deepest floor', TURN_FORMAT.format(totals.deepestDepth), 'The deepest floor any party has reached.'],
    ['Turns', formatNumber(totals.turns), 'Game turns played across every run.'],
  ];
  return (
    <section aria-labelledby="stats-totals">
      <h3 id="stats-totals" className={styles.heading}>
        Lifetime
      </h3>
      <dl className={styles.totals}>
        {rows.map(([label, value, about]) => (
          <div key={label} className={styles.total}>
            <dt>{label}</dt>
            <dd>
              <Tooltip content={about}>{value}</Tooltip>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function RunHistory({ recent, total }: { recent: readonly RunRecord[]; total: number }) {
  const showPastRun = useRunStore((s) => s.showPastRun);
  const pastRun = useRunStore((s) => s.pastRun);
  const list = useRef<HTMLUListElement>(null);
  const opened = useRef<number | null>(null);

  // Focus goes back to the run's row when its summary closes.
  useEffect(() => {
    if (pastRun !== null || opened.current === null) return;
    list.current?.querySelector<HTMLButtonElement>(`[data-run="${opened.current}"]`)?.focus();
    opened.current = null;
  }, [pastRun]);

  return (
    <section aria-labelledby="stats-history">
      <h3 id="stats-history" className={styles.heading}>
        Run history
      </h3>
      {recent.length === 0 ? (
        <p className={styles.empty}>No runs finished yet. Each run you finish is listed here.</p>
      ) : (
        <>
          <ul ref={list} className={styles.runs} aria-label="Past runs, newest first">
            {recent.map((record) => (
              <li key={record.run}>
                <button
                  type="button"
                  className={styles.run}
                  data-run={record.run}
                  data-outcome={record.outcome}
                  onClick={() => {
                    opened.current = record.run;
                    showPastRun(record);
                  }}
                >
                  <RunRow record={record} />
                </button>
              </li>
            ))}
          </ul>
          {total > recent.length && (
            <p className={styles.note}>
              The last {Math.min(recent.length, HISTORY_LIMIT)} of {TURN_FORMAT.format(total)} runs are kept.
            </p>
          )}
        </>
      )}
    </section>
  );
}

function RunRow({ record }: { record: RunRecord }) {
  const look = OUTCOME_LOOK[record.outcome];
  const fallen = record.party.filter((m) => m.fell !== null).length;
  const party =
    record.party.length === 0
      ? null
      : record.party.map((m) => `${m.name}${m.fell === null ? '' : ' ✝'}`).join(', ');
  return (
    <>
      <span className={styles.runHead}>
        <span aria-hidden="true" className={styles.icon}>
          {look.icon}
        </span>
        <span className={styles.runTitle}>
          Run {record.run} · {look.title}
        </span>
        <span className={styles.facts}>
          Floor {record.deepestDepth} · {TURN_FORMAT.format(record.turns)} turns
        </span>
      </span>
      {party !== null && (
        <span className={styles.party}>
          {party}
          {fallen > 0 && <span className="sr-only"> ({fallen} fell)</span>}
        </span>
      )}
      <span className={styles.currencies}>
        <span className={styles.renown}>
          <span aria-hidden="true">♛</span> {formatNumber(record.banked.renown)}
          <span className="sr-only"> {CURRENCY_INFO.renown.name}</span>
        </span>
        <span className={styles.trophies}>
          <span aria-hidden="true">☠</span> {formatNumber(record.banked.trophies)}
          <span className="sr-only"> {CURRENCY_INFO.trophies.name}</span>
        </span>
        <span className="sr-only"> banked</span>
      </span>
    </>
  );
}
