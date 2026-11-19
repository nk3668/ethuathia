// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { EntityId, SimEvent, Snapshot } from '../../src/sim';
import { AppShell } from '../../src/ui/shell/AppShell';
import { autoPauseHighlight, watchAutoPause } from '../../src/ui/shell/autoPause';
import { HIGHLIGHT_STUCK } from '../../src/ui/shell/logText/core';
import type { LogTextRecord } from '../../src/ui/shell/logText/types';
import {
  collectHighlightKinds,
  defineHighlight,
  HIGHLIGHT_KINDS,
  highlightOf,
  logLines,
} from '../../src/ui/shell/text';
import { useSimStore } from '../../src/ui/stores/simStore';
import { LOG_HEIGHT, UI_STORAGE_KEY, useUiStore } from '../../src/ui/stores/uiStore';
import { fixtureDomains } from './fixtures';

const stuck = (turn: number, pos = { x: 4, y: 1 }): SimEvent => ({
  type: 'stuck',
  turn,
  actor: 1,
  rule: { set: 'baseline', index: 1 },
  action: 'act.explore',
  turns: 12,
  detail: 'No progress in 12 turns.',
  floor: 'f1',
  pos,
});
const waited = (turn: number): SimEvent => ({ type: 'waited', turn, actor: 1 });
const door = (turn: number): SimEvent => ({ type: 'doorOpened', turn, actor: 1, door: 9, pos: { x: 2, y: 0 } });
const names = (id: EntityId) => (id === 1 ? 'Mira' : `#${id}`);

const SNAPSHOT: Snapshot = {
  turn: 10,
  seed: 1,
  floor: {
    id: 'f1',
    depth: 1,
    width: 1,
    height: 1,
    terrain: new Uint8Array(1),
    visible: new Uint8Array(1),
    features: [],
    actors: [],
    explored: { seen: 1, total: 1, fraction: 1 },
  },
  party: [
    {
      id: 1,
      name: 'Mira',
      classId: 'class.vanguard',
      raceId: 'race.human',
      floor: 'f1',
      pos: { x: 0, y: 0 },
      alive: true,
      hp: 10,
      maxHp: 10,
      mp: 0,
      maxMp: 0,
      intent: null,
      possessed: false,
      awaitingInput: false,
    },
  ],
  domains: fixtureDomains(),
};

// jsdom has no 2D canvas; the map then draws nothing.
HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext;

function resetUi() {
  useUiStore.setState({
    logHeight: LOG_HEIGHT.default,
    tab: 'rules',
    selected: null,
    drawerOpen: false,
    mapCamera: 'follow',
    logFilter: 'all',
    mapFocus: null,
    autoPause: [],
    autoPaused: null,
  });
}

beforeEach(() => {
  localStorage.clear();
  useSimStore.getState().reset();
  useSimStore.setState({ speed: 1, resumeSpeed: 1 });
  resetUi();
});
afterEach(() => {
  cleanup();
  resetUi();
  localStorage.clear();
});

describe('highlight tags', () => {
  it('collects the kinds named by log-text entries, each once', () => {
    expect(HIGHLIGHT_KINDS).toContain(HIGHLIGHT_STUCK);
    expect(new Set(HIGHLIGHT_KINDS.map((k) => k.id)).size).toBe(HIGHLIGHT_KINDS.length);
    const again = defineHighlight({ ...HIGHLIGHT_STUCK });
    expect(() => collectHighlightKinds({ a: { highlight: HIGHLIGHT_STUCK }, b: { highlight: again } })).toThrow(
      /declared twice/,
    );
    expect(collectHighlightKinds({ a: { highlight: HIGHLIGHT_STUCK }, b: { highlight: HIGHLIGHT_STUCK } })).toEqual([
      HIGHLIGHT_STUCK,
    ]);
  });

  it('tags stuck events with their place, and leaves other events alone', () => {
    expect(highlightOf(stuck(3))).toEqual({ kind: HIGHLIGHT_STUCK, place: { floor: 'f1', pos: { x: 4, y: 1 } } });
    expect(highlightOf(door(3))).toBeUndefined();
    const lines = logLines(
      [stuck(1), door(2)].map((event, seq) => ({ seq, event })),
      names,
    );
    expect(lines.map((l) => l.highlight?.kind.id)).toEqual(['stuck', undefined]);
  });

  it('only lets events that carry floor and pos be highlights', () => {
    const ok: LogTextRecord<{ type: 'x'; floor: string; pos: { x: number; y: number } }> = {
      x: { category: 'ai', highlight: HIGHLIGHT_STUCK, text: () => '' },
    };
    // @ts-expect-error: `y` has no place, so it can't be a highlight.
    const bad: LogTextRecord<{ type: 'y' }> = { y: { category: 'ai', highlight: HIGHLIGHT_STUCK, text: () => '' } };
    expect([ok, bad]).toHaveLength(2);
  });
});

