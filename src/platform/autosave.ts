/**
 * Autosave triggers (docs/ARCHITECTURE.md §6.5): on an interval, and when the window is closed
 * or hidden. `beforeunload` alone is unreliable for asynchronous storage, so `pagehide` and the
 * page becoming hidden also save; the save function should skip the write when nothing changed.
 */

/** Default autosave interval. */
export const AUTOSAVE_INTERVAL_MS = 30_000;

/** The parts of `window` autosave uses; tests pass a stand-in. */
export interface AutosaveTarget {
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
  setInterval(handler: () => void, ms: number): number;
  clearInterval(id: number): void;
  readonly document?: { readonly visibilityState?: string };
}

export interface AutosaveOptions {
  intervalMs?: number;
  target?: AutosaveTarget;
}

/** Starts autosaving with `save` and returns a function that stops it. */
export function startAutosave(save: () => void, { intervalMs = AUTOSAVE_INTERVAL_MS, target = window }: AutosaveOptions = {}): () => void {
  const timer = target.setInterval(save, intervalMs);
  const onHide = () => {
    if (target.document?.visibilityState === 'hidden') save();
  };
  target.addEventListener('beforeunload', save);
  target.addEventListener('pagehide', save);
  target.addEventListener('visibilitychange', onHide);
  return () => {
    target.clearInterval(timer);
    target.removeEventListener('beforeunload', save);
    target.removeEventListener('pagehide', save);
    target.removeEventListener('visibilitychange', onHide);
  };
}
