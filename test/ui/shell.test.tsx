// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { InlineHost } from '../../src/sim';
import type { EntityId, SimEvent, Snapshot } from '../../src/sim';
import { App } from '../../src/ui/App';
import { AppShell } from '../../src/ui/shell/AppShell';
import { LOG_RESIZE_STEP } from '../../src/ui/shell/LogResizer';
import { contentName, describe as describeEvent, logLines, ruleLabel } from '../../src/ui/shell/text';
import { useSimStore } from '../../src/ui/stores/simStore';
import { LOG_HEIGHT, UI_STORAGE_KEY, useUiStore } from '../../src/ui/stores/uiStore';
import { fixtureDomains } from './fixtures';

/** Makes `matchMedia` report `narrow` for every query, as a window under 1000px would. */
function setNarrow(narrow: boolean) {
  window.matchMedia = (query: string) =>
    ({
      matches: narrow,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }) as unknown as MediaQueryList;
}

const member = (id: EntityId, name: string, hp: number): Snapshot['party'][number] => ({
  id,
  name,
  classId: 'class.vanguard',
  raceId: 'race.human',
  floor: 'f1',
  pos: { x: 1, y: 1 },
  alive: hp > 0,
  hp,
  maxHp: 20,
  mp: 3,
  maxMp: 5,
  intent: { rule: { set: 'baseline', index: 2 }, action: 'explore', detail: 'Explore: heading for unexplored ground' },
});

const SNAPSHOT: Snapshot = {
  turn: 4812,
  seed: 1,
  floor: {
    id: 'f1',
    depth: 3,
    width: 1,
    height: 1,
    terrain: new Uint8Array(1),
    visible: new Uint8Array(1),
    features: [],
    actors: [],
    explored: { seen: 1, total: 1, fraction: 1 },
  },
  party: [member(1, 'Mira', 12), member(2, 'Oren', 0)],
  domains: fixtureDomains(),
};

const fired = (turn: number, actor: EntityId, index: number, detail: string): SimEvent => ({
  type: 'ruleFired',
  turn,
  actor,
  rule: { set: 'baseline', index },
  condition: 'always',
  action: index === 2 ? 'explore' : 'backOff',
  detail,
});

// jsdom has no 2D canvas; the map then draws nothing (test/ui/mapCanvas.test.tsx covers it).
HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext;

beforeEach(() => {
  localStorage.clear();
  setNarrow(false);
  useSimStore.getState().reset();
  useUiStore.setState({ logHeight: LOG_HEIGHT.default, tab: 'rules', selected: null, drawerOpen: false });
});
afterEach(() => {
  cleanup();
  localStorage.clear();
  delete (window as Partial<Window>).matchMedia;
});

describe('log text', () => {
  const names = (id: EntityId) => (id === 1 ? 'Mira' : `#${id}`);

  it('names content ids from their defs, unknown ones from the id, and rules', () => {
    expect(contentName('class.vanguard')).toBe('Vanguard');
    expect(contentName('feature.stairs_up')).toBe('Stairs up');
    expect(contentName('class.ironclad')).toBe('Ironclad');
    expect(contentName('race.wood_elf')).toBe('Wood elf');
    expect(ruleLabel({ set: 'own', index: 0 })).toBe('rule #1');
    expect(ruleLabel({ set: 'baseline', index: 2 })).toBe('baseline #3');
  });

  it('leaves out moves and waits, and AI decisions that continue the same goal', () => {
    const events: SimEvent[] = [
      fired(1, 1, 2, 'Explore: 6 turns away'),
      { type: 'moved', turn: 1, actor: 1, from: { x: 0, y: 0 }, to: { x: 1, y: 0 } },
      fired(2, 1, 2, 'Explore: 5 turns away'),
      { type: 'waited', turn: 2, actor: 2 },
      { type: 'doorOpened', turn: 3, actor: 1, door: 9, pos: { x: 2, y: 0 } },
      fired(4, 1, 3, 'Back off'),
      fired(5, 1, 2, 'Explore: 3 turns away'),
    ];
    const lines = logLines(
      events.map((event, seq) => ({ seq, event })),
      names,
    );
    expect(lines.map((l) => [l.seq, l.category, l.text])).toEqual([
      [0, 'ai', 'Mira: Explore: 6 turns away (baseline #3)'],
      [4, 'discovery', 'Mira opens a door.'],
      [5, 'ai', 'Mira: Back off (baseline #4)'],
      [6, 'ai', 'Mira: Explore: 3 turns away (baseline #3)'],
    ]);
  });

  it('describes failures and rejected commands', () => {
    expect(describeEvent({ type: 'actionFailed', turn: 1, actor: 1, action: 'move', reason: 'Blocked' }, names)).toEqual({
      category: 'system',
      text: "Mira can't move (Blocked)",
    });
    expect(describeEvent({ type: 'commandRejected', turn: 1, command: 'zap', reason: 'Unknown command' }, names).text).toBe(
      'Command "zap" ignored (Unknown command)',
    );
  });
});

