import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';

/** Backend IPC invoker used by `TauriSaveStore`; tests pass a stand-in. */
export type TauriInvoker = <T = unknown>(command: string, args?: Record<string, unknown>) => Promise<T>;

/** Close-request event surface needed by `subscribeTauriClose`. */
export interface TauriCloseEvent {
  preventDefault(): void;
}

/** Window surface needed by `subscribeTauriClose`; tests may pass a stand-in. */
export interface TauriCloseWindow {
  onCloseRequested(handler: (event: TauriCloseEvent) => void | Promise<void>): Promise<() => void>;
  destroy(): Promise<void>;
}

/** Registers a close-request hook and returns an unsubscriber (sync or async). */
export type CloseRequestSubscriber = (
  onClose: () => void | Promise<void>,
) => (() => void) | Promise<() => void>;

/** Whether the app is running inside a Tauri webview rather than a browser or test runner. */
export function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/** Default Tauri IPC invoker backed by `@tauri-apps/api/core`. */
export const invokeTauri: TauriInvoker = (command, args) => invoke(command, args);

/**
 * Intercepts Tauri's window close request so `onClose` finishes before the window is destroyed.
 * Calls `event.preventDefault()` synchronously before awaiting, guards re-entry, and always
 * calls `destroy()` in `finally`.
 */
export function subscribeTauriClose(
  onClose: () => void | Promise<void>,
  win?: TauriCloseWindow,
): Promise<() => void> {
  const target: TauriCloseWindow = win ?? getCurrentWindow();
  let closing = false;
  return target.onCloseRequested(async (event) => {
    event.preventDefault();
    if (closing) return;
    closing = true;
    try {
      await onClose();
    } finally {
      await target.destroy();
    }
  });
}
