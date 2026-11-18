// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FEATURE_DOOR } from '../../src/content';
import { createRun, moveEntity, snapshot } from '../../src/sim';
import type { RunState } from '../../src/sim';
import { fitView, tileRect } from '../../src/ui/map';
import { MapArea } from '../../src/ui/shell/MapArea';
import { useSimStore } from '../../src/ui/stores/simStore';
import { LOG_HEIGHT, useUiStore } from '../../src/ui/stores/uiStore';

const ROOMS = [
  '############',
  '#@@.+.....>#',
  '#<..#......#',
  '############',
];
const PARTY = [
  { name: 'Mira', classId: 'class.vanguard', raceId: 'race.human' },
  { name: 'Oren', classId: 'class.vanguard', raceId: 'race.human' },
];
const WIDTH = 600;
const HEIGHT = 400;

/** Draw calls the map made, by method name. */
let calls: string[] = [];

// A 600×400 canvas with a 2D context that records calls, since jsdom has neither.
beforeEach(() => {
  calls = [];
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (target, key: string) => (key in target ? target[key] : (..._args: unknown[]) => void calls.push(key)),
    set: (target, key: string, value) => {
      target[key] = value;
      return true;
    },
  });
  HTMLCanvasElement.prototype.getContext = (() => ctx) as unknown as typeof HTMLCanvasElement.prototype.getContext;
  Object.defineProperty(HTMLCanvasElement.prototype, 'clientWidth', { configurable: true, get: () => WIDTH });
  Object.defineProperty(HTMLCanvasElement.prototype, 'clientHeight', { configurable: true, get: () => HEIGHT });
  localStorage.clear();
  useSimStore.getState().reset();
  useUiStore.setState({ logHeight: LOG_HEIGHT.default, tab: 'rules', selected: null, drawerOpen: false, mapCamera: 'follow' });
});
afterEach(() => {
  cleanup();
  localStorage.clear();
});

function start(): RunState {
  const state = createRun({ party: PARTY, floorText: ROOMS }, 1);
  useSimStore.getState().receiveSnapshot(snapshot(state));
  return state;
}

const canvas = () => screen.getByRole('application', { name: /Dungeon map/ });

describe('MapCanvas', () => {
  it('draws the snapshot on a canvas sized in device pixels', () => {
    start();
    render(<MapArea />);
    const el = canvas() as HTMLCanvasElement;
    expect([el.width, el.height]).toEqual([WIDTH, HEIGHT]);
    expect(calls).toContain('drawImage');
    expect(el.getAttribute('aria-label')).toMatch(/floor 1/);
  });

  it('switches between follow and whole-floor camera modes', async () => {
    start();
    render(<MapArea />);
    const follow = screen.getByRole('button', { name: 'Follow' });
    const fit = screen.getByRole('button', { name: 'Whole floor' });
    expect(follow.getAttribute('aria-pressed')).toBe('true');
    expect(fit.getAttribute('aria-pressed')).toBe('false');
    await userEvent.click(fit);
    expect(useUiStore.getState().mapCamera).toBe('fit');
    expect(fit.getAttribute('aria-pressed')).toBe('true');
    expect(follow.getAttribute('aria-pressed')).toBe('false');
  });

  it('names what is under the pointer, and selects an adventurer on click', async () => {
    const state = start();
    useUiStore.setState({ mapCamera: 'fit' });
    render(<MapArea />);
    const snap = snapshot(state);
    const view = fitView(snap.floor, { width: WIDTH, height: HEIGHT }, 0.6);
    const point = (x: number, y: number) => {
      const r = tileRect(view, { x, y });
      return { clientX: r.x + r.w / 2, clientY: r.y + r.h / 2 };
    };

    fireEvent.pointerMove(canvas(), point(2, 1));
    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip.textContent).toBe('Oren (party 2)FloorIn view');
    expect(canvas().getAttribute('aria-describedby')).toBe(tooltip.id);

    // A feature or monster is also explained from its Codex entry (ETH-065).
    fireEvent.pointerMove(canvas(), point(4, 1));
    expect(screen.getByRole('tooltip').textContent).toBe(`Door (closed)FloorIn view${FEATURE_DOOR.description}`);
    fireEvent.pointerMove(canvas(), point(8, 2));
    expect(screen.getByRole('tooltip').textContent).toBe('Unexplored');

    fireEvent.click(canvas(), point(2, 1));
    expect(useUiStore.getState().selected).toBe(snap.party[1]?.id);
    // Clicking a tile with no adventurer keeps the selection.
    fireEvent.click(canvas(), point(3, 2));
    expect(useUiStore.getState().selected).toBe(snap.party[1]?.id);

    fireEvent.pointerLeave(canvas());
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('inspects tiles from the keyboard and selects with Enter', async () => {
    start();
    render(<MapArea />);
    canvas().focus();
    // The cursor starts on the followed adventurer.
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('tooltip').textContent).toBe('Mira (party 1)FloorIn view');
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('tooltip').textContent).toBe('Oren (party 2)FloorIn view');
    await userEvent.keyboard('{Enter}');
    expect(useUiStore.getState().selected).toBe(useSimStore.getState().snapshot?.party[1]?.id);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('updates the tooltip as the run moves on', async () => {
    const state = start();
    render(<MapArea />);
    canvas().focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('tooltip').textContent).toBe('Mira (party 1)FloorIn view');
    moveEntity(state, state.party[0] as number, 'd1', { x: 3, y: 2 });
    act(() => useSimStore.getState().receiveSnapshot(snapshot(state)));
    expect(screen.getByRole('tooltip').textContent).toBe('FloorIn view');
  });
});