describe('AppShell at desktop width', () => {
  it('has the five regions of the mock-up', () => {
    useSimStore.getState().receiveSnapshot(SNAPSHOT);
    const { container } = render(<AppShell />);
    expect(container.firstElementChild?.getAttribute('data-layout')).toBe('wide');
    expect(screen.getByRole('banner', { name: 'Top bar' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Party' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Dungeon map' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Side panel' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Log' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Panels/ })).toBeNull();
    expect(screen.getByRole('group', { name: 'Sim speed' })).toBeTruthy();
    const map = within(screen.getByRole('region', { name: 'Dungeon map' }));
    expect(map.getByRole('application', { name: /Dungeon map, floor 3/ })).toBeTruthy();
    expect(map.getByRole('group', { name: 'Map camera' })).toBeTruthy();
  });

  it('shows currencies with names and run position in the top bar', () => {
    useSimStore.getState().receiveSnapshot(SNAPSHOT);
    render(<AppShell />);
    const bar = screen.getByRole('banner', { name: 'Top bar' });
    expect(within(bar).getByRole('list', { name: 'Currencies' }).textContent).toBe('♛Renown0☠Trophies0♨Favor0');
    expect(bar.textContent).toContain('Floor 3 · Turn 4,812');
  });

  it('shows full party cards with HP, MP and intent', () => {
    useSimStore.getState().receiveSnapshot(SNAPSHOT);
    render(<AppShell />);
    const party = screen.getByRole('region', { name: 'Party' });
    expect(within(party).getByRole('meter', { name: "Mira's HP" }).getAttribute('aria-valuenow')).toBe('12');
    expect(within(party).getByRole('meter', { name: "Mira's MP" })).toBeTruthy();
    expect(party.textContent).toContain('Human Vanguard');
    expect(party.textContent).toContain('Explore: heading for unexplored ground · baseline #3');
    expect(party.textContent).toContain('✝ Dead');
  });

  it('selects an adventurer from their card', async () => {
    const user = userEvent.setup();
    useSimStore.getState().receiveSnapshot(SNAPSHOT);
    render(<AppShell />);
    const mira = screen.getByRole('button', { name: 'Mira' });
    expect(mira.getAttribute('aria-pressed')).toBe('false');
    await user.click(mira);
    expect(mira.getAttribute('aria-pressed')).toBe('true');
    expect(useUiStore.getState().selected).toBe(1);
    await user.click(mira);
    expect(useUiStore.getState().selected).toBeNull();
  });

  it('switches between empty tab panels and remembers the open tab', async () => {
    const user = userEvent.setup();
    render(<AppShell />);
    const tabs = within(screen.getByRole('region', { name: 'Side panel' }));
    expect(tabs.getAllByRole('tab').map((t) => t.textContent)).toEqual([
      'Rules',
      'Town',
      'Codex',
      'Graveyard',
      'Stats',
      'Options',
    ]);
    expect(tabs.getByRole('tabpanel', { name: 'Rules' }).textContent).toContain('Behavior rules');
    await user.click(tabs.getByRole('tab', { name: 'Town' }));
    expect(tabs.getByRole('tabpanel', { name: 'Town' }).textContent).toContain('Town opens');
    expect(useUiStore.getState().tab).toBe('town');
  });

  it('lists events from simStore in the log as plain text', () => {
    useSimStore.getState().receiveSnapshot(SNAPSHOT);
    render(<AppShell />);
    const log = screen.getByRole('region', { name: 'Log' });
    expect(log.textContent).toContain('Nothing has happened yet.');
    act(() => {
      useSimStore.getState().receiveEvents([
        fired(7, 1, 2, 'Explore: heading for unexplored ground'),
        { type: 'doorOpened', turn: 8, actor: 1, door: 9, pos: { x: 2, y: 0 } },
      ]);
    });
    const items = within(log).getAllByRole('listitem');
    expect(items.map((li) => li.textContent)).toEqual([
      'Turn 7➤Mira: Explore: heading for unexplored ground (baseline #3)',
      'Turn 8✦Mira opens a door.',
    ]);
    expect(items[0]?.getAttribute('data-category')).toBe('ai');
  });

  it('resizes the log from the keyboard, within its range, and remembers the height', async () => {
    const user = userEvent.setup();
    const { container } = render(<AppShell />);
    const handle = screen.getByRole('separator', { name: 'Log height' });
    const shell = container.firstElementChild as HTMLElement;
    expect(shell.style.getPropertyValue('--log-height')).toBe(`${LOG_HEIGHT.default}px`);

    handle.focus();
    await user.keyboard('{ArrowUp}{ArrowUp}');
    const taller = LOG_HEIGHT.default + 2 * LOG_RESIZE_STEP;
    expect(useUiStore.getState().logHeight).toBe(taller);
    expect(shell.style.getPropertyValue('--log-height')).toBe(`${taller}px`);
    expect(handle.getAttribute('aria-valuenow')).toBe(String(taller));
    expect(localStorage.getItem(UI_STORAGE_KEY)).toContain(`"logHeight":${taller}`);

    await user.keyboard('{End}');
    expect(useUiStore.getState().logHeight).toBe(LOG_HEIGHT.min);
    await user.keyboard('{Home}');
    // Never taller than 60% of the window (jsdom's is 768px high).
    expect(useUiStore.getState().logHeight).toBe(Math.floor(window.innerHeight * 0.6));
  });

  it('resizes the log by dragging its top edge', () => {
    render(<AppShell />);
    const handle = screen.getByRole('separator', { name: 'Log height' });
    // jsdom has no pointer capture.
    handle.setPointerCapture = () => undefined;
    fireEvent.pointerDown(handle, { button: 0, clientY: 500, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientY: 440, pointerId: 1 });
    expect(useUiStore.getState().logHeight).toBe(LOG_HEIGHT.default + 60);
    fireEvent.pointerUp(handle, { pointerId: 1 });
    fireEvent.pointerMove(handle, { clientY: 300, pointerId: 1 });
    expect(useUiStore.getState().logHeight).toBe(LOG_HEIGHT.default + 60);
  });
});

