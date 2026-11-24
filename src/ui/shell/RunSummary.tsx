import { useEffect, useId, useRef, useState } from 'react';
import { GOLD_PER_TROPHY } from '../../content';
import { formatNumber } from '../../core';
import { goldConversionText, itemSaleText, masteryGainBanked, TROPHIES_KILLS_TEXT, TROPHIES_OMEN_TEXT } from '../../meta';
import { RENOWN, TROPHIES } from '../../sim';
import type { GoldConversionRecord, ItemSaleRecord, RunOutcome, RunReport } from '../../sim';
import { Button, Tooltip } from '../kit';
import { useProfileStore } from '../stores/profileStore';
import { AUTO_RESTART_MS, useRunStore } from '../stores/runStore';
import { useSimStore } from '../stores/simStore';
import { masteryBreakdown, masteryLine, MASTERY_HELP } from './masteryText';
import styles from './RunSummary.module.css';
import {
  contractsOf,
  currencyName,
  currencyRows,
  discoveriesOf,
  epitaph,
  cursedGearTurnsOf,
  fallenOf,
  goldConversionOf,
  itemSaleOf,
  lossNote,
  momentsOf,
  OUTCOME_LOOK,
  partyOf,
  RENOWN_FORMULA_EXAMPLES,
  RENOWN_FORMULA_TEXT,
  renownBreakdown,
  reportFromRecord,
  tierOpenText,
  unlockLines,
} from './runSummaryText';
import { rewardText } from './logText/quests';
import { contentName, momentLine } from './text';

/** Turn counts in full, as in the top bar. */
const TURN_FORMAT = new Intl.NumberFormat('en-US');

/** Tooltip for the Rematch button (ETH-084): explains what repeats and what can still change. */
export const REMATCH_TOOLTIP =
  'Replay this dungeon with the same seed and your current upgrades and rules. The layout repeats, but outcomes may differ if upgrades or rules changed.';

/**
 * The run summary modal (docs/VISUAL-DESIGN.md §6.2): the outcome and its cause, each
 * adventurer's fate, the currency breakdown (earned at risk, lost to a wipe, banked), the Codex
 * discoveries, an epitaph, and the way on: Continue to the Prepare screen, start the next run at
 * once with the same choices, Rematch the same seed (ETH-084), review the log, or let auto-restart
 * count down.
 */
export function RunSummary() {
  const report = useRunStore((s) => s.report);
  const open = useRunStore((s) => s.summaryOpen);
  const pastRun = useRunStore((s) => s.pastRun);
  // A past run opened from the run history (ETH-048) shows over everything, with only Close.
  if (pastRun !== null) return <SummaryDialog key={pastRun.run} report={reportFromRecord(pastRun)} run={pastRun.run} />;
  if (report === null || !open) return null;
  return <SummaryDialog report={report} />;
}

