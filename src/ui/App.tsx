import styles from './App.module.css';

/** Placeholder page. The real shell arrives with ETH-012. */
export function App() {
  return (
    <main className={styles.page}>
      <p className={styles.glyph} aria-hidden="true">
        @
      </p>
      <h1 className={styles.title}>Ethuathia</h1>
      <p className={styles.note}>The project skeleton is running. There is nothing to play yet.</p>
    </main>
  );
}
