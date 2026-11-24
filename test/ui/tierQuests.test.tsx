// @vitest-environment jsdom
/** The Town tree with a tier quest (ETH-170): the gate divider names the quest, and a new band is marked. */
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { defineBuilding, defineContract, defineUpgrade, tierGateId } from '../../src/content';
import { newProfile } from '../../src/meta';
import { resetProfileStore, useProfileStore } from '../../src/ui/stores/profileStore';
import { useRunStore } from '../../src/ui/stores/runStore';
import { TownPanel } from '../../src/ui/town/TownPanel';

const B = 'building.ui_tier_quest';
const Q = 'contract.ui_tier_quest';
defineBuilding({
  id: B,
  name: 'Quest Hall',
  description: 'Test.',
  tags: [],
  kind: 'foundations',
  tierGates: [{ fromTier: 2, unlock: { kind: 'objectiveDone', owner: { kind: 'contract', id: Q }, exited: true } }],
});
defineContract({
  id: Q,
  name: 'The Test Ascent',
  description: 'A test quest.',
  tags: [],
  objective: { kind: 'recover', item: 'item.mending_draught', depth: 4 },
  reward: { renown: 10 },
  opens: { building: B, fromTier: 2 },
});
for (const [id, tier] of [['ui_tq_a', 1], ['ui_tq_b', 2]] as const) {
  defineUpgrade({
    id: `upgrade.${id}`,
    name: id,
    description: 'A test node.',
    tags: [],
    building: B,
    tier,
    column: 0,
    cost: { renown: 100 },
    requires: [],
    grants: [{ kind: 'capacity', key: 'partySize', amount: 1 }],
  });
}

beforeEach(() => {
  resetProfileStore();
  useRunStore.getState().openPrepare();
});
afterEach(() => {
  cleanup();
  resetProfileStore();
});

describe('a tier quest in the Town tree', () => {
  it('names the quest and what it still needs in the gate divider tooltip', async () => {
    const user = userEvent.setup();
    render(<TownPanel />);
    await user.click(screen.getByRole('tab', { name: 'Quest Hall' }));
    const divider = screen.getByText(/Tier II — locked/);
    await act(async () => (divider.closest('[tabindex]') as HTMLElement).focus());
    const tip = (await screen.findByRole('tooltip')).textContent ?? '';
    expect(tip).toContain('The Test Ascent');
    expect(tip).toContain("Not offered yet. Buy 50% of the Quest Hall's upgrades: 0 of 1.");
  });

  it('marks the newly opened band and the building tab after the run that opened it', async () => {
    const user = userEvent.setup();
    const p = newProfile();
    useProfileStore.setState({
      profile: {
        ...p,
        history: { ...p.history, totals: { ...p.history.totals, runs: 3 } },
        milestones: { unlocked: [{ id: tierGateId(B, 2), run: 3 }] },
      },
    });
    render(<TownPanel />);
    expect(screen.getByRole('tab', { name: /Quest Hall.*just opened/ })).toBeTruthy();
    await user.click(screen.getByRole('tab', { name: /Quest Hall/ }));
    expect(screen.getByText(/Tier II just opened\./)).toBeTruthy();
    expect(screen.queryByText(/Tier II — locked/)).toBeNull();
  });
});
