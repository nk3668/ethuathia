// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildRunConfig } from '../../src/meta';
import { PrepareScreen } from '../../src/ui/prepare/PrepareScreen';
import { collectPanels, PREPARE_PANELS } from '../../src/ui/prepare/registry';
import { definePreparePanel } from '../../src/ui/prepare/types';
import { resetProfileStore, useProfileStore } from '../../src/ui/stores/profileStore';
import { setRunStarter, useRunStore } from '../../src/ui/stores/runStore';

beforeEach(() => {
  resetProfileStore();
  useRunStore.setState({ screen: 'prepare', startError: null });
});
afterEach(cleanup);

describe('PrepareScreen', () => {
  it('lays out the registered panels and starts a run from the remembered choices on Descend', async () => {
    const user = userEvent.setup();
    const configs: unknown[] = [];
    const off = setRunStarter(() => {
      const { profile } = useProfileStore.getState();
      configs.push(buildRunConfig(profile, profile.prepare.choices, 1));
    });
    render(<PrepareScreen />);

    for (const panel of PREPARE_PANELS) expect(screen.getByTestId(`prepare-${panel.id}`)).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Party' })).toBeTruthy();
    // One slot to start; the others are locked until the Guild Hall adds berths.
    const party = within(screen.getByTestId('prepare-party'));
    expect(party.getAllByRole('combobox')).toHaveLength(2);
    expect(party.getAllByText(/Locked/)).toHaveLength(3);
    expect((screen.getByRole('radio', { name: /The Old Delve/ }) as HTMLInputElement).checked).toBe(true);
    expect(document.activeElement?.textContent).toBe('Descend');

    // Picking a class is remembered in the profile.
    await user.selectOptions(party.getByRole('combobox', { name: 'Class' }), 'class.vanguard');
    expect(useProfileStore.getState().profile.prepare.choices.party.slots[0]).toEqual({ classId: 'class.vanguard', raceId: null });
    expect(useProfileStore.getState().dirty).toBe(true);

    await user.click(screen.getByRole('button', { name: 'Descend' }));
    expect(configs).toHaveLength(1);
    expect(configs[0]).toMatchObject({ party: [{ classId: 'class.vanguard' }], depth: 10 });
    off();
  });

  it('shows more slots once the Guild Hall allows them, and what the town gives', () => {
    useProfileStore.setState((s) => ({ profile: { ...s.profile, upgrades: { owned: ['upgrade.second_berth', 'upgrade.hardy_recruits'] } } }));
    render(<PrepareScreen />);
    expect(within(screen.getByTestId('prepare-party')).getAllByRole('combobox')).toHaveLength(4);
    const town = within(screen.getByTestId('prepare-town'));
    expect(town.getByText('Hardy Recruits')).toBeTruthy();
    expect(town.getByText(/\+2 max HP for each adventurer/)).toBeTruthy();
  });

  it('says why a run could not start', () => {
    useRunStore.setState({ startError: 'No dungeon is available' });
    render(<PrepareScreen />);
    expect(screen.getByRole('alert').textContent).toContain('No dungeon is available');
  });
});

describe('collectPanels', () => {
  const panel = (id: string, order: number) => definePreparePanel({ id, title: id, column: 'risk', order, Component: () => null });

  it('sorts panels by order and refuses a repeated id or a file without a panel', () => {
    expect(collectPanels({ './b.tsx': { default: panel('b', 20) }, './a.tsx': { default: panel('a', 30) } }).map((p) => p.id)).toEqual(['b', 'a']);
    expect(() => collectPanels({ './a.tsx': { default: panel('x', 1) }, './b.tsx': { default: panel('x', 2) } })).toThrow(/Two Prepare panels/);
    expect(() => collectPanels({ './a.tsx': {} })).toThrow(/no default export/);
  });
});
