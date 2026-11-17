import type { ReactNode, Ref } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { DEITIES } from '../../content';
import { formatNumber } from '../../core';
import { CURRENCY_INFO } from '../../meta';
import type { CurrencyId } from '../../meta';
import { Button, Tooltip } from '../kit';
import { totalFavor, useProfileStore } from '../stores/profileStore';
import { useSimStore } from '../stores/simStore';
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

/** The profile's banked currencies (meta `Profile.currencies`). */
function Currencies() {
  const renown = useProfileStore((s) => s.profile.currencies.renown);
  const trophies = useProfileStore((s) => s.profile.currencies.trophies);
  const favor = useProfileStore(useShallow((s) => s.profile.currencies.favor));
  return (
    <ul className={styles.currencies} aria-label="Banked currencies">
      <Currency icon="♛" id="renown" tone={styles.renown} value={renown} />
      <Currency icon="☠" id="trophies" tone={styles.trophies} value={trophies} />
      <Currency
        icon="♨"
        id="favor"
        tone={styles.favor}
        value={totalFavor(favor)}
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
  detail?: ReactNode;
}

function Currency({ icon, id, tone, value, detail }: CurrencyProps) {
  const { name, about } = CURRENCY_INFO[id];
  return (
    <li>
      <Tooltip
        placement="bottom-start"
        content={
          <>
            <strong>
              {name}: {TURN_FORMAT.format(value)}
            </strong>
            <br />
            {about}
            <br />
            {BANKED_NOTE}
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
        </span>
      </Tooltip>
    </li>
  );
}

/**
 * "Floor 3/10 · Turn 4,812" from the latest snapshot: the floor the map shows out of the
 * dungeon's depth. "No run" before the first snapshot.
 */
function RunPosition() {
  const depth = useSimStore((s) => s.snapshot?.floor.depth);
  const total = useSimStore((s) => s.snapshot?.domains.floors.depth);
  const deepest = useSimStore((s) => s.snapshot?.domains.floors.deepest);
  const turn = useSimStore((s) => s.snapshot?.turn);
  if (depth === undefined || total === undefined || deepest === undefined || turn === undefined) {
    return <p className={styles.position}>No run</p>;
  }
  return (
    <Tooltip
      placement="bottom"
      content={
        <>
          <strong>
            Floor {depth} of {total}
          </strong>
          <br />
          The floor the map shows, out of the dungeon&rsquo;s {total} floors. Deepest reached: floor {deepest}.
          <br />
          Turn {TURN_FORMAT.format(turn)}: game time since the run began.
        </>
      }
    >
      <p tabIndex={0} className={styles.position}>
        Floor {depth}/{total} · Turn {TURN_FORMAT.format(turn)}
      </p>
    </Tooltip>
  );
}
