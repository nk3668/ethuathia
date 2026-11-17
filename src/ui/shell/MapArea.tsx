import { MapCanvas } from '../map/MapCanvas';
import { MapControls } from '../map/MapControls';
import styles from './MapArea.module.css';

/**
 * The map region: the canvas map in the `map-canvas` slot and the follow / whole-floor camera
 * toggle in the `map-controls` slot at the corner (docs/VISUAL-DESIGN.md §4.4).
 */
export function MapArea() {
  return (
    <section className={styles.map} aria-label="Dungeon map">
      <div className={styles.canvas} data-slot="map-canvas">
        <MapCanvas />
      </div>
      <div className={styles.controls} data-slot="map-controls">
        <MapControls />
      </div>
    </section>
  );
}
