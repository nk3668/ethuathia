import type { ReactNode, Ref } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { DEITIES } from '../../content';
import { formatNumber } from '../../core';
import { CURRENCY_INFO } from '../../meta';
import type { CurrencyId } from '../../meta';
import { keyHint } from '../input/keymap';
import { Button, Tooltip } from '../kit';
import { favorDeity, PARTY_SIZE_BUDGET_STEP, RENOWN, TROPHIES } from '../../sim';
import type { RewardAmounts } from '../../sim';
import { totalFavor, useProfileStore } from '../stores/profileStore';
import { useSimStore } from '../stores/simStore';
import { RENOWN_FORMULA_EXAMPLES, RENOWN_FORMULA_TEXT, WIPE_LOSS_PERCENT } from './runSummaryText';
import { SpeedControls } from './SpeedControls';
import styles from './TopBar.module.css';

const TURN_FORMAT = new Intl.NumberFormat('en-US');

export interface TopBarProps {
  /** At narrow widths the side panel is a drawer, opened from a button here. */
  narrow: boolean;
  drawerOpen: boolean;
  drawerId: string;
  onToggleDrawer(): void;
  drawerButtonRef?: Ref<HTMLButtonElement>;
}

/**
 * The top bar (docs/VISUAL-DESIGN.md §3.1): currencies on the left, run position in the centre,
 * and on the right the pause and speed control.
 */
export function TopBar({ narrow, drawerOpen, drawerId, onToggleDrawer, drawerButtonRef }: TopBarProps) {
  return (
    <header className={styles.bar} aria-label="Top bar">
      <Currencies />
      <RunPosition />
      <div className={styles.end}>
        <Possession />
        <SpeedControls />
        {narrow && (
          <Button
            ref={drawerButtonRef}
            aria-expanded={drawerOpen}
            aria-controls={drawerId}
            aria-haspopup="dialog"
            onClick={onToggleDrawer}
          >
            <span aria-hidden="true">☰</span> Panels
          </Button>
        )}
      </div>
    </header>
  );
}

const BANKED_NOTE = 'Banked: kept safe in town, never at risk.';

const AT_RISK_NOTE =
  `At risk: earned this run, not banked yet. A victory or a retreat banks all of it; ` +
  `a wipe loses ${WIPE_LOSS_PERCENT} of it (rounded in your disfavor) and banks the rest.`;

/** No at-risk amounts: before the first snapshot, or once the run has ended (the profile has banked it). */
const NO_RISK: Readonly<RewardAmounts> = {};

/**
 * The profile's banked currencies (meta `Profile.currencies`), and beside each, while a run goes
 * on, what this run has earned so far at risk (`snapshot.domains.run.atRisk`, ETH-023).
 */
function Currencies() {
  const renown = useProfileStore((s) => s.profile.currencies.renown);
  const trophies = useProfileStore((s) => s.profile.currencies.trophies);
  const favor = useProfileStore(useShallow((s) => s.profile.currencies.favor));
  const atRisk = useSimStore((s) => {
    const run = s.snapshot?.domains.run;
    return run === undefined || run.end !== null ? NO_RISK : run.atRisk;
  });
  const favorAtRisk = Object.entries(atRisk).reduce((sum, [key, n]) => (favorDeity(key) === null ? sum : sum + n), 0);
  return (
    <ul className={styles.currencies} aria-label="Currencies">
      <Currency
        icon="♛"
        id="renown"
        tone={styles.renown}
        value={renown}
        atRisk={atRisk[RENOWN] ?? 0}
        detail={
          <>
            Formula: {RENOWN_FORMULA_TEXT}
            <br />
            {RENOWN_FORMULA_EXAMPLES}
          </>
        }
      />
      <Currency icon="☠" id="trophies" tone={styles.trophies} value={trophies} atRisk={atRisk[TROPHIES] ?? 0} />
      <Currency
        icon="♨"
        id="favor"
        tone={styles.favor}
        value={totalFavor(favor)}
        atRisk={favorAtRisk}
        detail={<FavorBreakdown favor={favor} />}
      />
    </ul>
  );
}

/** Favor per deity, for the Favor tooltip. Shows the id for a deity with no content def yet. */
function FavorBreakdown({ favor }: { favor: Readonly<Record<string, number>> }) {
  const deities = Object.entries(favor).filter(([, n]) => n > 0);
  if (deities.length === 0) return <>No deity has granted you Favor yet.</>;
  return (
    <ul className={styles.breakdown}>
      {deities.map(([deity, n]) => (
        <li key={deity}>
          {DEITIES.has(deity) ? DEITIES.get(deity).name : deity}: {TURN_FORMAT.format(n)}
        </li>
      ))}
    </ul>
  );
}

interface CurrencyProps {
  icon: string;
  id: CurrencyId;
  tone: string | undefined;
  value: number;
  /** This run's earnings so far, not banked yet; 0 shows nothing. */
  atRisk: number;
  detail?: ReactNode;
}

