/**
 * Auto-pause (ETH-047): pauses the run when a highlight of a kind the player ticked in Options
 * happens, and centers the map where it did, so an idle player doesn't miss it.
 *
 * The check runs on the events as `simStore` receives them, so a worker host may have run a few
 * more steps in the same batch before the pause lands; the log and the map focus still point at
 * the moment itself.
 */
import type { SimEvent, Unsubscribe } from '../../sim';
import { useSimStore } from '../stores/simStore';
import { useUiStore } from '../stores/uiStore';
import { highlightOf } from './text';
import type { Highlight } from './text';

/** The first highlight among the events numbered `fromSeq` or later whose kind is in `kinds`. */
export function autoPauseHighlight(
  events: readonly { seq: number; event: SimEvent }[],
  fromSeq: number,
  kinds: readonly string[],
): Highlight | undefined {
  if (kinds.length === 0) return undefined;
  for (const { seq, event } of events) {
    if (seq < fromSeq) continue;
    const highlight = highlightOf(event);
    if (highlight !== undefined && kinds.includes(highlight.kind.id)) return highlight;
  }
  return undefined;
}

/**
 * Watches `simStore` for auto-pause highlights until the returned function is called. On one it
 * pauses, focuses the map on it and notes its kind for the log's "auto-paused" notice.
 */
export function watchAutoPause(): Unsubscribe {
  return useSimStore.subscribe((state, prev) => {
    // Resuming clears the "auto-paused" notice.
    if (prev.speed === 0 && state.speed !== 0) useUiStore.getState().noteAutoPause(null);
    if (state.events === prev.events || state.speed === 0) return;
    const ui = useUiStore.getState();
    const highlight = autoPauseHighlight(state.events, prev.nextSeq, ui.autoPause);
    if (highlight === undefined) return;
    state.setSpeed(0);
    ui.focusMap(highlight.place);
    ui.noteAutoPause(highlight.kind.label);
  });
}