describe('MapCanvas auto-pause marker', () => {
  /** Animation frames queued by the map, run by `frames`. */
  let queued = new Map<number, FrameRequestCallback>();
  let nextId = 1;
  let now = 0;

  beforeEach(() => {
    queued = new Map();
    now = 0;
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      queued.set(nextId, cb);
      return nextId++;
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => queued.delete(id));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete (window as Partial<Window>).matchMedia;
    useUiStore.setState({ mapFocus: null, autoPaused: null });
    useSimStore.setState({ speed: 1 });
  });

  /** Runs `n` animation frames, 100ms apart. Returns how many bracket strokes they drew. */
  function frames(n: number): number {
    const before = calls.filter((c) => c === 'stroke').length;
    for (let i = 0; i < n; i++) {
      const run = [...queued.values()];
      queued = new Map();
      now += 100;
      act(() => run.forEach((cb) => cb(now)));
    }
    return calls.filter((c) => c === 'stroke').length - before;
  }

  function setReducedMotion(reduce: boolean) {
    window.matchMedia = (query: string) =>
      ({
        matches: reduce && query.includes('reduced-motion'),
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }) as unknown as MediaQueryList;
  }

  function autoPausedOn(pos: { x: number; y: number }) {
    useSimStore.setState({ speed: 0 });
    useUiStore.setState({ mapFocus: { floor: 'd1', pos }, autoPaused: 'An adventurer gets stuck' });
  }

  it('pulses the marker every frame while auto-paused, and stops when the run resumes', () => {
    setReducedMotion(false);
    start();
    autoPausedOn({ x: 6, y: 1 });
    render(<MapArea />);
    frames(1); // the pulse starts
    // Then four bracket strokes per frame, frame after frame.
    expect(frames(3)).toBe(12);
    act(() => {
      useSimStore.setState({ speed: 1 });
      useUiStore.setState({ mapFocus: null, autoPaused: null });
    });
    frames(1);
    expect(frames(3)).toBe(0);
    expect(queued.size).toBe(0);
  });

  it('keeps the marker still under prefers-reduced-motion', () => {
    setReducedMotion(true);
    start();
    autoPausedOn({ x: 6, y: 1 });
    render(<MapArea />);
    // Drawn with its brackets, then no more frames are asked for.
    expect(calls.filter((c) => c === 'stroke').length).toBeGreaterThanOrEqual(4);
    frames(1);
    expect(frames(3)).toBe(0);
    expect(queued.size).toBe(0);
  });
});
