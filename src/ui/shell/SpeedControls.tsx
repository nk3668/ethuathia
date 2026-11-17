import { TURNS_PER_SECOND } from '../../sim';
import type { Speed } from '../../sim';
import { keyHint } from '../input/keymap';
import { Button, Tooltip } from '../kit';
import type { RunningSpeed } from '../stores/simStore';
import { useSimStore } from '../stores/simStore';
import styles from './SpeedControls.module.css';

const RUNNING_SPEEDS: readonly RunningSpeed[] = [1, 2, 4, 8, 'max'];

/** "1×", "2×" … "Max". */
function speedLabel(speed: Speed): string {
  if (speed === 0) return 'Paused';
  return speed === 'max' ? 'Max' : `${speed}×`;
}

function speedHint(speed: RunningSpeed): string {
  if (speed === 'max') return 'As fast as this machine allows';
  const turns = TURNS_PER_SECOND * speed;
  return `${turns} party turns a second`;
}

/** Why the speed buttons do nothing after a host error, for their tooltips. */
export const STOPPED_HINT = 'The run stopped on an error and can’t be resumed.';

/**
 * Pause and speed, as a segmented control in the top bar (docs/VISUAL-DESIGN.md §3.1). The
 * active button is filled with the accent and marked `aria-pressed`. Pressing Pause while paused
 * resumes at the last speed. Each button's key comes from the keymap.
 *
 * After a host error the run stays paused: every button is marked `aria-disabled` (not
 * `disabled`, so its tooltip still opens on hover and focus) and its tooltip says why.
 */
export function SpeedControls() {
  const speed = useSimStore((s) => s.speed);
  const resumeSpeed = useSimStore((s) => s.resumeSpeed);
  const setSpeed = useSimStore((s) => s.setSpeed);
  const togglePause = useSimStore((s) => s.togglePause);
  const stopped = useSimStore((s) => s.error !== null);
  const paused = speed === 0;
  const pauseKeys = keyHint({ type: 'togglePause' });

  return (
    <div role="group" aria-label="Sim speed" className={styles.group}>
      <Tooltip
        placement="bottom"
        content={
          <>
            <strong>{paused ? 'Paused' : 'Pause'}</strong>
            <br />
            {stopped
              ? STOPPED_HINT
              : paused
                ? `Press again to resume at ${speedLabel(resumeSpeed)}.`
                : 'Stop the run until you resume it.'}
            {pauseKeys.hint && !stopped && (
              <>
                <br />
                {pauseKeys.hint}
              </>
            )}
          </>
        }
      >
        <Button
          className={styles.segment}
          pressed={paused}
          aria-disabled={stopped || undefined}
          onClick={togglePause}
          aria-keyshortcuts={pauseKeys.keys || undefined}
        >
          <span aria-hidden="true" className={styles.pauseIcon} />
          <span className="sr-only">Pause</span>
        </Button>
      </Tooltip>
      {RUNNING_SPEEDS.map((step) => {
        const keys = keyHint({ type: 'setSpeed', speed: step });
        return (
          <Tooltip
            key={step}
            placement="bottom"
            content={
              <>
                <strong>{speedLabel(step)}</strong>
                <br />
                {stopped ? STOPPED_HINT : speedHint(step)}
                {keys.hint && !stopped && (
                  <>
                    <br />
                    {keys.hint}
                  </>
                )}
              </>
            }
          >
            <Button
              className={styles.segment}
              pressed={speed === step}
              aria-disabled={stopped || undefined}
              onClick={() => setSpeed(step)}
              aria-keyshortcuts={keys.keys || undefined}
            >
              {speedLabel(step)}
            </Button>
          </Tooltip>
        );
      })}
    </div>
  );
}
