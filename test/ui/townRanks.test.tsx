// @vitest-environment jsdom
/** The Town tree with ranked nodes and a closed building tier (ETH-172), on test-only content. */
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { defineBuilding, defineUpgrade } from '../../src/content';
import { newProfile } from '../../src/meta';
import { resetProfileStore, useProfileStore } from '../../src/ui/stores/profileStore';
import { useRunStore } from '../../src/ui/stores/runStore';
import { TownPanel } from '../../src/ui/town/TownPanel';

const B = 'building.ui_ranks';
defineBuilding({
  id: B,
  name: 'Rank Hall',
  description: 'Test.',
  tags: [],
  kind: 'foundations',
  tierGates: [{ fromTier: 2, unlock: { kind: 'reachDepth', depth: 5 } }],
});
const node = (id: string, name: string, tier: number, fields: object = {}) =>
  defineUpgrade({
    id: `upgrade.${id}`,
    name,
    description: 'A test node.',
    tags: [],
    building: B,
    tier,
    column: 0,
    cost: { renown: 100 },
    requires: [],
    grants: [{ kind: 'capacity', key: 'partySize', amount: 1 }],
    ...fields,
  });
node('ui_hardy', 'Hardy Test', 1, { ranks: { max: 5, costGrowth: 1.5 } });
node('ui_deep', 'Deep Test', 2, { requires: ['upgrade.ui_hardy'] });

function setProfile(renown: number, owned: string[], ranks: Record<string, number> = {}) {
  const p = newProfile();
  useProfileStore.setState({ profile: { ...p, currencies: { ...p.currencies, renown }, upgrades: { owned, ranks } } });
}

const nodeButton = (name: string): HTMLElement =>
  within(screen.getByRole('list', { name: 'Upgrades' })).getByRole('button', { name: new RegExp(`^${name}\\b`) });

async function openTab(user: ReturnType<typeof userEvent.setup>) {
  render(<TownPanel />);
  await user.click(screen.getByRole('tab', { name: 'Rank Hall' }));
}

beforeEach(() => {
  resetProfileStore();
  useRunStore.getState().openPrepare();
});
afterEach(() => {
  cleanup();
  resetProfileStore();
});

describe('ranked nodes in the Town tree', () => {
  it('shows the rank on the node and the next rank price', async () => {
    const user = userEvent.setup();
    setProfile(1000, ['upgrade.ui_hardy'], { 'upgrade.ui_hardy': 2 });
    await openTab(user);
    const button = nodeButton('Hardy Test');
    expect(button.textContent).toContain('2/5');
    expect(button.textContent).toContain('230'); // rank 3
    expect(button.textContent).toContain('Available');
  });

  it('shows Roman numerals, the current effect, the next rank and every rank cost in the tooltip, with the help text', async () => {
    const user = userEvent.setup();
    setProfile(1000, ['upgrade.ui_hardy'], { 'upgrade.ui_hardy': 2 });
    await openTab(user);
    await act(async () => nodeButton('Hardy Test').focus());
    const tip = (await screen.findByRole('tooltip')).textContent ?? '';
    expect(tip).toContain('Hardy Test II');
    expect(tip).toContain('Party size +2'); // now
    expect(tip).toContain('III: Party size +3 for 230 Renown'); // next
    expect(tip).toContain('I 100 Renown');
    expect(tip).toContain('V 510 Renown');
    expect(tip).toContain('Ranks: Some upgrades can be bought several times');
  });

  it('buys the next rank from the detail card and ends at maxed', async () => {
    const user = userEvent.setup();
    setProfile(5000, ['upgrade.ui_hardy'], { 'upgrade.ui_hardy': 4 });
    await openTab(user);
    await user.click(nodeButton('Hardy Test'));
    const detail = screen.getByRole('region', { name: 'Hardy Test details' });
    await user.click(within(detail).getByRole('button', { name: 'Buy rank V for 510 Renown' }));
    expect(useProfileStore.getState().profile.upgrades.ranks).toEqual({ 'upgrade.ui_hardy': 5 });
    expect(nodeButton('Hardy Test').textContent).toContain('5/5');
    expect(nodeButton('Hardy Test').textContent).toContain('Owned');
  });
});

describe('a closed building tier in the Town tree', () => {
  it('draws a labeled divider and locks the rows under it, in words as well as the lock glyph', async () => {
    const user = userEvent.setup();
    setProfile(1000, ['upgrade.ui_hardy']);
    await openTab(user);
    const divider = screen.getByText(/Tier II — locked: Reach floor 5/);
    expect(divider).toBeTruthy();
    const deep = nodeButton('Deep Test');
    expect(deep.textContent).toContain('Locked');
    await act(async () => (divider.closest('[tabindex]') as HTMLElement).focus());
    const tip = (await screen.findByRole('tooltip')).textContent ?? '';
    expect(tip).toContain('Tier 2 and up open when you reach floor 5.');
    expect(tip).toContain('Building tiers:');
    await user.click(deep);
    const detail = screen.getByRole('region', { name: 'Deep Test details' });
    const buy = within(detail).getByRole('button', { name: /Buy/ });
    expect(buy).toHaveProperty('disabled', true);
    await act(async () => (buy.parentElement as HTMLElement).focus());
    expect((await screen.findByRole('tooltip')).textContent).toContain('Tier 2 and up open when you reach floor 5.');
  });

  it('draws no divider once the gate is open', async () => {
    const user = userEvent.setup();
    setProfile(1000, ['upgrade.ui_hardy']);
    useProfileStore.setState((s) => ({ profile: { ...s.profile, milestones: { unlocked: [{ id: 'building.ui_ranks_t2', run: 1 }] } } }));
    await openTab(user);
    expect(screen.queryByText(/locked: Reach floor 5/)).toBeNull();
    expect(nodeButton('Deep Test').textContent).toContain('Available');
  });
});
