import { useEffect, useId, useRef, useState } from 'react';
import { formatNumber } from '../../core';
import type { RunReport } from '../../sim';
import { Button } from '../kit';
import { useProfileStore } from '../stores/profileStore';
import { AUTO_RESTART_MS, useRunStore } from '../stores/runStore';
import { useSimStore } from '../stores/simStore';
import styles from './RunSummary.module.css';
import { currencyName, currencyRows, discoveriesOf, epitaph, fallenOf, OUTCOME_LOOK, unlockLines } from './runSummaryText';
import { contentName } from './text';

/** Turn counts in full, as in the top bar. */
const TURN_FORMAT = new Intl.NumberFormat('en-US');

/**
 * The run summary modal (docs/VISUAL-DESIGN.md §6.2): the outcome and its cause, each
 * adventurer's fate, the currency breakdown (earned at risk, lost to a wipe, banked), the Codex
 * discoveries, an epitaph, and the way on: start the next run, review the log, or let
 * auto-restart count down.
 */
export function RunSummary() {
  const report = useRunStore((s) => s.report);
  const open = useRunStore((s) => s.summaryOpen);
  if (report === null || !open) return null;
  return <SummaryDialog report={report} />;
}

function SummaryDialog({ report }: { report: RunReport }) {
  const titleId = useId();
  const next = useRef<HTMLButtonElement>(null);
  const setSummaryOpen = useRunStore((s) => s.setSummaryOpen);
  const startNext = useRunStore((s) => s.startNext);
  const party = useSimStore((s) => s.snapshot?.party);
  const look = OUTCOME_LOOK[report.end.outcome];
  const fallen = fallenOf(report);
  const found = discoveriesOf(report);

  useEffect(() => next.current?.focus(), []);

  return (
    <div className={styles.backdrop}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={styles.dialog}
        data-outcome={report.end.outcome}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            setSummaryOpen(false);
          }
        }}
      >
        <h2 id={titleId} className={styles.title}>
          <span aria-hidden="true" className={styles.icon}>
            {look.icon}
          </span>
          {look.title}
        </h2>
        <p className={styles.cause}>{report.end.cause}</p>
        <p className={styles.facts}>
          Floor {report.end.depth} reached · {TURN_FORMAT.format(report.result.turns)} turns
        </p>

        {party !== undefined && party.length > 0 && (
          <section aria-label="The party">
            <h3 className={styles.heading}>The party</h3>
            <ul className={styles.list}>
              {party.map((m) => {
                const fell = fallen.find((f) => f.actor === m.id);
                return (
                  <li key={m.id}>
                    <span className={styles.name}>{m.name}</span>{' '}
                    {fell === undefined ? <span>survived</span> : <span className={styles.fell}>✝ fell on floor {fell.depth}</span>}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <section aria-label="Currencies">
          <h3 className={styles.heading}>Currencies</h3>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Currency</th>
                <th scope="col">Earned</th>
                <th scope="col">Lost</th>
                <th scope="col">Banked</th>
              </tr>
            </thead>
            <tbody>
              {currencyRows(report).map((row) => (
                <tr key={row.key}>
                  <th scope="row">{currencyName(row.key)}</th>
                  <td>{formatNumber(row.atRisk)}</td>
                  <td>{row.lost === 0 ? '–' : `−${formatNumber(row.lost)}`}</td>
                  <td>{formatNumber(row.banked)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {found.length > 0 && (
          <section aria-label="Codex discoveries">
            <h3 className={styles.heading}>Met this run</h3>
            <p className={styles.found}>{found.map(contentName).join(', ')}</p>
          </section>
        )}

        <Unlocked />

        <p className={styles.epitaph}>{epitaph(report)}</p>

        <AutoRestart />

        <div className={styles.actions}>
          <Button variant="ghost" onClick={() => setSummaryOpen(false)}>
            Review log
          </Button>
          <Button ref={next} variant="primary" onClick={startNext}>
            Start next run
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * What this run's milestones opened (ETH-074), e.g. "Smithy: you reached floor 3". The profile
 * has already banked the run when the summary opens, so these are its latest unlocks.
 */
function Unlocked() {
  const profile = useProfileStore((s) => s.profile);
  const lines = unlockLines(profile);
  if (lines.length === 0) return null;
  return (
    <section aria-label="Unlocked">
      <h3 className={styles.heading}>Unlocked</h3>
      <ul className={styles.list}>
        {lines.map((line) => (
          <li key={line.id}>
            <span aria-hidden="true">🔓 </span>
            <span className={styles.name}>{line.name}</span> opens in town: {line.why}.
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The auto-restart toggle (mirrored in Options) and, while it counts down, a cancel button. */
export function AutoRestart() {
  const on = useProfileStore((s) => s.profile.settings.autoRestart);
  const updateSettings = useProfileStore((s) => s.updateSettings);
  const restartAt = useRunStore((s) => s.restartAt);
  const cancelRestart = useRunStore((s) => s.cancelRestart);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (restartAt === null) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [restartAt]);

  // `now` may predate the countdown until the first tick, so the count is capped at its length.
  const seconds =
    restartAt === null ? null : Math.min(AUTO_RESTART_MS / 1000, Math.max(0, Math.ceil((restartAt - now) / 1000)));
  return (
    <div className={styles.restart}>
      <label className={styles.toggle}>
        <input type="checkbox" checked={on} onChange={(e) => updateSettings({ autoRestart: e.currentTarget.checked })} />
        <span>Auto-restart</span>
      </label>
      {seconds !== null && (
        <>
          <span role="status" className={styles.countdown}>
            Next run in {seconds} s
          </span>
          <Button variant="ghost" onClick={cancelRestart}>
            Cancel
          </Button>
        </>
      )}
    </div>
  );
}

/** Over the map once a run has ended and the summary is closed: show it again, or start the next run. */
export function RunOverBanner() {
  const report = useRunStore((s) => s.report);
  const open = useRunStore((s) => s.summaryOpen);
  const setSummaryOpen = useRunStore((s) => s.setSummaryOpen);
  const startNext = useRunStore((s) => s.startNext);
  if (report === null || open) return null;
  const look = OUTCOME_LOOK[report.end.outcome];
  return (
    <div className={styles.banner} data-slot="run-over">
      <span aria-hidden="true" className={styles.icon}>
        {look.icon}
      </span>
      <span className={styles.bannerText}>The run is over: {look.title.toLowerCase()}.</span>
      <Button variant="ghost" onClick={() => setSummaryOpen(true)}>
        Show summary
      </Button>
      <Button variant="primary" onClick={startNext}>
        Start next run
      </Button>
    </div>
  );
}
