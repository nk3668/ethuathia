// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { InlineHost } from '../../src/sim';
import type { SimEvent } from '../../src/sim';
import { INITIAL_PROFILE, totalFavor, useProfileStore } from '../../src/ui/stores/profileStore';
import { bindHost, EVENT_BUFFER_SIZE, useSimStore } from '../../src/ui/stores/simStore';
import { clampLogHeight, LOG_HEIGHT, UI_STORAGE_KEY, useUiStore } from '../../src/ui/stores/uiStore';

const waited = (turn: number): SimEvent => ({ type: 'waited', actor: 1, turn });
const hero = (name: string) => ({ name, classId: 'class.vanguard', raceId: 'race.human' });

beforeEach(() => {
  localStorage.clear();
  useSimStore.getState().reset();
});
afterEach(() => {
  useUiStore.setState({ logHeight: LOG_HEIGHT.default, tab: 'rules', selected: null, drawerOpen: false, mapCamera: 'follow' });
  localStorage.clear();
});

describe('simStore', () => {
  it('keeps the latest events in order, at most EVENT_BUFFER_SIZE, with unique sequence numbers', () => {
    const { receiveEvents } = useSimStore.getState();
    receiveEvents([waited(1), waited(2)]);
    receiveEvents(Array.from({ length: EVENT_BUFFER_SIZE }, (_, i) => waited(3 + i)));
    const { events, nextSeq } = useSimStore.getState();
    expect(events).toHaveLength(EVENT_BUFFER_SIZE);
    expect(nextSeq).toBe(EVENT_BUFFER_SIZE + 2);
    expect(events[0]?.event.turn).toBe(3);
    expect(events.at(-1)?.event.turn).toBe(EVENT_BUFFER_SIZE + 2);
    expect(events.map((e) => e.seq)).toEqual(Array.from({ length: EVENT_BUFFER_SIZE }, (_, i) => i + 2));
  });

  it('numbers events past the buffer size correctly when one batch overflows it', () => {
    useSimStore.getState().receiveEvents(Array.from({ length: EVENT_BUFFER_SIZE + 5 }, (_, i) => waited(i)));
    const { events } = useSimStore.getState();
    expect(events[0]).toEqual({ seq: 5, event: waited(5) });
  });

  it('is fed by a host until unbound', () => {
    const host = new InlineHost();
    const unbind = bindHost(host);
    host.start({ party: [hero('Mira')] }, 7);
    expect(useSimStore.getState().snapshot?.turn).toBe(0);
    expect(useSimStore.getState().snapshot?.party[0]?.name).toBe('Mira');

    host.run(5);
    const { snapshot, events } = useSimStore.getState();
    expect(snapshot?.turn).toBeGreaterThan(0);
    expect(events.length).toBeGreaterThan(0);

    unbind();
    const before = useSimStore.getState().snapshot;
    host.run(5);
    expect(useSimStore.getState().snapshot).toBe(before);
    host.dispose();
  });
});

describe('profileStore', () => {
  it('starts with zero currencies and sums Favor across deities', () => {
    expect(useProfileStore.getState()).toEqual(INITIAL_PROFILE);
    expect(totalFavor({})).toBe(0);
    expect(totalFavor({ 'deity.a': 3, 'deity.b': 4 })).toBe(7);
  });
});

describe('uiStore', () => {
  it('clamps the log height to its range', () => {
    expect(clampLogHeight(10)).toBe(LOG_HEIGHT.min);
    expect(clampLogHeight(10_000)).toBe(LOG_HEIGHT.max);
    expect(clampLogHeight(Number.NaN)).toBe(LOG_HEIGHT.default);
    expect(clampLogHeight(200.4)).toBe(200);
  });

  it('remembers the log height, open tab and map camera in localStorage, but not the selection', () => {
    useUiStore.getState().setLogHeight(240);
    useUiStore.getState().openTab('codex');
    useUiStore.getState().setMapCamera('fit');
    useUiStore.getState().select(3);
    const saved = JSON.parse(localStorage.getItem(UI_STORAGE_KEY) ?? 'null') as { state: unknown };
    expect(saved.state).toEqual({ logHeight: 240, tab: 'codex', mapCamera: 'fit' });
  });

  it('restores remembered values and ignores invalid ones', async () => {
    localStorage.setItem(
      UI_STORAGE_KEY,
      JSON.stringify({ version: 1, state: { logHeight: 300, tab: 'codex', mapCamera: 'fit' } }),
    );
    await useUiStore.persist.rehydrate();
    expect(useUiStore.getState()).toMatchObject({ logHeight: 300, tab: 'codex', mapCamera: 'fit' });

    localStorage.setItem(
      UI_STORAGE_KEY,
      JSON.stringify({ version: 1, state: { logHeight: 'tall', tab: 'nope', mapCamera: 'zoom' } }),
    );
    useUiStore.setState({ logHeight: LOG_HEIGHT.default, tab: 'rules', mapCamera: 'follow' });
    await useUiStore.persist.rehydrate();
    expect(useUiStore.getState()).toMatchObject({ logHeight: LOG_HEIGHT.default, tab: 'rules', mapCamera: 'follow' });

    localStorage.setItem(UI_STORAGE_KEY, JSON.stringify({ version: 1, state: { logHeight: 99_999 } }));
    await useUiStore.persist.rehydrate();
    expect(useUiStore.getState().logHeight).toBe(LOG_HEIGHT.max);
  });
});
