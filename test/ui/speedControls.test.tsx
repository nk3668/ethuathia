// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { InlineHost, SPEEDS } from '../../src/sim';
import type { Snapshot, Unsubscribe } from '../../src/sim';
import { DEMO_RUN } from '../../src/ui/demoRun';
import { bindingFor, KEYMAP, keysFor } from '../../src/ui/input/keymap';
import type { KeyPress } from '../../src/ui/input/keymap';
import { AppShell } from '../../src/ui/shell/AppShell';
import { bindHost, DEFAULT_SPEED, useSimStore } from '../../src/ui/stores/simStore';
import { LOG_HEIGHT, useUiStore } from '../../src/ui/stores/uiStore';

// jsdom has no 2D canvas; the map then draws nothing.
HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext;

let host: InlineHost;
let unbind: Unsubscribe;

beforeEach(() => {
  localStorage.clear();
  window.matchMedia = (query: string) =>
    ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined }) as unknown as MediaQueryList;
  useSimStore.getState().reset();
  useSimStore.setState({ speed: DEFAULT_SPEED, resumeSpeed: DEFAULT_SPEED });
  useUiStore.setState({ logHeight: LOG_HEIGHT.default, tab: 'rules', selected: null, drawerOpen: false });
  host = new InlineHost();
  unbind = bindHost(host);
  host.start(DEMO_RUN, 7);
});
afterEach(() => {
  cleanup();
  unbind();
  host.dispose();
  localStorage.clear();
  delete (window as Partial<Window>).matchMedia;
});

const speedGroup = () => within(screen.getByRole('group', { name: 'Sim speed' }));
const pressed = () =>
  speedGroup()
    .getAllByRole('button')
    .filter((b) => b.getAttribute('aria-pressed') === 'true')
    .map((b) => b.textContent);

const press = (overrides: Partial<KeyPress>): KeyPress => ({
  code: 'Space',
  target: document.body,
  ctrlKey: false,
  altKey: false,
  metaKey: false,
  isComposing: false,
  defaultPrevented: false,
  ...overrides,
});