describe('auto-pause', () => {
  it('finds the first chosen highlight among new events, and none when nothing is chosen', () => {
    const events = [stuck(1, { x: 1, y: 1 }), waited(2), stuck(3, { x: 2, y: 2 }), stuck(4, { x: 3, y: 3 })].map(
      (event, seq) => ({ seq, event }),
    );
    expect(autoPauseHighlight(events, 0, [])).toBeUndefined();
    expect(autoPauseHighlight(events, 1, ['stuck'])?.place.pos).toEqual({ x: 2, y: 2 });
    expect(autoPauseHighlight(events, 1, ['other'])).toBeUndefined();
  });

  it('is off by default: highlights do not pause the run', () => {
    const unwatch = watchAutoPause();
    useSimStore.getState().receiveEvents([stuck(1)]);
    unwatch();
    expect(useSimStore.getState().speed).toBe(1);
    expect(useUiStore.getState().mapFocus).toBeNull();
  });

  it('pauses on a chosen kind, centers the map on it, and clears the notice and marker on resume', () => {
    useUiStore.getState().setAutoPause('stuck', true);
    const unwatch = watchAutoPause();
    useSimStore.getState().receiveEvents([waited(1), stuck(2)]);
    expect(useSimStore.getState().speed).toBe(0);
    expect(useUiStore.getState().mapFocus).toEqual({ floor: 'f1', pos: { x: 4, y: 1 } });
    expect(useUiStore.getState().autoPaused).toBe(HIGHLIGHT_STUCK.label);
    useSimStore.getState().togglePause();
    expect(useSimStore.getState().speed).toBe(1);
    expect(useUiStore.getState().autoPaused).toBeNull();
    expect(useUiStore.getState().mapFocus).toBeNull();
    // Old events don't pause again; only new ones do.
    useSimStore.getState().receiveEvents([waited(3)]);
    expect(useSimStore.getState().speed).toBe(1);
    unwatch();
  });

  it('remembers the choices between sessions', async () => {
    useUiStore.getState().setAutoPause('stuck', true);
    useUiStore.getState().setAutoPause('stuck', true);
    expect(useUiStore.getState().autoPause).toEqual(['stuck']);
    expect(JSON.parse(localStorage.getItem(UI_STORAGE_KEY) ?? '{}').state.autoPause).toEqual(['stuck']);
    resetUi();
    localStorage.setItem(
      UI_STORAGE_KEY,
      JSON.stringify({ version: 1, state: { autoPause: ['stuck', 7, 'stuck', 'later.kind'] } }),
    );
    await useUiStore.persist.rehydrate();
    expect(useUiStore.getState().autoPause).toEqual(['stuck', 'later.kind']);
    useUiStore.getState().setAutoPause('stuck', false);
    expect(useUiStore.getState().autoPause).toEqual(['later.kind']);
  });
});

describe('highlights in the shell', () => {
  it('filters the log to highlights, and clicking one centers the map there', async () => {
    const user = userEvent.setup();
    useSimStore.getState().receiveSnapshot(SNAPSHOT);
    render(<AppShell />);
    act(() => useSimStore.getState().receiveEvents([door(1), stuck(2)]));
    const log = screen.getByRole('region', { name: 'Log' });
    expect(within(log).getAllByRole('listitem')).toHaveLength(2);

    await user.click(within(log).getByRole('button', { name: /Highlights/ }));
    expect(useUiStore.getState().logFilter).toBe('highlights');
    const items = within(log).getAllByRole('listitem');
    expect(items).toHaveLength(1);
    await user.click(within(items[0] as HTMLElement).getByRole('button', { name: /Highlight:.*No progress/ }));
    expect(useUiStore.getState().mapFocus).toEqual({ floor: 'f1', pos: { x: 4, y: 1 } });

    // Selecting an adventurer goes back to following them.
    await user.click(screen.getByRole('button', { name: 'Mira' }));
    expect(useUiStore.getState().mapFocus).toBeNull();

    await user.click(within(log).getByRole('button', { name: 'All' }));
    expect(within(log).getAllByRole('listitem')).toHaveLength(2);
  });

  it('says when the highlights filter has nothing yet', async () => {
    const user = userEvent.setup();
    render(<AppShell />);
    const log = screen.getByRole('region', { name: 'Log' });
    await user.click(within(log).getByRole('button', { name: /Highlights/ }));
    expect(log.textContent).toContain('No highlights yet.');
  });

  it('lists every highlight kind in Options, all off, and toggles auto-pause', async () => {
    const user = userEvent.setup();
    render(<AppShell />);
    const side = within(screen.getByRole('region', { name: 'Side panel' }));
    await user.click(side.getByRole('tab', { name: 'Options' }));
    const group = side.getByRole('group', { name: 'Auto-pause' });
    const boxes = within(group).getAllByRole('checkbox');
    expect(boxes).toHaveLength(HIGHLIGHT_KINDS.length);
    expect(boxes.every((b) => !(b as HTMLInputElement).checked)).toBe(true);
    await user.click(within(group).getByRole('checkbox', { name: /An adventurer gets stuck/ }));
    expect(useUiStore.getState().autoPause).toEqual(['stuck']);
  });

  it('shows why the run auto-paused', () => {
    useUiStore.setState({ autoPaused: HIGHLIGHT_STUCK.label });
    useSimStore.setState({ speed: 0 });
    render(<AppShell />);
    expect(screen.getByRole('status').textContent).toBe(`Auto-paused: ${HIGHLIGHT_STUCK.label}`);
  });
});