describe('AppShell under 1000px wide', () => {
  beforeEach(() => setNarrow(true));

  it('shows compact one-line party cards', () => {
    useSimStore.getState().receiveSnapshot(SNAPSHOT);
    const { container } = render(<AppShell />);
    expect(container.firstElementChild?.getAttribute('data-layout')).toBe('narrow');
    const party = screen.getByRole('region', { name: 'Party' });
    const hp = within(party).getByRole('meter', { name: "Mira's HP" });
    expect(hp.textContent).not.toContain('/');
    expect(within(party).queryByRole('meter', { name: "Mira's MP" })).toBeNull();
    expect(party.textContent).not.toContain('Explore');
    expect(party.textContent).not.toContain('Human');
  });

  it('moves the tab panel into a drawer opened from the top bar', async () => {
    const user = userEvent.setup();
    render(<AppShell />);
    expect(screen.queryByRole('region', { name: 'Side panel' })).toBeNull();
    const open = screen.getByRole('button', { name: /Panels/ });
    expect(open.getAttribute('aria-expanded')).toBe('false');

    await user.click(open);
    const drawer = screen.getByRole('dialog', { name: 'Side panel' });
    expect(open.getAttribute('aria-expanded')).toBe('true');
    expect(open.getAttribute('aria-controls')).toBe(drawer.id);
    expect(document.activeElement).toBe(within(drawer).getByRole('button', { name: /Close/ }));
    expect(screen.getByRole('main', { hidden: true }).hasAttribute('inert')).toBe(true);

    await user.click(within(drawer).getByRole('tab', { name: 'Codex' }));
    expect(within(drawer).getByRole('tabpanel', { name: 'Codex' })).toBeTruthy();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(open);
    expect(screen.getByRole('main').hasAttribute('inert')).toBe(false);
  });

  it('closes the drawer from its close button', async () => {
    const user = userEvent.setup();
    render(<AppShell />);
    await user.click(screen.getByRole('button', { name: /Panels/ }));
    await user.click(screen.getByRole('button', { name: /Close/ }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('App', () => {
  it('starts a run on the host it is given and shows it', () => {
    let host: InlineHost | undefined;
    const createHost = () => (host = new InlineHost());
    render(<App createHost={createHost} seed={5} />);
    if (!host) throw new Error('no host');
    expect(host.speed).toBe(1);

    const party = screen.getByRole('region', { name: 'Party' });
    expect(within(party).getByRole('button', { name: 'Mira' })).toBeTruthy();
    expect(within(party).getByRole('button', { name: 'Oren' })).toBeTruthy();

    const started = host;
    act(() => {
      started.run(10);
    });
    expect(screen.getByRole('banner', { name: 'Top bar' }).textContent).toMatch(/Floor 1 · Turn [1-9]/);
    expect(within(screen.getByRole('region', { name: 'Log' })).getAllByRole('listitem').length).toBeGreaterThan(0);
  });
});
