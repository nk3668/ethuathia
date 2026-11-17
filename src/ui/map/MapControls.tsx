import { Button, Tooltip } from '../kit';
import { useUiStore } from '../stores/uiStore';
import type { CameraMode } from './camera';
import styles from './MapCanvas.module.css';

const MODES: readonly { mode: CameraMode; label: string; hint: string }[] = [
  { mode: 'follow', label: 'Follow', hint: 'Keep the selected adventurer in view (the first one if none is selected)' },
  { mode: 'fit', label: 'Whole floor', hint: 'Fit the whole floor in the map area' },
];

/** The camera toggle at the map's corner (docs/VISUAL-DESIGN.md §4.4). */
export function MapControls() {
  const current = useUiStore((s) => s.mapCamera);
  const setMapCamera = useUiStore((s) => s.setMapCamera);
  return (
    <div role="group" aria-label="Map camera" className={styles.controls}>
      {MODES.map(({ mode, label, hint }) => (
        <Tooltip key={mode} content={hint}>
          <Button pressed={current === mode} onClick={() => setMapCamera(mode)}>
            {label}
          </Button>
        </Tooltip>
      ))}
    </div>
  );
}
