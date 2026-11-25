// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { masteryStepCost, masteryXpForLevel, newProfile } from '../../src/meta';
import { resetProfileStore, useProfileStore } from '../../src/ui/stores/profileStore';
import { useRunStore } from '../../src/ui/stores/runStore';
import { TownPanel } from '../../src/ui/town/TownPanel';

function setRenown(renown: number, owned: string[] = []) {
  const p = newProfile();
  useProfileStore.setState({ profile: { ...p, currencies: { ...p.currencies, renown }, upgrades: { owned, ranks: {} } } });
}

/** Like `setRenown`, with the Guild Hall's Tier II open (the Long Muster done), so its rows can be bought. */
function setHallTwo(renown: number, owned: string[] = []) {
  setRenown(renown, owned);
  useProfileStore.setState((s) => ({ profile: { ...s.profile, milestones: { unlocked: [{ id: 'building.guild_hall_t4', run: 1 }] } } }));
}

/** The node button for an upgrade, by its visible name. */
function nodeButton(name: string): HTMLElement {
  return within(screen.getByRole('list', { name: 'Upgrades' })).getByRole('button', { name: new RegExp(`^${name}\\b`) });
}

beforeEach(() => {
  resetProfileStore();
  useRunStore.getState().openPrepare(); // between runs; respec and reset are refused during one
});
afterEach(() => {
  cleanup();
  resetProfileStore();
});

describe('Guild Hall Class Mastery list (ETH-087)', () => {
  it('lists each class with its level, XP, progress as text and banked points', () => {
    const p = newProfile();
    const xp = masteryXpForLevel(3) + 10;
    useProfileStore.setState({ profile: { ...p, mastery: { classes: { 'class.vanguard': { xp, runs: 2 } } } } });
    render(<TownPanel />);
    const list = screen.getByRole('region', { name: 'Class Mastery' });
    const row = within(list).getByText('Vanguard').closest('li') as HTMLElement;
    expect(row.textContent).toContain('Level 3');
    expect(row.textContent).toContain(`${xp} XP`);
    expect(row.textContent).toContain(`10 / ${masteryStepCost(3)}`);
    expect(row.textContent).toContain('3 points');
    expect(within(row).getByRole('meter').getAttribute('aria-valuetext')).toBe(`10 of ${masteryStepCost(3)}`);
  });
});

