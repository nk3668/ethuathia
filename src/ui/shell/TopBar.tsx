import type { Ref } from 'react';
import { formatNumber } from '../../core';
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

function Currencies() {
  const renown = useProfileStore((s) => s.currencies.renown);
  const trophies = useProfileStore((s) => s.currencies.trophies);
  const favor = useProfileStore((s) => totalFavor(s.currencies.favor));
  return (
    <ul className={styles.currencies} aria-label="Currencies">
      <Currency
        icon="♛"
        name="Renown"
        tone={styles.renown}
        value={renown}
        about="Earned by depth reached and turns survived. Spent in the Guild Hall and the Library."
      />
      <Currency
        icon="☠"
        name="Trophies"
        tone={styles.trophies}
        value={trophies}
        about="Earned by kills, weighted by how dangerous the monster was. Spent in the Smithy."
      />
      <Currency
        icon="♨"
        name="Favor"
        tone={styles.favor}
        value={favor}
        about="Earned by victories, kept conducts and honoring your patron. Spent in the Temple."
      />
    </ul>
  );
}

interface CurrencyProps {
  icon: string;
  name: string;
  tone: string | undefined;
  value: number;
  about: string;
}

function Currency({ icon, name, tone, value, about }: CurrencyProps) {
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

/** "Floor 1 · Turn 4,812" from the latest snapshot, or a dash before the first one. */
function RunPosition() {
  const depth = useSimStore((s) => s.snapshot?.floor.depth);
  const turn = useSimStore((s) => s.snapshot?.turn);
  return (
    <p className={styles.position}>
      {depth === undefined || turn === undefined ? 'No run' : `Floor ${depth} · Turn ${TURN_FORMAT.format(turn)}`}
    </p>
  );
}