describe('keymap', () => {
  it('is one table with each key bound once, covering pause and every running speed', () => {
    const codes = KEYMAP.map((b) => b.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(keysFor({ type: 'togglePause' })).toEqual(['Space']);
    const running = SPEEDS.filter((s) => s !== 0);
    expect(running.map((speed) => keysFor({ type: 'setSpeed', speed }))).toEqual([['1'], ['2'], ['3'], ['4'], ['5']]);
  });

  it('finds the binding for a key press, but not with a modifier held or once another handler took it', () => {
    expect(bindingFor(press({ code: 'Digit3' }))?.action).toEqual({ type: 'setSpeed', speed: 4 });
    expect(bindingFor(press({ code: 'KeyQ' }))).toBeUndefined();
    expect(bindingFor(press({ code: 'Numpad1' }))).toBeUndefined();
    expect(bindingFor(press({ code: 'Digit1', ctrlKey: true }))).toBeUndefined();
    expect(bindingFor(press({ code: 'Digit1', altKey: true }))).toBeUndefined();
    expect(bindingFor(press({ code: 'Digit1', metaKey: true }))).toBeUndefined();
    expect(bindingFor(press({ code: 'Space', defaultPrevented: true }))).toBeUndefined();
    expect(bindingFor(press({ code: 'Space', isComposing: true }))).toBeUndefined();
  });

  it('ignores keys typed into text fields, and Space on controls that Space toggles', () => {
    const text = document.createElement('input');
    const search = Object.assign(document.createElement('input'), { type: 'search' });
    const area = document.createElement('textarea');
    const select = document.createElement('select');
    const editable = document.createElement('div');
    editable.contentEditable = 'true';
    // jsdom does not implement isContentEditable.
    Object.defineProperty(editable, 'isContentEditable', { value: true });
    for (const target of [text, search, area, select, editable]) {
      expect(bindingFor(press({ code: 'Space', target }))).toBeUndefined();
      expect(bindingFor(press({ code: 'Digit2', target }))).toBeUndefined();
    }

    const checkbox = Object.assign(document.createElement('input'), { type: 'checkbox' });
    const toggle = document.createElement('div');
    toggle.setAttribute('role', 'switch');
    for (const target of [checkbox, toggle]) {
      expect(bindingFor(press({ code: 'Space', target }))).toBeUndefined();
      expect(bindingFor(press({ code: 'Digit2', target }))).toBeDefined();
    }
    expect(bindingFor(press({ code: 'Space', target: document.createElement('button') }))).toBeDefined();
  });
});

describe('simStore speed', () => {
  it('sends speeds to the bound host and stops when unbound', () => {
    const { setSpeed } = useSimStore.getState();
    setSpeed(8);
    expect(host.speed).toBe(8);
    expect(useSimStore.getState()).toMatchObject({ speed: 8, resumeSpeed: 8 });
    setSpeed(0);
    expect(host.speed).toBe(0);
    expect(useSimStore.getState()).toMatchObject({ speed: 0, resumeSpeed: 8 });

    unbind();
    setSpeed(2);
    expect(host.speed).toBe(0);
    unbind = () => undefined;
  });

  it('toggles pause back to the last running speed, and records a pause the host made itself', () => {
    const store = useSimStore.getState();
    store.setSpeed('max');
    store.togglePause();
    expect(host.speed).toBe(0);
    store.togglePause();
    expect(host.speed).toBe('max');
    store.hostPaused();
    expect(useSimStore.getState().speed).toBe(0);
    expect(host.speed).toBe('max');
  });
});

describe('speed control', () => {
  it('has pause, 1×, 2×, 4×, 8× and max, with the active one pressed', async () => {
    const user = userEvent.setup();
    render(<AppShell />);
    expect(
      speedGroup()
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Pause', '1×', '2×', '4×', '8×', 'Max']);
    expect(pressed()).toEqual(['1×']);

    for (const [label, speed] of [
      ['4×', 4],
      ['2×', 2],
      ['8×', 8],
      ['Max', 'max'],
      ['1×', 1],
    ] as const) {
      await user.click(speedGroup().getByRole('button', { name: label }));
      expect(host.speed).toBe(speed);
      expect(pressed()).toEqual([label]);
    }
  });

  it('pauses, and resumes at the last speed when Pause is pressed again', async () => {
    const user = userEvent.setup();
    render(<AppShell />);
    await user.click(speedGroup().getByRole('button', { name: '4×' }));
    const pause = speedGroup().getByRole('button', { name: 'Pause' });
    await user.click(pause);
    expect(host.speed).toBe(0);
    expect(pressed()).toEqual(['Pause']);
    await user.click(pause);
    expect(host.speed).toBe(4);
    expect(pressed()).toEqual(['4×']);
  });

  it('names each button’s key in aria-keyshortcuts and its tooltip', async () => {
    const user = userEvent.setup();
    render(<AppShell />);
    expect(speedGroup().getByRole('button', { name: 'Pause' }).getAttribute('aria-keyshortcuts')).toBe('Space');
    const max = speedGroup().getByRole('button', { name: 'Max' });
    expect(max.getAttribute('aria-keyshortcuts')).toBe('5');
    await user.click(max);
    expect((await screen.findByRole('tooltip')).textContent).toMatch(/Key: 5/);
  });

  it('updates the floor and turn counters from each snapshot', () => {
    render(<AppShell />);
    const bar = screen.getByRole('banner', { name: 'Top bar' });
    expect(bar.textContent).toContain('Floor 1 · Turn 0');
    act(() => {
      host.run(12);
    });
    const turn = useSimStore.getState().snapshot?.turn ?? 0;
    expect(turn).toBeGreaterThan(0);
    expect(bar.textContent).toContain(`Floor 1 · Turn ${turn.toLocaleString('en-US')}`);
    const next: Snapshot = { ...(useSimStore.getState().snapshot as Snapshot), turn: 12_345 };
    act(() => useSimStore.getState().receiveSnapshot({ ...next, floor: { ...next.floor, depth: 4 } }));
    expect(bar.textContent).toContain('Floor 4 · Turn 12,345');
  });
});

describe('keyboard shortcuts', () => {
  it('toggles pause with Space and picks speeds with 1–5', async () => {
    const user = userEvent.setup();
    render(<AppShell />);
    await user.keyboard(' ');
    expect(host.speed).toBe(0);
    expect(pressed()).toEqual(['Pause']);
    await user.keyboard(' ');
    expect(host.speed).toBe(1);
    for (const [key, speed] of [
      ['3', 4],
      ['5', 'max'],
      ['2', 2],
      ['4', 8],
      ['1', 1],
    ] as const) {
      await user.keyboard(key);
      expect(host.speed).toBe(speed);
    }
  });

  it('acts once when a key is held down', () => {
    render(<AppShell />);
    fireEvent.keyDown(window, { code: 'Space', key: ' ' });
    fireEvent.keyDown(window, { code: 'Space', key: ' ', repeat: true });
    fireEvent.keyDown(window, { code: 'Space', key: ' ', repeat: true });
    fireEvent.keyUp(window, { code: 'Space', key: ' ' });
    expect(host.speed).toBe(0);
  });

  it('pauses with Space on a focused button instead of pressing it', async () => {
    const user = userEvent.setup();
    render(<AppShell />);
    const mira = within(screen.getByRole('region', { name: 'Party' })).getAllByRole('button')[0];
    if (!mira) throw new Error('no party card');
    mira.focus();
    await user.keyboard(' ');
    expect(host.speed).toBe(0);
    expect(useUiStore.getState().selected).toBeNull();
    // Enter still presses it.
    await user.keyboard('{Enter}');
    expect(useUiStore.getState().selected).not.toBeNull();
  });

  it('leaves keys alone while typing in an input', async () => {
    const user = userEvent.setup();
    render(
      <>
        <AppShell />
        <input aria-label="Notes" />
      </>,
    );
    const notes = screen.getByRole('textbox', { name: 'Notes' });
    await user.type(notes, '4 2');
    expect((notes as HTMLInputElement).value).toBe('4 2');
    expect(host.speed).toBe(1);
  });

  it('leaves keys alone that the map already handled, and stops listening when unmounted', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<AppShell />);
    const map = within(screen.getByRole('region', { name: 'Dungeon map' })).getByRole('application');
    map.focus();
    await user.keyboard('{ArrowRight}{Escape}{Enter}');
    expect(host.speed).toBe(1);
    await user.keyboard('2');
    expect(host.speed).toBe(2);
    unmount();
    fireEvent.keyDown(window, { code: 'Digit4', key: '4' });
    expect(host.speed).toBe(2);
  });
});