describe('Town tab', () => {
  it('shows one tab per building and the Guild Hall tree with every node', () => {
    render(<TownPanel />);
    expect(screen.getByRole('tab', { name: 'Guild Hall' })).toHaveProperty('ariaSelected', 'true');
    const nodes = within(screen.getByRole('list', { name: 'Upgrades' })).getAllByRole('button');
    expect(nodes.map((n) => n.textContent?.replace(/^(✓|🔒)/u, '').split('(')[0])).toEqual([
      'Second Berth',
      'Hardy Recruits0/5',
      'Contract Bounty0/3',
      "Scout's Charter",
      'Field Rations0/3',
      'Contract Board',
      'Extraction Drills0/3',
      'Marsh Envoy',
      'Library Ties',
      "Medic's Satchel",
      'Guild Chronicles0/3',
      'Waymark Lanterns',
      'Seasoned Constitution0/3',
      'Second Contract Board',
      'Rule Clerk',
      "Quartermaster's Mystery Crate",
    ]);
    // Status is in words, not color alone.
    expect(nodeButton('Second Berth').textContent).toContain('Too expensive');
    expect(nodeButton('Contract Board').textContent).toContain('Locked');
    // Tier II is locked behind The Long Muster.
    expect(nodeButton("Medic's Satchel").textContent).toContain('Locked');
  });

  it('shows cost, effect and prerequisites in a node tooltip, and what a locked node needs', async () => {
    const user = userEvent.setup();
    setRenown(0);
    render(<TownPanel />);
    await user.tab(); // the building tab
    await act(async () => nodeButton('Contract Board').focus());
    const tip = await screen.findByRole('tooltip');
    expect(tip.textContent).toContain('Contract Board · Locked');
    expect(tip.textContent).toContain('Contract slots +1');
    expect(tip.textContent).toContain('250 Renown');
    expect(tip.textContent).toContain('Second Berth (not owned)');
    expect(tip.textContent).toContain('Needs Second Berth first.');
  });

  it('buys a node from its detail card and marks it owned', async () => {
    const user = userEvent.setup();
    setRenown(400);
    render(<TownPanel />);
    await user.click(nodeButton('Second Berth'));
    const detail = screen.getByRole('region', { name: 'Second Berth details' });
    await user.click(within(detail).getByRole('button', { name: 'Buy for 60 Renown' }));
    expect(useProfileStore.getState().profile.upgrades.owned).toEqual(['upgrade.second_berth']);
    expect(useProfileStore.getState().profile.currencies.renown).toBe(340);
    expect(useProfileStore.getState().dirty).toBe(true);
    expect(nodeButton('Second Berth').textContent).toContain('Owned');
    expect(nodeButton('Contract Board').textContent).toContain('Available');
  });

  it('disables Buy and says why when the node is too expensive', async () => {
    const user = userEvent.setup();
    setRenown(10);
    render(<TownPanel />);
    await user.click(nodeButton('Second Berth'));
    const detail = screen.getByRole('region', { name: 'Second Berth details' });
    const buy = within(detail).getByRole('button', { name: /Buy/ });
    expect(buy).toHaveProperty('disabled', true);
    expect(detail.textContent).toContain('Needs 50 Renown more.');
    await act(async () => (buy.parentElement as HTMLElement).focus());
    expect((await screen.findByRole('tooltip')).textContent).toContain('Needs 50 Renown more.');
  });

  it('shows the pick-one choice and respecs it', async () => {
    const user = userEvent.setup();
    setHallTwo(100, ['upgrade.second_berth', 'upgrade.contract_board', 'upgrade.rule_clerk']);
    render(<TownPanel />);
    expect(nodeButton('Second Contract Board').textContent).toContain('Not chosen');
    await user.click(nodeButton('Second Contract Board'));
    const detail = screen.getByRole('region', { name: 'Second Contract Board details' });
    expect(detail.textContent).toContain('Instead of Rule Clerk');
    expect(detail.textContent).toContain('no fee');
    expect(within(detail).queryByRole('button', { name: /Buy/ })).toBeNull();
    await user.click(within(detail).getByRole('button', { name: 'Respec: give up Rule Clerk' }));
    const { profile } = useProfileStore.getState();
    expect(profile.upgrades.owned).toEqual(['upgrade.second_berth', 'upgrade.contract_board']);
    expect(profile.currencies.renown).toBe(1300);
    expect(nodeButton('Second Contract Board').textContent).toContain('Available');
  });

  it('shows the tree kind with a tooltip saying what it means', async () => {
    const user = userEvent.setup();
    render(<TownPanel />);
    const kind = screen.getByText(/Foundation tree/);
    await user.hover(kind);
    expect((await screen.findByRole('tooltip')).textContent).toContain('never during one');
  });

  it('resets the whole tree between runs and refunds it', async () => {
    const user = userEvent.setup();
    setRenown(100, ['upgrade.second_berth', 'upgrade.hardy_recruits']);
    render(<TownPanel />);
    await user.click(screen.getByRole('button', { name: 'Reset tree' }));
    const { profile } = useProfileStore.getState();
    expect(profile.upgrades.owned).toEqual([]);
    expect(profile.currencies.renown).toBe(200);
    expect(screen.getByRole('button', { name: 'Reset tree' })).toHaveProperty('disabled', true);
  });

  it('disables reset and respec during a run and says why', async () => {
    const user = userEvent.setup();
    setHallTwo(100, ['upgrade.second_berth', 'upgrade.contract_board', 'upgrade.rule_clerk']);
    act(() => useRunStore.getState().runStarted());
    render(<TownPanel />);
    const reset = screen.getByRole('button', { name: /Reset tree/ });
    expect(reset).toHaveProperty('disabled', true);
    expect(reset.parentElement?.textContent).toContain('between runs, not during one');
    await act(async () => (reset.parentElement as HTMLElement).focus());
    expect((await screen.findByRole('tooltip')).textContent).toContain('between runs, not during one');

    await user.click(nodeButton('Second Contract Board'));
    const detail = screen.getByRole('region', { name: 'Second Contract Board details' });
    const respec = within(detail).getByRole('button', { name: /Respec/ });
    expect(respec).toHaveProperty('disabled', true);
    await act(async () => (respec.parentElement as HTMLElement).focus());
    expect((await screen.findByRole('tooltip')).textContent).toContain('between runs, not during one');

    expect(useProfileStore.getState().respec('guild_hall.row6', true)).toBe(false);
    expect(useProfileStore.getState().resetTree('building.guild_hall', true)).toBe(false);
    expect(useProfileStore.getState().profile.upgrades.owned).toHaveLength(3);
  });

  it('shows the new run-scope reveal wording on sealed class nodes (ETH-184)', async () => {
    const user = userEvent.setup();
    setHallTwo(0);
    render(<TownPanel />);
    await user.click(nodeButton('Library Ties'));
    const detail = screen.getByRole('region', { name: 'Library Ties details' });
    expect(detail.textContent).toContain('Revealed when you achieve in one run: identified 5 items.');
  });
});
