import styles from './MapArea.module.css';

/**
 * The map region. ETH-013 puts the canvas map renderer in the `map-canvas` slot and the
 * follow / fit camera toggle in the `map-controls` slot at the corner (docs/VISUAL-DESIGN.md §4.4).
 */
export function MapArea() {
  return (
    <section className={styles.map} aria-label="Dungeon map">
      <div className={styles.canvas} data-slot="map-canvas">
        <p className={styles.placeholder}>The dungeon map is drawn here.</p>
      </div>
      <div className={styles.controls} data-slot="map-controls" />
    </section>
  );
}
