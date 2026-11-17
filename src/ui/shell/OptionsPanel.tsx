import { useUiStore } from '../stores/uiStore';
import styles from './OptionsPanel.module.css';
import { HIGHLIGHT_KINDS } from './text';

/**
 * The Options tab. For now it holds the auto-pause choices (ETH-047): one checkbox per highlight
 * kind, all off by default. The kinds come from the log-text entries that tag events as
 * highlights, so a new kind shows up here with no edit to this file.
 */
export function OptionsPanel() {
  const autoPause = useUiStore((s) => s.autoPause);
  const setAutoPause = useUiStore((s) => s.setAutoPause);
  return (
    <div className={styles.options}>
      <fieldset className={styles.group}>
        <legend className={styles.legend}>Auto-pause</legend>
        <p className={styles.hint}>Pause the run and show the spot on the map when one of these happens.</p>
        {HIGHLIGHT_KINDS.length === 0 ? (
          <p className={styles.hint}>Nothing to pause on yet.</p>
        ) : (
          HIGHLIGHT_KINDS.map((kind) => (
            <label key={kind.id} className={styles.choice} title={kind.description}>
              <input
                type="checkbox"
                checked={autoPause.includes(kind.id)}
                onChange={(e) => setAutoPause(kind.id, e.currentTarget.checked)}
              />
              <span>
                {kind.label}
                <span className={styles.description}>{kind.description}</span>
              </span>
            </label>
          ))
        )}
      </fieldset>
    </div>
  );
}
