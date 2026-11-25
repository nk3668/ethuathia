// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CLASS_VANGUARD, RACE_HUMAN } from '../../src/content';
import type { RaceDef } from '../../src/content';
import { buildRunConfig } from '../../src/meta';
import { raceOptionLabel, slotAttributePreview } from '../../src/ui/prepare/components/attributePreview';
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

    // Panels that leave themselves out (no opt-in upgrade owned yet) are not on the screen.
    expect(screen.queryByTestId('prepare-opt-ins')).toBeNull();
    for (const panel of PREPARE_PANELS.filter((p) => !['opt-ins', 'omens'].includes(p.id))) expect(screen.getByTestId(`prepare-${panel.id}`)).toBeTruthy();
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
    expect(configs[0]).toMatchObject({ party: [{ classId: 'class.vanguard' }], dungeonId: 'dungeon.old_delve' });
    off();
  });

  it('shows more slots once the Guild Hall allows them, and what the town gives', () => {
    useProfileStore.setState((s) => ({ profile: { ...s.profile, upgrades: { owned: ['upgrade.second_berth', 'upgrade.hardy_recruits'], ranks: {} } } }));
    render(<PrepareScreen />);
    expect(within(screen.getByTestId('prepare-party')).getAllByRole('combobox')).toHaveLength(4);
    const town = within(screen.getByTestId('prepare-town'));
    expect(town.getByText('Hardy Recruits')).toBeTruthy();
    expect(town.getByText(/\+3 max HP for each adventurer/)).toBeTruthy();
  });

  it('says why a run could not start', () => {
    useRunStore.setState({ startError: 'No dungeon is available' });
    render(<PrepareScreen />);
    expect(screen.getByRole('alert').textContent).toContain('No dungeon is available');
  });

  it('shows attribute modifiers in class and race selects and previews attributes and HP/MP per slot', async () => {
    const user = userEvent.setup();
    render(<PrepareScreen />);

    const party = within(screen.getByTestId('prepare-party'));
    const classSelect = party.getByRole('combobox', { name: 'Class' });
    const raceSelect = party.getByRole('combobox', { name: 'Race' });

    expect(within(classSelect).getByRole('option', { name: 'Vanguard (BRN 11 · FIN 9 · WIT 4 · GRT 13)' })).toBeTruthy();
    expect(within(raceSelect).getByRole('option', { name: 'Human (BRN +1 · FIN +1 · WIT +1 · GRT +1)' })).toBeTruthy();

    expect(party.getByText('Attributes rolled on descent')).toBeTruthy();

    await user.selectOptions(classSelect, 'class.vanguard');
    expect(party.getByText('BRN 11 · FIN 9 · WIT 4 · GRT 13 · HP 28 · MP 4 · Kit: Oak cudgel, Round shield (before race)')).toBeTruthy();

    await user.selectOptions(raceSelect, 'race.human');
    expect(party.getByText('BRN 12 · FIN 10 · WIT 5 · GRT 14 · HP 33 · MP 5 · Kit: Oak cudgel, Round shield')).toBeTruthy();

    await user.selectOptions(classSelect, '');
    expect(party.getByText('BRN +1 · FIN +1 · WIT +1 · GRT +1 (before class)')).toBeTruthy();
  });

  it('shows full descriptions for unlocked classes and races on Prepare even with an empty Codex', async () => {
    const user = userEvent.setup();
    render(<PrepareScreen />);

    const party = within(screen.getByTestId('prepare-party'));
    await user.selectOptions(party.getByRole('combobox', { name: 'Class' }), CLASS_VANGUARD.id);
    await user.selectOptions(party.getByRole('combobox', { name: 'Race' }), RACE_HUMAN.id);

    const classLink = party.getByText(CLASS_VANGUARD.name);
    await user.click(classLink);
    const classTip = await screen.findByRole('tooltip');
    expect(classTip.textContent).toContain(CLASS_VANGUARD.description);
    expect(classTip.textContent).not.toContain('???');

    await user.tab();
    const raceTip = await screen.findByRole('tooltip');
    expect(raceTip.textContent).toContain(RACE_HUMAN.description);
    expect(raceTip.textContent).not.toContain('???');
  });

  it('omits modifier parentheses and describes zero-modifier races cleanly', () => {
    const plainRace: RaceDef = { id: 'race.plain', name: 'Plain', description: 'No modifiers.', tags: [], attributes: {}, speed: 100 };
    expect(raceOptionLabel(plainRace)).toBe('Plain');
    expect(slotAttributePreview(undefined, plainRace)).toEqual({ text: 'No attribute modifiers (before class)', resolved: true });
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
