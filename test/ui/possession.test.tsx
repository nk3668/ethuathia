// @vitest-environment jsdom
/**
 * Possession in the UI (ETH-066): `P` possesses and releases, the movement keys only act while
 * someone is possessed, the party card and the top bar say who is possessed, and the pack offers
 * Equip while possessed.
 */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { InlineHost } from '../../src/sim';
import { bindingFor, keysFor } from '../../src/ui/input/keymap';
import type { KeyPress } from '../../src/ui/input/keymap';
import { AppShell } from '../../src/ui/shell/AppShell';
import { bindHost, useSimStore } from '../../src/ui/stores/simStore';
import { LOG_HEIGHT, useUiStore } from '../../src/ui/stores/uiStore';

// jsdom has no 2D canvas; the map then draws nothing.
HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext;

//   x 0123456789
// y 0 ##########
//   1 #@......>#
//   2 #........#
//   3 ##########
const ROOM = ['##########', '#@......>#', '#........#', '##########'];

let host: InlineHost;
let unbind: () => void;

beforeEach(() => {
  localStorage.clear();
  window.matchMedia = (query: string) =>
    ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined }) as unknown as MediaQueryList;
  useSimStore.getState().reset();
  useUiStore.setState({ logHeight: LOG_HEIGHT.default, tab: 'rules', selected: null, drawerOpen: false });
  host = new InlineHost();
  unbind = bindHost(host);
  host.start({ party: [{ name: 'Mira', classId: 'class.vanguard', raceId: 'race.human' }], depth: 2, floorText: ROOM, monsters: false }, 3);
});
afterEach(() => {
  cleanup();
  unbind();
  host.dispose();
  localStorage.clear();
  delete (window as Partial<Window>).matchMedia;
});

const key = (code: string, shiftKey = false) => act(() => void fireEvent.keyDown(window, { code, shiftKey }));
const run = (steps: number) => act(() => host.run(steps));
const mira = () => useSimStore.getState().snapshot?.party[0];
const partyPanel = () => within(screen.getByRole('region', { name: 'Party' }));

const press = (code: string, shiftKey = false): KeyPress => ({
  code,
  shiftKey,
  target: document.body,
  ctrlKey: false,
  altKey: false,
  metaKey: false,
  isComposing: false,
  defaultPrevented: false,
});

describe('possession keys', () => {
  it('binds P, and WASD, Q/E/Z/C, the arrows and the numpad only while possessed', () => {
    expect(keysFor({ type: 'togglePossession' })).toEqual(['P']);
    for (const code of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'KeyZ', 'KeyC', 'ArrowUp', 'Numpad7', 'KeyG']) {
      expect(bindingFor(press(code))).toBeUndefined();
      expect(bindingFor(press(code), undefined, true)?.action.type).toBe('act');
    }
    expect(bindingFor(press('KeyQ'), undefined, true)?.action).toEqual({ type: 'act', action: { id: 'bump', dir: { x: -1, y: -1 } } });
    expect(bindingFor(press('KeyC'), undefined, true)?.action).toEqual({ type: 'act', action: { id: 'bump', dir: { x: 1, y: 1 } } });
    expect(bindingFor(press('Period', true), undefined, true)?.action).toEqual({ type: 'act', action: { id: 'stairs', dir: 'down' } });
    expect(bindingFor(press('Comma', true), undefined, true)?.action).toEqual({ type: 'act', action: { id: 'stairs', dir: 'up' } });
    expect(bindingFor(press('Period'), undefined, true)?.action).toEqual({ type: 'act', action: { id: 'wait' } });
    // The cycle keys keep working while possessed.
    expect(bindingFor(press('BracketRight'), undefined, true)?.action).toEqual({ type: 'cycleSelection', step: 1 });
  });

  it('possesses with P, moves with the keys, shows who is possessed, and releases with P', () => {
    render(<AppShell />);
    run(1);
    const start = mira()?.pos;
    // Not possessed: D does nothing.
    key('KeyD');
    run(1);
    expect(mira()?.possessed).toBe(false);

    key('KeyP');
    run(3);
    expect(mira()).toMatchObject({ possessed: true, awaitingInput: true });
    expect(useUiStore.getState().selected).toBe(mira()?.id);
    expect(partyPanel().getByText(/Possessed/)).toBeTruthy();
    expect(partyPanel().getByText('Waiting for your command')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Mira.*possessed\. Release/ })).toBeTruthy();

    const at = mira()?.pos ?? { x: 0, y: 0 };
    key('KeyD');
    run(2);
    expect(mira()?.pos).toEqual({ x: at.x + 1, y: at.y });
    key('KeyS');
    run(2);
    expect(mira()?.pos).toEqual({ x: at.x + 1, y: at.y + 1 });
    // The run holds while it waits: more steps change nothing.
    run(5);
    expect(mira()?.pos).toEqual({ x: at.x + 1, y: at.y + 1 });
    expect(start).toBeDefined();

    key('KeyP');
    run(1);
    expect(mira()?.possessed).toBe(false);
    expect(screen.queryByRole('button', { name: /possessed\. Release/ })).toBeNull();
  });

  it('possesses with the card button, and offers Equip in the pack while possessed', () => {
    render(<AppShell />);
    run(1);
    act(() => useUiStore.getState().select(mira()?.id ?? null));
    expect(partyPanel().queryByRole('button', { name: 'Equip' })).toBeNull();
    fireEvent.click(partyPanel().getByRole('button', { name: 'Possess' }));
    run(2);
    expect(mira()?.possessed).toBe(true);
    expect(partyPanel().getByRole('button', { name: 'Release' }).getAttribute('aria-pressed')).toBe('true');
    // Show a pack with a cap worn and one carried (the hand-built floor has no items).
    const snap = structuredClone(useSimStore.getState().snapshot);
    const id = mira()?.id ?? 0;
    if (snap === null) throw new Error('no snapshot');
    const cap = { def: 'item.iron_cap', weight: 3, value: 5 };
    snap.domains.items.members[id] = {
      items: [{ ...cap, qty: 1, usable: false }],
      equipped: [{ ...cap, slot: 'head' }],
      weight: 3,
      carry: 50,
    };
    act(() => useSimStore.getState().receiveSnapshot(snap));
    fireEvent.click(partyPanel().getByRole('button', { name: 'Equip' }));
    run(2);
    const traced = useSimStore.getState().events.map((e) => e.event).filter((e) => e.type === 'ruleFired');
    // The command reached the sim as the possessed adventurer's action (the real pack is empty, so it fails).
    expect(traced.at(-1)).toMatchObject({ rule: { set: 'player' }, action: 'equip' });
    fireEvent.click(partyPanel().getByRole('button', { name: 'Release' }));
    run(1);
    expect(mira()?.possessed).toBe(false);
  });
});
