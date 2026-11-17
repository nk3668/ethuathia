// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { newProfile } from '../../src/meta';
import { resetProfileStore, useProfileStore } from '../../src/ui/stores/profileStore';
import { TownPanel } from '../../src/ui/town/TownPanel';

function setRenown(renown: number, owned: string[] = []) {
  const p = newProfile();
  useProfileStore.setState({ profile: { ...p, currencies: { ...p.currencies, renown }, upgrades: { owned } } });
}

/** The node button for an upgrade, by its visible name. */
function nodeButton(name: string): HTMLElement {
  return within(screen.getByRole('list', { name: 'Upgrades' })).getByRole('button', { name: new RegExp(`^${name}\\b`) });
}

beforeEach(resetProfileStore);
afterEach(() => {
  cleanup();
  resetProfileStore();
});

describe('Town tab', () => {
  it('shows one tab per building and the Guild Hall tree with every node', () => {
    render(<TownPanel />);
    expect(screen.getByRole('tab', { name: 'Guild Hall' })).toHaveProperty('ariaSelected', 'true');
    const nodes = within(screen.getByRole('list', { name: 'Upgrades' })).getAllByRole('button');
    expect(nodes.map((n) => n.textContent?.replace(/^(✓|🔒)/u, '').split('(')[0])).toEqual([
      'Second Berth',
      'Roster Ledger',
      'Hardy Recruits',
      'Contract Board',
      'Third Berth',
      'Fourth Berth',
      'Drill Yard',
      'Open Muster',
    ]);
    // Status is in words, not color alone.
    expect(nodeButton('Second Berth').textContent).toContain('Too expensive');
    expect(nodeButton('Third Berth').textContent).toContain('Locked');
  });

  it('shows cost, effect and prerequisites in a node tooltip, and what a locked node needs', async () => {
    const user = userEvent.setup();
    setRenown(0);
    render(<TownPanel />);
    await user.tab(); // the building tab
    await act(async () => nodeButton('Third Berth').focus());
    const tip = await screen.findByRole('tooltip');
    expect(tip.textContent).toContain('Third Berth · Locked');
    expect(tip.textContent).toContain('Party size +1');
    expect(tip.textContent).toContain('250 Renown');
    expect(tip.textContent).toContain('Roster Ledger (not owned)');
    expect(tip.textContent).toContain('Needs Roster Ledger first.');
  });

  it('buys a node from its detail card and marks it owned', async () => {
    const user = userEvent.setup();
    setRenown(200);
    render(<TownPanel />);
    await user.click(nodeButton('Second Berth'));
    const detail = screen.getByRole('region', { name: 'Second Berth details' });
    await user.click(within(detail).getByRole('button', { name: 'Buy for 50 Renown' }));
    expect(useProfileStore.getState().profile.upgrades.owned).toEqual(['upgrade.second_berth']);
    expect(useProfileStore.getState().profile.currencies.renown).toBe(150);
    expect(useProfileStore.getState().dirty).toBe(true);
    expect(nodeButton('Second Berth').textContent).toContain('Owned');
    expect(nodeButton('Roster Ledger').textContent).toContain('Available');
  });

  it('disables Buy and says why when the node is too expensive', async () => {
    const user = userEvent.setup();
    setRenown(10);
    render(<TownPanel />);
    await user.click(nodeButton('Second Berth'));
    const detail = screen.getByRole('region', { name: 'Second Berth details' });
    expect(within(detail).getByRole('button', { name: /Buy/ })).toHaveProperty('disabled', true);
    expect(detail.textContent).toContain('Needs 40 Renown more.');
  });

  it('shows the pick-one choice and respecs it', async () => {
    const user = userEvent.setup();
    setRenown(100, ['upgrade.second_berth', 'upgrade.hardy_recruits']);
    render(<TownPanel />);
    expect(nodeButton('Contract Board').textContent).toContain('Not chosen');
    await user.click(nodeButton('Contract Board'));
    const detail = screen.getByRole('region', { name: 'Contract Board details' });
    expect(detail.textContent).toContain('Instead of Hardy Recruits');
    expect(detail.textContent).toContain('respec fee of 60 Renown');
    expect(within(detail).queryByRole('button', { name: /Buy/ })).toBeNull();
    await user.click(within(detail).getByRole('button', { name: 'Respec: give up Hardy Recruits' }));
    const { profile } = useProfileStore.getState();
    expect(profile.upgrades.owned).toEqual(['upgrade.second_berth']);
    expect(profile.currencies.renown).toBe(160);
    expect(nodeButton('Contract Board').textContent).toContain('Available');
  });
});
