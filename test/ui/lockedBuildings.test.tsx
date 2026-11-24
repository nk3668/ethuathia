// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { applyRunResult, newProfile } from '../../src/meta';
import { emptyRunResult } from '../../src/sim';
import type { RunReport } from '../../src/sim';
import { RunSummary } from '../../src/ui/shell/RunSummary';
import { resetProfileStore, useProfileStore } from '../../src/ui/stores/profileStore';
import { useRunStore } from '../../src/ui/stores/runStore';
import { TownPanel } from '../../src/ui/town/TownPanel';

beforeEach(resetProfileStore);
afterEach(() => {
  cleanup();
  resetProfileStore();
  useRunStore.getState().runStarted();
});

/** A retreat that brought the guild's anvil home: the Smithy's quest done (ETH-093). */
const ANVIL = [{ key: 'contract:contract.cold_anvil', owner: { kind: 'contract', id: 'contract.cold_anvil' }, status: 'complete' }];
const DEEP: RunReport = {
  result: { ...emptyRunResult('retreat'), turns: 400, deepestDepth: 3, extras: { 'quests.objectives': ANVIL } },
  end: { outcome: 'retreat', turn: 400, cause: 'The party turned back.', depth: 3 },
};

describe('locked buildings in the Town tab', () => {
  it('shows a locked building with its milestone and progress', async () => {
    const user = userEvent.setup();
    const p = newProfile();
    useProfileStore.setState({ profile: { ...p, history: { ...p.history, totals: { ...p.history.totals, runs: 1, deepestDepth: 2 } } } });
    render(<TownPanel />);
    const tab = screen.getByRole('tab', { name: /Smithy/ });
    expect(tab.textContent).toContain('(locked)');
    await user.click(tab);
    const panel = screen.getByRole('tabpanel');
    expect(panel.textContent).toContain('Smithy is locked');
    expect(panel.textContent).toContain('Unlocks when you: Complete the contract The Cold Anvil and walk out of the dungeon');
    expect(panel.textContent).toContain('Not completed yet');
    expect(panel.textContent).toContain('Quest: The Cold Anvil. Take it as a contract on the Prepare screen.');
    expect(within(panel).queryByRole('list', { name: 'Upgrades' })).toBeNull();
  });

  it('opens the building once a run meets the milestone, and the run summary says so', () => {
    render(
      <>
        <TownPanel />
        <RunSummary />
      </>,
    );
    act(() => {
      useProfileStore.getState().applyRunResult(DEEP.result);
      useRunStore.getState().runEnded(DEEP);
    });
    const tab = screen.getByRole('tab', { name: /Smithy/ });
    expect(tab.textContent).not.toContain('(locked)');
    const unlocked = within(screen.getByRole('dialog')).getByRole('region', { name: 'Unlocked' });
    expect(unlocked.textContent).toContain('Smithy opens in town: you brought the anvil home.');
    expect(tab.textContent).toContain('New');
  });

  it('lists nothing unlocked when the run opened nothing', () => {
    useProfileStore.setState({ profile: applyRunResult(newProfile(), { ...DEEP.result, extras: {} }) });
    render(<RunSummary />);
    act(() => useRunStore.getState().runEnded(DEEP));
    expect(within(screen.getByRole('dialog')).queryByRole('region', { name: 'Unlocked' })).toBeNull();
  });
});
