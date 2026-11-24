/**
 * Autosave triggers (docs/ARCHITECTURE.md §6.5): on an interval, when the window is hidden or
 * unloaded, and on Tauri's `onCloseRequested` so desktop closes wait for the disk write.
 */
import { isTauriRuntime, subscribeTauriClose } from './tauri';
import type { CloseRequestSubscriber } from './tauri';

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
  onCloseRequested?: CloseRequestSubscriber;
}

/** Starts autosaving with `save` and returns a function that stops it. */
export function startAutosave(
  save: () => void | Promise<void>,
  {
    intervalMs = AUTOSAVE_INTERVAL_MS,
    target = window,
    onCloseRequested = isTauriRuntime() ? subscribeTauriClose : undefined,
  }: AutosaveOptions = {},
): () => void {
  const fire = () => {
    void save();
  };
  const timer = target.setInterval(fire, intervalMs);
  const onHide = () => {
    if (target.document?.visibilityState === 'hidden') fire();
  };
  target.addEventListener('beforeunload', fire);
  target.addEventListener('pagehide', fire);
  target.addEventListener('visibilitychange', onHide);

  let disposed = false;
  let unlistenClose: (() => void) | null = null;
  if (onCloseRequested) {
    try {
      const subscription = onCloseRequested(() => (disposed ? undefined : save()));
      if (typeof subscription === 'function') {
        unlistenClose = subscription;
      } else {
        void subscription
          .then((unlisten) => {
            if (disposed) unlisten();
            else unlistenClose = unlisten;
          })
          .catch(() => undefined);
      }
    } catch {
      // Keep interval and page-hide triggers active if close registration fails.
    }
  }

  return () => {
    disposed = true;
    target.clearInterval(timer);
    target.removeEventListener('beforeunload', fire);
    target.removeEventListener('pagehide', fire);
    target.removeEventListener('visibilitychange', onHide);
    unlistenClose?.();
    unlistenClose = null;
  };
}