/** With `run`, the dialog shows that past run and only closes; without, the run that just ended. */
function SummaryDialog({ report, run }: { report: RunReport; run?: number }) {
  const titleId = useId();
  const next = useRef<HTMLButtonElement>(null);
  const setSummaryOpen = useRunStore((s) => s.setSummaryOpen);
  const showPastRun = useRunStore((s) => s.showPastRun);
  const startNext = useRunStore((s) => s.startNext);
  const rematch = useRunStore((s) => s.rematch);
  const past = run !== undefined;
  const close = () => (past ? showPastRun(null) : setSummaryOpen(false));
  const liveParty = useSimStore((s) => s.snapshot?.party);
  const recorded = partyOf(report);
  const party = recorded.length > 0 || past ? recorded.map((m) => ({ id: m.actor, name: m.name })) : liveParty;
  const openPrepare = useRunStore((s) => s.openPrepare);
  const look = OUTCOME_LOOK[report.end.outcome];
  const fallen = fallenOf(report);
  const cursedTurns = cursedGearTurnsOf(report);
  const found = discoveriesOf(report);
  const contracts = contractsOf(report);
  const moments = momentsOf(report);
  const renown = renownBreakdown(report);
  const goldInfo = goldConversionOf(report);
  const itemInfo = itemSaleOf(report);
  const renownSources =
    renown === null
      ? []
      : [
          renown.floors.length === 0 && (renown.turns > 0 || renown.contracts > 0 || renown.other > 0) ? 'Floor 1: 0' : null,
          renown.turns > 0 ? `Turns (${TURN_FORMAT.format(renown.turnCount)}): +${formatNumber(renown.turns)}` : null,
          renown.contracts > 0 ? `Contracts: +${formatNumber(renown.contracts)}` : null,
          renown.other > 0 ? `Modifiers & other: +${formatNumber(renown.other)}` : null,
        ].filter((line): line is string => line !== null);
  const showRenownBreakdown = renown !== null && (renown.floors.length > 0 || renownSources.length > 0);
  const nameOf = (id: number) => party?.find((m) => m.id === id)?.name ?? 'Someone';

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
            close();
          }
        }}
      >
        <h2 id={titleId} className={styles.title}>
          <span aria-hidden="true" className={styles.icon}>
            {look.icon}
          </span>
          {past ? `Run ${run} · ${look.title}` : look.title}
        </h2>
        <p className={styles.cause}>{report.end.cause}</p>
        <p className={styles.facts}>
          Floor {report.end.depth} reached · {TURN_FORMAT.format(report.result.turns)} turns
        </p>

        {cursedTurns > 0 && (
          <p className={styles.facts}>Cursed gear was worn for {TURN_FORMAT.format(cursedTurns)} {cursedTurns === 1 ? 'turn' : 'turns'}.</p>
        )}

        {party !== undefined && party.length > 0 && (
          <section aria-label="The party">
            <h3 className={styles.heading}>The party</h3>
            <ul className={styles.list}>
              {party.map((m) => {
                const fell = fallen.find((f) => f.actor === m.id);
                return (
                  <li key={m.id}>
                    <span className={styles.name}>{m.name}</span>{' '}
                    {fell === undefined ? <span>survived</span> : <span className={styles.fell}>✝ {fell.how} on floor {fell.depth}</span>}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {contracts.length > 0 && (
          <section aria-label="Contracts">
            <h3 className={styles.heading}>Contracts</h3>
            <ul className={styles.list}>
              {contracts.map((c) => (
                <li key={c.contract}>
                  <span className={styles.name}>{contentName(c.contract)}</span>{' '}
                  {c.complete ? (
                    <span>✔ complete · paid {rewardText(c.reward)}</span>
                  ) : (
                    <span className={styles.fell}>✘ not complete · {rewardText(c.reward)} unpaid</span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {moments.length > 0 && (
          <section aria-label="Moments">
            <h3 className={styles.heading}>Moments</h3>
            <ul className={styles.list}>
              {moments.map((m, i) => (
                <li key={i}>
                  <span className={styles.momentTurn}>Turn {TURN_FORMAT.format(m.turn)}</span> {momentLine(m, i, nameOf).text}
                </li>
              ))}
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
                <th scope="col">Lost in the wipe</th>
                <th scope="col">Banked</th>
              </tr>
            </thead>
            <tbody>
              {currencyRows(report).map((row) => (
                <tr key={row.key}>
                  <th scope="row">
                    {row.key === RENOWN ? (
                      <Tooltip content={<RenownFormulaContent />}>{currencyName(row.key)}</Tooltip>
                    ) : row.key === TROPHIES ? (
                      <Tooltip content={<TrophiesFormulaContent gold={goldInfo} items={itemInfo} outcome={report.end.outcome} />}>
                        {currencyName(row.key)}
                      </Tooltip>
                    ) : (
                      currencyName(row.key)
                    )}
                  </th>
                  <td>{formatNumber(row.atRisk)}</td>
                  <td>{row.lost === 0 ? '–' : `−${formatNumber(row.lost)}`}</td>
                  <td>{formatNumber(row.banked)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {goldInfo !== null && (
            <p className={styles.goldLine}>
              <Tooltip content={goldConversionText(goldInfo.rate)}>
                {report.end.outcome === 'wipe' ? 'Gold lost' : 'Gold converted'}
              </Tooltip>
              {': '}
              {report.end.outcome === 'wipe' ? (
                <span className={styles.goldLost}>{formatNumber(goldInfo.gold)} gold</span>
              ) : (
                <span>
                  {formatNumber(goldInfo.gold)} gold →{' '}
                  <span className={styles.goldTrophies}>
                    +{formatNumber(goldInfo.trophies)} {goldInfo.trophies === 1 ? 'Trophy' : 'Trophies'}
                  </span>
                </span>
              )}
            </p>
          )}
          {itemInfo !== null && (
            <p className={styles.goldLine}>
              <Tooltip content={itemSaleText(itemInfo.rate)}>
                {report.end.outcome === 'wipe' ? 'Items lost' : 'Items sold'}
              </Tooltip>
              {': '}
              {report.end.outcome === 'wipe' ? (
                <span className={styles.goldLost}>
                  {formatNumber(itemInfo.items)} {itemInfo.items === 1 ? 'item' : 'items'}
                </span>
              ) : (
                <span>
                  {formatNumber(itemInfo.items)} {itemInfo.items === 1 ? 'item' : 'items'} →{' '}
                  <span className={styles.goldTrophies}>
                    +{formatNumber(itemInfo.trophies)} {itemInfo.trophies === 1 ? 'Trophy' : 'Trophies'}
                  </span>
                </span>
              )}
            </p>
          )}
          {showRenownBreakdown && renown !== null && (
            <div className={styles.renownBreakdown}>
              <div className={styles.breakdownHead}>
                <span>Renown breakdown</span>
                {renown.floors.length > 0 && <span className={styles.breakdownTotal}>Depth: +{formatNumber(renown.depth)}</span>}
              </div>
              {renown.floors.length > 0 && (
                <ul className={styles.floorList} aria-label="Renown per floor">
                  {renown.floors.map((f) => (
                    <li key={f.depth} className={styles.floorItem}>
                      <span className={styles.floorLabel}>Floor {f.depth}</span>
                      <span className={styles.floorAmount}>+{formatNumber(f.renown)}</span>
                    </li>
                  ))}
                </ul>
              )}
              {renownSources.length > 0 && <p className={styles.breakdownSources}>{renownSources.join(' · ')}</p>}
            </div>
          )}
          <p className={styles.note}>{lossNote(report.end.outcome)}</p>
        </section>

        {found.length > 0 && (
          <section aria-label="Codex discoveries">
            <h3 className={styles.heading}>Met this run</h3>
            <p className={styles.found}>{found.map(contentName).join(', ')}</p>
          </section>
        )}

        {!past && <Mastery report={report} />}

        <Unlocked run={run} />

        <p className={styles.epitaph}>{epitaph(report)}</p>

        {!past && <AutoRestart />}

        <div className={styles.actions}>
          {past ? (
            <Button ref={next} variant="primary" onClick={close}>
              Close
            </Button>
          ) : (
            <>
              <Button variant="ghost" onClick={close}>
                Review log
              </Button>
              <Tooltip content={REMATCH_TOOLTIP}>
                <Button variant="secondary" onClick={rematch}>
                  Rematch
                </Button>
              </Tooltip>
              <Button variant="secondary" onClick={startNext}>
                Start next run
              </Button>
              <Button ref={next} variant="primary" onClick={openPrepare}>
                Continue
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** Tooltip body explaining the depth-weighted Renown formula (ETH-085). */
function RenownFormulaContent() {
  return (
    <>
      <strong>Renown formula</strong>
      <br />
      {RENOWN_FORMULA_TEXT}
      <br />
      {RENOWN_FORMULA_EXAMPLES}
    </>
  );
}

/** Tooltip body explaining Trophies from kills and leftover gold conversion (ETH-083). */
function TrophiesFormulaContent({
  gold,
  items,
  outcome,
}: {
  gold: GoldConversionRecord | null;
  items: ItemSaleRecord | null;
  outcome: RunOutcome;
}) {
  const rate = gold?.rate ?? GOLD_PER_TROPHY;
  return (
    <>
      <strong>Trophies formula</strong>
      <br />
      {TROPHIES_KILLS_TEXT} {goldConversionText(rate)}
      {gold !== null && outcome !== 'wipe' && gold.trophies > 0 && (
        <>
          <br />
          Leftover gold: {formatNumber(gold.gold)} gold → +{formatNumber(gold.trophies)}{' '}
          {gold.trophies === 1 ? 'Trophy' : 'Trophies'}.
        </>
      )}
      {gold !== null && outcome === 'wipe' && gold.gold > 0 && (
        <>
          <br />
          On a wipe all {formatNumber(gold.gold)} leftover gold is lost.
        </>
      )}
      <br />
      {itemSaleText(items?.rate)} {TROPHIES_OMEN_TEXT}
      {items !== null && outcome !== 'wipe' && (
        <>
          <br />
          Items: {formatNumber(items.items)} sold (value {formatNumber(items.value)}) → +{formatNumber(items.trophies)}{' '}
          {items.trophies === 1 ? 'Trophy' : 'Trophies'}.
        </>
      )}
      {items !== null && outcome === 'wipe' && (
        <>
          <br />
          On a wipe all {formatNumber(items.items)} carried items are lost.
        </>
      )}
    </>
  );
}

/**
 * What the run added to each class's Mastery (ETH-087): one line per class in the party, with a
 * tooltip of the breakdown. The profile has already banked the run, so the "before" level is the
 * banked XP minus the run's gain (`masteryGainBanked`). Only for the run that just ended.
 */
function Mastery({ report }: { report: RunReport }) {
  const mastery = useProfileStore((s) => s.profile.mastery);
  const gains = masteryGainBanked({ mastery }, report.result);
  if (gains.length === 0) return null;
  return (
    <section aria-label="Class Mastery">
      <h3 className={styles.heading}>Class Mastery</h3>
      <ul className={styles.list}>
        {gains.map((gain) => (
          <li key={gain.classId}>
            <Tooltip
              content={
                <>
                  {masteryBreakdown(gain).map((line) => (
                    <div key={line}>{line}</div>
                  ))}
                  <br />
                  {MASTERY_HELP}
                </>
              }
            >
              <span tabIndex={0}>{masteryLine(gain)}</span>
            </Tooltip>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * What this run's milestones opened (ETH-074), e.g. "Smithy: you reached floor 3". The profile
 * has already banked the run when the summary opens, so these are its latest unlocks. For a past
 * run (`run`, from the run history) they are the unlocks recorded under that run's number.
 */
function Unlocked({ run }: { run?: number }) {
  const profile = useProfileStore((s) => s.profile);
  const lines = unlockLines(profile, run);
  if (lines.length === 0) return null;
  return (
    <section aria-label="Unlocked">
      <h3 className={styles.heading}>Unlocked</h3>
      <ul className={styles.list}>
        {lines.map((line) => (
          <li key={line.id}>
            <span aria-hidden="true">🔓 </span>
            {line.tier === undefined ? (
              <>
                <span className={styles.name}>{line.name}</span> opens in town: {line.why}.
              </>
            ) : (
              <>
                <span className={styles.name}>{tierOpenText(line.tier)}</span>: {line.why}.
              </>
            )}
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

/** Over the map once a run has ended and the summary is closed: show it again, rematch, start the next run, or go to Prepare. */
export function RunOverBanner() {
  const report = useRunStore((s) => s.report);
  const open = useRunStore((s) => s.summaryOpen);
  const setSummaryOpen = useRunStore((s) => s.setSummaryOpen);
  const startNext = useRunStore((s) => s.startNext);
  const rematch = useRunStore((s) => s.rematch);
  const openPrepare = useRunStore((s) => s.openPrepare);
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
      <Tooltip content={REMATCH_TOOLTIP}>
        <Button variant="secondary" onClick={rematch}>
          Rematch
        </Button>
      </Tooltip>
      <Button variant="secondary" onClick={startNext}>
        Start next run
      </Button>
      <Button variant="primary" onClick={openPrepare}>
        Continue
      </Button>
    </div>
  );
}
