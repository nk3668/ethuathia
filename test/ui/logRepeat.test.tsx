// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { EntityId, SimEvent } from '../../src/sim';
import { LogPanel } from '../../src/ui/shell/LogPanel';
import { logLines, repeatTooltip } from '../../src/ui/shell/text';
import { useSimStore } from '../../src/ui/stores/simStore';
import { useUiStore } from '../../src/ui/stores/uiStore';

const WAIT_DETAIL = 'on the bottom floor, floor 10 of 10';

const fired = (turn: number, actor: EntityId = 1, detail = WAIT_DETAIL, index = 5): SimEvent => ({
  type: 'ruleFired',
  turn,
  actor,
  rule: { set: 'baseline', index },
  condition: 'cond.bottom_floor',
  action: 'act.wait',
  detail,
});
const waited = (turn: number, actor: EntityId = 1): SimEvent => ({ type: 'waited', turn, actor });
const door = (turn: number): SimEvent => ({ type: 'doorOpened', turn, actor: 1, door: 9, pos: { x: 2, y: 0 } });
const stuck = (turn: number): SimEvent => ({
  type: 'stuck',
  turn,
  actor: 1,
  rule: { set: 'baseline', index: 5 },
  action: 'act.wait',
  turns: 10,
  detail: 'No progress in 10 turns.',
  floor: 'f1',
  pos: { x: 1, y: 1 },
});
const names = (id: EntityId) => (id === 1 ? 'Mira' : id === 2 ? 'Bo' : `#${id}`);
const lines = (events: SimEvent[]) =>
  logLines(
    events.map((event, seq) => ({ seq, event })),
    names,
  );

describe('collapsing repeated AI decisions', () => {
  it('folds identical decisions in a row into one line with a count and turn range', () => {
    const out = lines([fired(1), waited(1), fired(2), waited(2), fired(3), fired(4)]);
    expect(out).toHaveLength(1);
    expect(out[0]?.text).toBe(`Mira: ${WAIT_DETAIL} (baseline #6)`);
    expect(out[0]?.repeat).toEqual({ count: 4, lastTurn: 4 });
    expect(repeatTooltip(out[0] as (typeof out)[0])).toBe('Repeated 4 times, turns 1 to 4.');
  });

  it('leaves a single decision without a count', () => {
    expect(lines([fired(1)])[0]?.repeat).toBeUndefined();
  });

  it('ends the run at any other line, and does not count later repeats', () => {
    const out = lines([fired(1), fired(2), door(3), fired(4), fired(5)]);
    expect(out.map((l) => [l.category, l.repeat?.count])).toEqual([
      ['ai', 2],
      ['discovery', undefined],
    ]);
  });

  it('ends the run when another adventurer gets a line', () => {
    const out = lines([fired(1, 1), fired(1, 2), fired(2, 1), fired(2, 2), fired(3, 2)]);
    expect(out.map((l) => [l.text.split(':')[0], l.repeat?.count])).toEqual([
      ['Mira', undefined],
      ['Bo', 3],
    ]);
  });

  it("is not broken by another adventurer's left-out decisions", () => {
    // Bo's first decision shows; then Mira's shows, and Bo's repeats are left out without ending Mira's run.
    const out = lines([fired(1, 2), fired(1, 1), fired(2, 2), fired(2, 1), fired(3, 2), fired(3, 1)]);
    expect(out.map((l) => [l.text.split(':')[0], l.repeat?.count])).toEqual([
      ['Bo', undefined],
      ['Mira', 3],
    ]);
  });

  it('only folds decisions with the same detail; a changed detail ends the run', () => {
    const out = lines([fired(1, 1, 'a'), fired(2, 1, 'a'), fired(3, 1, 'b'), fired(4, 1, 'a')]);
    expect(out).toHaveLength(1);
    expect(out[0]?.repeat).toEqual({ count: 2, lastTurn: 2 });
  });

  it('starts a new line after a stuck event, as before', () => {
    const out = lines([fired(1), fired(2), stuck(3), fired(4), fired(5)]);
    expect(out.map((l) => l.repeat?.count)).toEqual([2, undefined, 2]);
  });
});

function resetUi() {
  useUiStore.setState({ logFilter: 'all', mapFocus: null, autoPaused: null });
}

beforeEach(() => {
  useSimStore.getState().reset();
  resetUi();
});
afterEach(() => {
  cleanup();
  resetUi();
});

describe('repeated decisions in the log panel', () => {
  it('shows ×N with the turn range in a tooltip, and filters still work', async () => {
    const user = userEvent.setup();
    render(<LogPanel />);
    act(() => useSimStore.getState().receiveEvents([stuck(1), fired(2), waited(2), fired(3), fired(4)]));
    const log = screen.getByRole('region', { name: 'Log' });
    const items = within(log).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    const decision = items[1] as HTMLElement;
    expect(decision.textContent).toContain('×3');
    expect(decision.textContent).toContain('Repeated 3 times, turns 2 to 4.');

    // A new identical decision bumps the same line.
    act(() => useSimStore.getState().receiveEvents([fired(5)]));
    expect(within(log).getAllByRole('listitem')).toHaveLength(2);
    expect(within(log).getAllByRole('listitem')[1]?.textContent).toContain('×4');

    // Focusing the count opens its tooltip.
    const count = within(decision).getByText('×4').parentElement as HTMLElement;
    act(() => count.focus());
    expect((await screen.findByRole('tooltip')).textContent).toBe('Repeated 4 times, turns 2 to 5.');

    await user.click(within(log).getByRole('button', { name: /Highlights/ }));
    expect(within(log).getAllByRole('listitem')).toHaveLength(1);
    await user.click(within(log).getByRole('button', { name: 'All' }));
    expect(within(log).getAllByRole('listitem')[1]?.textContent).toContain('×4');
  });
});
