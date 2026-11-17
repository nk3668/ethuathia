import { useSimStore } from '../stores/simStore';
import styles from './SimErrorBanner.module.css';

/**
 * The banner across the top of the map when the sim host stops the run on an error
 * (docs/VISUAL-DESIGN.md §4.4). It says in plain words that the run stopped and why, and shows the
 * error text the host reported. It is an `alert`, so a screen reader announces it, and it is
 * marked with a cross icon and a heading as well as the danger color.
 */
export function SimErrorBanner() {
  const error = useSimStore((s) => s.error);
  if (error === null) return null;
  return (
    <div role="alert" className={styles.banner} data-slot="sim-error">
      <span aria-hidden="true" className={styles.icon}>
        ✕
      </span>
      <div className={styles.body}>
        <p className={styles.title}>The run stopped on an error</p>
        <p>
          The simulation hit a problem it couldn’t recover from, so the run is paused and can’t be resumed.
          Restart the game to begin a new run.
        </p>
        <p className={styles.detail}>
          <span className={styles.label}>Error</span> <code>{error}</code>
        </p>
      </div>
    </div>
  );
}
