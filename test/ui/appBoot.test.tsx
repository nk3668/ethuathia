// @vitest-environment jsdom
/**
 * App-boot smoke test (docs/ARCHITECTURE.md §11): the whole app, started the way `main.tsx`
 * starts it but on an `InlineHost` instead of the worker, plays 300 turns without logging an
 * error, and the map and party are on screen. It catches breakage between the sim and the UI
 * that no unit test covers, such as a snapshot field the UI reads but the sim stopped sending.
 */
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InlineHost, validateGame } from '../../src/sim';
import { App } from '../../src/ui/App';
import { DEMO_RUN } from '../../src/ui/demoRun';
import { useSimStore } from '../../src/ui/stores/simStore';

/** Party turns the smoke test plays. */
const TURNS = 300;
/** Party turns between renders, so React draws the run as it goes rather than only at the end. */
const BATCH = 10;

/** Draw calls the map made. */
let draws = 0;
let errors: unknown[][] = [];

beforeEach(() => {
  draws = 0;
  errors = [];
  // jsdom has no 2D canvas: this context accepts any call and counts it.
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (target, key: string) => (key in target ? target[key] : () => void draws++),
    set: (target, key: string, value) => {
      target[key] = value;
      return true;
    },
  });
  HTMLCanvasElement.prototype.getContext = (() => ctx) as unknown as typeof HTMLCanvasElement.prototype.getContext;
  Object.defineProperty(HTMLCanvasElement.prototype, 'clientWidth', { configurable: true, get: () => 800 });
  Object.defineProperty(HTMLCanvasElement.prototype, 'clientHeight', { configurable: true, get: () => 500 });
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => void errors.push(args));
  localStorage.clear();
  useSimStore.getState().reset();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('app boot', () => {
  it(`starts, plays ${TURNS} turns on an inline host and shows the map and party with no errors`, async () => {
    // main.tsx validates content before rendering; so does this.
    validateGame();
    let host: InlineHost | undefined;
    render(<App createHost={() => (host = new InlineHost())} seed={11} />);
    if (host === undefined) throw new Error('App did not create a host');
    const started = host;

    let played = 0;
    while (played < TURNS) {
      let ran = 0;
      act(() => {
        ran = started.run(BATCH);
      });
      expect(ran, `the run stalled after ${played} turns`).toBe(BATCH);
      played += ran;
    }

    const map = screen.getByRole('application', { name: /Dungeon map/ });
    expect(map.tagName).toBe('CANVAS');
    await waitFor(() => expect(draws).toBeGreaterThan(0));

    const party = screen.getByRole('region', { name: 'Party' });
    for (const member of DEMO_RUN.party) expect(within(party).getByRole('button', { name: member.name })).toBeTruthy();
    expect(screen.getByRole('banner', { name: 'Top bar' }).textContent).toMatch(/Turn [1-9]/);
    expect(within(screen.getByRole('region', { name: 'Log' })).getAllByRole('listitem').length).toBeGreaterThan(0);

    expect(errors, `console.error was called:\n${errors.map((e) => e.map(String).join(' ')).join('\n')}`).toEqual([]);
  });
});