function Currency({ icon, id, tone, value, atRisk, detail }: CurrencyProps) {
  const { name, about } = CURRENCY_INFO[id];
  return (
    <li>
      <Tooltip
        placement="bottom-start"
        content={
          <>
            <strong>
              {name}: {TURN_FORMAT.format(value)} banked
              {atRisk > 0 && <>, +{TURN_FORMAT.format(atRisk)} at risk</>}
            </strong>
            <br />
            {about}
            <br />
            {BANKED_NOTE}
            <br />
            {AT_RISK_NOTE}
            {detail !== undefined && (
              <>
                <br />
                {detail}
              </>
            )}
          </>
        }
      >
        <span tabIndex={0} className={styles.currency}>
          <span aria-hidden="true" className={tone}>
            {icon}
          </span>
          <span className="sr-only">{name}</span>
          <span className={styles.number}>{formatNumber(value)}</span>
          {atRisk > 0 && (
            <span className={styles.atRisk}>
              <span className="sr-only">, at risk: </span>+{formatNumber(atRisk)}
            </span>
          )}
        </span>
      </Tooltip>
    </li>
  );
}

/**
 * Who the player possesses (ETH-066), as a filled accent button that releases them: "◉ Mira ·
 * your move" while the run waits for a command. Nothing while the AI runs everyone.
 */
function Possession() {
  const member = useSimStore(
    useShallow((s) => {
      const m = s.snapshot?.party.find((p) => p.possessed && p.alive);
      return m === undefined ? null : { id: m.id, name: m.name, waiting: m.awaitingInput };
    }),
  );
  if (member === null) return null;
  const keys = keyHint({ type: 'togglePossession' });
  return (
    <Tooltip
      placement="bottom"
      content={
        <>
          <strong>Possessing {member.name}</strong>
          <br />
          {member.waiting ? 'The run waits for your command.' : 'Carrying out your command.'} Move or attack with WASD (Q/E/Z/C
          diagonals), the arrows or the numpad; G picks up, &gt; and &lt; take the stairs, F drinks from a fountain underfoot,
          . or X waits. Gear and items are in the pack on the party card.
          <br />
          Click to release {member.name} to the AI.
          {keys.hint && (
            <>
              <br />
              {keys.hint}
            </>
          )}
        </>
      }
    >
      <Button
        variant="primary"
        className={styles.possession}
        aria-keyshortcuts={keys.keys || undefined}
        onClick={() => useSimStore.getState().send({ type: 'release', actor: member.id })}
      >
        <span aria-hidden="true">◉ </span>
        {member.name}
        {member.waiting && <span className={styles.waiting}> · your move</span>}
        <span className="sr-only">, possessed. Release</span>
      </Button>
    </Tooltip>
  );
}

/**
 * "Floor 3 · Turn 4,812" (or "Floor 3/10 · Turn 4,812" once revealed) from the latest snapshot.
 * "No run" before the first snapshot.
 */
function RunPosition() {
  const depth = useSimStore((s) => s.snapshot?.floor.depth);
  const total = useSimStore((s) => s.snapshot?.domains.floors.depth);
  const deepest = useSimStore((s) => s.snapshot?.domains.floors.deepest);
  const turn = useSimStore((s) => s.snapshot?.turn);
  const partySize = useSimStore((s) => s.snapshot?.party.length ?? 1);
  if (depth === undefined || total === undefined || deepest === undefined || turn === undefined) {
    return <p className={styles.position}>No run</p>;
  }
  const floorLabel = total === null ? `Floor ${depth}` : `Floor ${depth}/${total}`;
  const floorHeading = total === null ? `Floor ${depth}` : `Floor ${depth} of ${total}`;
  const floorAbout =
    total === null
      ? `The floor the map shows. Deepest reached: floor ${deepest}.`
      : `The floor the map shows, out of the dungeon\u2019s ${total} floors. Deepest reached: floor ${deepest}.`;
  return (
    <Tooltip
      placement="bottom"
      content={
        <>
          <strong>{floorHeading}</strong>
          <br />
          {floorAbout}
          <br />
          {partySize > 1 && (
            <>
              Bigger parties meet more monsters: +{Math.round(PARTY_SIZE_BUDGET_STEP * 100)}% for each adventurer after the first (+
              {Math.round(PARTY_SIZE_BUDGET_STEP * 100 * (partySize - 1))}% for your party of {partySize}). Only the numbers and packs
              grow; no monster gets stronger.
              <br />
            </>
          )}
          Turn {TURN_FORMAT.format(turn)}: game time since the run began.
        </>
      }
    >
      <p tabIndex={0} className={styles.position}>
        {floorLabel} · Turn {TURN_FORMAT.format(turn)}
      </p>
    </Tooltip>
  );
}
