// @vitest-environment jsdom
/**
 * Omens in the UI (ETH-185): the Prepare panel (left out while locked, a rank selector each, the
 * total multiplier), the Codex entry and the run summary's multiplier line. Fixture Omens.
 */
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { defineOmen, defineUpgrade } from '../../src/content';
import { emptyRunResult } from '../../src/sim';
import type { RunReport } from '../../src/sim';
import { PrepareScreen } from '../../src/ui/prepare/PrepareScreen';
import { RunSummary } from '../../src/ui/shell/RunSummary';
import { omensOf } from '../../src/ui/shell/runSummaryText';
import { codexEntry } from '../../src/ui/codex/registry';
import { resetProfileStore, useProfileStore } from '../../src/ui/stores/profileStore';
import { useRunStore } from '../../src/ui/stores/runStore';

const DUSK = defineOmen({
  id: 'omen.test_ui_dusk',
  name: 'Test Dusk',
  description: 'Evening comes early.',
  hint: 'It gets dark.',
  tags: [],
  ranks: [
    { reward: 0.1, text: 'Dim.', flags: ['omen.test_ui_dusk'] },
    { reward: 0.3, text: 'Dark.', flags: ['omen.test_ui_dusk'] },
  ],
});
const WRIT = defineUpgrade({
  id: 'upgrade.test_ui_dusk_writ',
  name: 'Dusk Writ',
  description: 'Unlocks Test Dusk.',
  tags: [],
  building: 'building.guild_hall',
  tier: 31,
  column: 0,
  cost: { renown: 1 },
  requires: [],
  grants: [{ kind: 'unlock', id: DUSK.id }],
});

beforeEach(() => {
  resetProfileStore();
  useRunStore.setState({ screen: 'prepare', startError: null });
});
afterEach(cleanup);

describe('the Omens panel', () => {
  it('is left out while no Omen is unlocked', () => {
    render(<PrepareScreen />);
    expect(screen.queryByTestId('prepare-omens')).toBeNull();
  });

  it('lists an unlocked Omen off, lets the player pick a rank, and shows the total multiplier', async () => {
    const user = userEvent.setup();
    useProfileStore.setState((s) => ({ profile: { ...s.profile, upgrades: { owned: [WRIT.id], ranks: {} } } }));
    render(<PrepareScreen />);
    const panel = within(screen.getByTestId('prepare-omens'));
    expect(panel.getByTestId('omen-multiplier').textContent).toContain('×1.00');
    expect((panel.getByRole('radio', { name: 'Off' }) as HTMLInputElement).checked).toBe(true);

    await user.click(panel.getByRole('radio', { name: 'II' }));
    expect(useProfileStore.getState().profile.prepare.choices.omens).toEqual({ ranks: { [DUSK.id]: 2 } });
    expect(panel.getByTestId('omen-multiplier').textContent).toContain('×1.30');

    await user.click(panel.getByRole('radio', { name: 'Off' }));
    expect(useProfileStore.getState().profile.prepare.choices.omens).toEqual({ ranks: {} });
    expect(panel.getByTestId('omen-multiplier').textContent).toContain('×1.00');
  });
});

describe('the Codex entry and the run summary', () => {
  it('has a Codex entry listing every rank and its reward', () => {
    const entry = codexEntry(DUSK.id);
    expect(entry?.renderer.label).toBe('Omens');
    const fields = entry?.renderer.fields?.(DUSK) ?? [];
    expect(fields.map((f) => f.label)).toEqual(['Opt-in', 'Rank I', 'Rank II']);
    expect(fields[2]?.value).toBe('Dark. Rewards +30%.');
  });

  it('reads the Omens and multiplier from the result, and nothing from a plain run', () => {
    const plain: RunReport = { result: emptyRunResult('victory'), end: { outcome: 'victory', turn: 1, cause: '', depth: 1 } };
    expect(omensOf(plain)).toBeNull();
    const withOmens: RunReport = {
      ...plain,
      result: { ...plain.result, extras: { 'run.omens': { omens: [{ id: DUSK.id, rank: 2 }], multiplier: 1.3 } } },
    };
    expect(omensOf(withOmens)).toEqual({ lines: [{ name: 'Test Dusk', rank: 2 }], multiplier: 1.3 });
  });

  it('shows the multiplier line in the summary only when an Omen was on', () => {
    const base: RunReport = { result: { ...emptyRunResult('victory'), atRisk: { renown: 50 } }, end: { outcome: 'victory', turn: 1, cause: 'Out.', depth: 2 } };
    render(<RunSummary />);
    act(() => useRunStore.getState().runEnded(base));
    expect(screen.queryByTestId('summary-omens')).toBeNull();
    act(() => useRunStore.getState().runEnded({ ...base, result: { ...base.result, extras: { 'run.omens': { omens: [{ id: DUSK.id, rank: 2 }], multiplier: 1.3 } } } }));
    expect(screen.getByTestId('summary-omens').textContent).toBe('Omen multiplier: ×1.30 (Test Dusk II)');
  });
});
