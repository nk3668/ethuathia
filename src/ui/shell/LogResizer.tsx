import { useRef } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import { LOG_HEIGHT, useUiStore } from '../stores/uiStore';
import styles from './LogResizer.module.css';

/** How far one arrow key press moves the log edge, in CSS pixels. Shift moves five times as far. */
export const LOG_RESIZE_STEP = 16;

/** The share of the window height the log may take; matches `--log-max-height` in tokens.css. */
const LOG_MAX_VIEWPORT_SHARE = 0.6;

/**
 * The handle on the log strip's top edge. Dragging it up makes the log taller; arrow keys,
 * Page Up / Page Down and Home / End do the same from the keyboard. The height is kept in
 * `uiStore`, which remembers it between sessions.
 */
export function LogResizer() {
  const height = useUiStore((s) => s.logHeight);
  const setHeight = useUiStore((s) => s.setLogHeight);
  const drag = useRef<{ startY: number; startHeight: number } | null>(null);
  // The shell never lets the log take more than --log-max-height (60vh), so stop there too.
  const max = Math.min(LOG_HEIGHT.max, Math.floor(window.innerHeight * LOG_MAX_VIEWPORT_SHARE));
  const shown = Math.min(height, max);
  const resize = (to: number) => setHeight(Math.min(to, max));

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { startY: event.clientY, startHeight: shown };
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const start = drag.current;
    if (start) resize(start.startHeight + (start.startY - event.clientY));
  };

  const endDrag = () => {
    drag.current = null;
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? LOG_RESIZE_STEP * 5 : LOG_RESIZE_STEP;
    let next: number;
    switch (event.key) {
      case 'ArrowUp':
        next = shown + step;
        break;
      case 'ArrowDown':
        next = shown - step;
        break;
      case 'PageUp':
        next = shown + LOG_RESIZE_STEP * 5;
        break;
      case 'PageDown':
        next = shown - LOG_RESIZE_STEP * 5;
        break;
      case 'Home':
        next = max;
        break;
      case 'End':
        next = LOG_HEIGHT.min;
        break;
      default:
        return;
    }
    event.preventDefault();
    resize(next);
  };

  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      aria-label="Log height"
      aria-valuemin={LOG_HEIGHT.min}
      aria-valuemax={max}
      aria-valuenow={shown}
      aria-valuetext={`${shown} pixels`}
      tabIndex={0}
      className={styles.handle}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onLostPointerCapture={endDrag}
      onKeyDown={onKeyDown}
    >
      <span className={styles.grip} aria-hidden="true" />
    </div>
  );
}
