// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { EntityId, Snapshot } from '../../src/sim';
import { bindingFor, KEYMAP, keysFor } from '../../src/ui/input/keymap';
import { AppShell } from '../../src/ui/shell/AppShell';
import { useSimStore } from '../../src/ui/stores/simStore';
import { cycleSelection, LOG_HEIGHT, useUiStore } from '../../src/ui/stores/uiStore';
import { fixtureDomains } from './fixtures';

// jsdom has no 2D canvas; the map then draws nothing.
HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext;

const member = (id: EntityId, name: string, alive: boolean): Snapshot['party'][number] => ({
  id,
  name,
  classId: 'class.vanguard',
  raceId: 'race.human',
  floor: 'f1',
  pos: { x: id, y: 0 },
  alive,
  hp: alive ? 10 : 0,
  maxHp: 10,
  mp: 0,
  maxMp: 0,
  intent: null,
  possessed: false,
  awaitingInput: false,
});

function snapshotWith(party: Snapshot['party']): Snapshot {
  return {
    turn: 1,
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
    party,
    domains: fixtureDomains(),
  };
}

/** Mira, Oren (dead), Tamsin, Wren. */
const PARTY = [member(1, 'Mira', true), member(2, 'Oren', false), member(3, 'Tamsin', true), member(4, 'Wren', true)];

beforeEach(() => {
  localStorage.clear();
  window.matchMedia = (query: string) =>
    ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined }) as unknown as MediaQueryList;
  useSimStore.getState().reset();
  useUiStore.setState({ logHeight: LOG_HEIGHT.default, tab: 'rules', selected: null, drawerOpen: false });
});
afterEach(() => {
  cleanup();
  localStorage.clear();
  delete (window as Partial<Window>).matchMedia;
});

const selected = () => useUiStore.getState().selected;
const key = (code: string) => act(() => void fireEvent.keyDown(window, { code }));
const partyPanel = () => within(screen.getByRole('region', { name: 'Party' }));

describe('cycleSelection', () => {
  it('steps through living members in party order, wrapping and skipping the dead', () => {
    expect(cycleSelection(PARTY, 1, 1)).toBe(3);
    expect(cycleSelection(PARTY, 3, 1)).toBe(4);
    expect(cycleSelection(PARTY, 4, 1)).toBe(1);
    expect(cycleSelection(PARTY, 1, -1)).toBe(4);
    expect(cycleSelection(PARTY, 3, -1)).toBe(1);
  });

  it('starts at an end with nothing selected, or when the selection left the party', () => {
    expect(cycleSelection(PARTY, null, 1)).toBe(1);
    expect(cycleSelection(PARTY, null, -1)).toBe(4);
    expect(cycleSelection(PARTY, 99, 1)).toBe(1);
  });

  it('moves off a dead selection', () => {
    expect(cycleSelection(PARTY, 2, 1)).toBe(3);
    expect(cycleSelection(PARTY, 2, -1)).toBe(1);
  });

  it('keeps the selection when nobody is alive, and the only living member stays selected', () => {
    expect(cycleSelection([], null, 1)).toBeNull();
    expect(cycleSelection([member(1, 'Mira', false)], 1, 1)).toBe(1);
    expect(cycleSelection([member(1, 'Mira', false), member(2, 'Oren', true)], 2, 1)).toBe(2);
  });
});

describe('cycle keys', () => {
  it('binds ] to next and [ to previous, and leaves Tab to focus navigation', () => {
    expect(keysFor({ type: 'cycleSelection', step: 1 })).toEqual([']']);
    expect(keysFor({ type: 'cycleSelection', step: -1 })).toEqual(['[']);
    expect(KEYMAP.some((b) => b.code === 'Tab')).toBe(false);
  });

  it('selects the next and previous living adventurer with ] and [', () => {
    useSimStore.getState().receiveSnapshot(snapshotWith(PARTY));
    render(<AppShell />);
    key('BracketRight');
    expect(selected()).toBe(1);
    key('BracketRight');
    expect(selected()).toBe(3);
    key('BracketRight');
    key('BracketRight');
    expect(selected()).toBe(1);
    key('BracketLeft');
    expect(selected()).toBe(4);
    // The party card follows the selection.
    expect(partyPanel().getByRole('button', { name: /Wren/ }).getAttribute('aria-pressed')).toBe('true');
    expect(partyPanel().getByRole('button', { name: /Mira/ }).getAttribute('aria-pressed')).toBe('false');
  });

  it('does nothing with an empty party, and shows no cycle buttons', () => {
    useSimStore.getState().receiveSnapshot(snapshotWith([]));
    render(<AppShell />);
    key('BracketRight');
    key('BracketLeft');
    expect(selected()).toBeNull();
    expect(screen.queryByRole('group', { name: 'Cycle adventurers' })).toBeNull();
  });

  it('does nothing before the first snapshot', () => {
    render(<AppShell />);
    key('BracketRight');
    expect(selected()).toBeNull();
  });

  it('ignores the keys while typing in a text field', () => {
    const field = document.createElement('input');
    expect(bindingFor({ code: 'BracketRight', target: field, ctrlKey: false, altKey: false, metaKey: false, isComposing: false, defaultPrevented: false })).toBeUndefined();
  });

  it('has buttons that cycle too, naming their key in aria-keyshortcuts and the tooltip', async () => {
    useSimStore.getState().receiveSnapshot(snapshotWith(PARTY));
    render(<AppShell />);
    const group = within(screen.getByRole('group', { name: 'Cycle adventurers' }));
    const next = group.getByRole('button', { name: 'Next adventurer' });
    const previous = group.getByRole('button', { name: 'Previous adventurer' });
    expect(next.getAttribute('aria-keyshortcuts')).toBe(']');
    expect(previous.getAttribute('aria-keyshortcuts')).toBe('[');

    const user = userEvent.setup();
    await user.click(next);
    expect(selected()).toBe(1);
    await user.click(previous);
    expect(selected()).toBe(4);

    act(() => previous.focus());
    expect((await screen.findByRole('tooltip')).textContent).toContain('Key: [');
  });

  it('keeps Tab for moving focus', async () => {
    useSimStore.getState().receiveSnapshot(snapshotWith(PARTY));
    render(<AppShell />);
    const user = userEvent.setup();
    const previous = screen.getByRole('button', { name: 'Previous adventurer' });
    act(() => previous.focus());
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Next adventurer' }));
    expect(selected()).toBeNull();
  });
});
