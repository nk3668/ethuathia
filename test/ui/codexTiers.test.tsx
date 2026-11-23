// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MONSTER_GLOAM_RAT, MONSTERS } from '../../src/content';
import { applyRunResult, newProfile } from '../../src/meta';
import { emptyRunResult } from '../../src/sim';
import { CodexPanel } from '../../src/ui/codex/CodexPanel';
import { Explain } from '../../src/ui/codex/Explain';
import { resetProfileStore, useProfileStore } from '../../src/ui/stores/profileStore';
import { useSimStore } from '../../src/ui/stores/simStore';
import { useUiStore } from '../../src/ui/stores/uiStore';

// A rare monster that reveals at 1 / 2 / 3 kills. Registered here only: vitest isolates each file's registries.
const RARE = MONSTERS.register({
  ...MONSTER_GLOAM_RAT,
  id: 'monster.test_rare_unique',
  name: 'Test Unique',
  hint: 'A rare thing.',
  description: 'The full lore of the rare thing.',
  handPlaced: true,
  codexTiers: { basics: 1, stats: 2, lore: 3 },
});

function reset() {
  cleanup();
  window.matchMedia = ((query: string) =>
    ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined }) as unknown as MediaQueryList);
  resetProfileStore();
  useSimStore.getState().reset();
  useUiStore.setState({ codexOpen: false });
}

beforeEach(reset);
afterEach(() => {
  reset();
  delete (window as Partial<Window>).matchMedia;
});

function bank(kills: Record<string, number>) {
  const ids = Object.keys(kills);
  const result = {
    ...emptyRunResult('retreat' as const),
    extras: {
      'track.codex': Object.fromEntries(ids.map((id) => [id, ['seen', 'killed']])),
      'track.kills': { kills: 0, trophies: 0, byMonster: kills },
    },
  };
  act(() => useProfileStore.setState({ profile: applyRunResult(newProfile(), result) }));
}

const detailPane = () => screen.getByRole('region', { name: 'Codex entry' });

describe('per-monster Codex kill tiers (ETH-144)', () => {
  it('reveals each section of an overridden def at its own thresholds in the Codex, and the tier note follows', async () => {
    const user = userEvent.setup();
    bank({ [RARE.id]: 1 });
    render(<CodexPanel />);
    await user.click(within(screen.getByRole('region', { name: /^Monsters/ })).getByRole('button', { name: /Test Unique/ }));

    let detail = detailPane();
    expect(within(detail).getByText('HP')).toBeTruthy();
    expect(within(detail).queryByText('Evasion')).toBeNull();
    expect(within(detail).queryByText(RARE.description)).toBeNull();
    expect(within(detail).getByLabelText('Encounter record').textContent).toContain('Next tier at 2 kills (full stats)');

    bank({ [RARE.id]: 2 });
    detail = detailPane();
    expect(within(detail).getByText('Evasion')).toBeTruthy();
    expect(within(detail).queryByText('Drops')).toBeNull();
    expect(within(detail).queryByText(RARE.description)).toBeNull();
    expect(within(detail).getByLabelText('Encounter record').textContent).toContain('Next tier at 3 kills (lore and drops)');

    bank({ [RARE.id]: 3 });
    detail = detailPane();
    expect(within(detail).getByText(RARE.description)).toBeTruthy();
    expect(within(detail).getByText('Drops')).toBeTruthy();
    expect(within(detail).getByLabelText('Encounter record').textContent).toContain('All tiers unlocked');
  });

  it('uses the def tiers in the Explain tooltip', async () => {
    const user = userEvent.setup();
    bank({ [RARE.id]: 2 });
    render(<Explain id={RARE.id} />);
    await user.tab();
    let tip = await screen.findByRole('tooltip');
    expect(tip.textContent).toContain(RARE.hint ?? '');
    expect(tip.textContent).not.toContain(RARE.description);

    cleanup();
    bank({ [RARE.id]: 3 });
    render(<Explain id={RARE.id} />);
    await user.tab();
    tip = await screen.findByRole('tooltip');
    expect(tip.textContent).toContain(RARE.description);
  });

  it('leaves a def without codexTiers on 1 / 10 / 50', async () => {
    const user = userEvent.setup();
    bank({ [MONSTER_GLOAM_RAT.id]: 3 });
    render(<CodexPanel />);
    await user.click(within(screen.getByRole('region', { name: /^Monsters/ })).getByRole('button', { name: new RegExp(MONSTER_GLOAM_RAT.name) }));
    const detail = detailPane();
    expect(within(detail).queryByText('Evasion')).toBeNull();
    expect(within(detail).getByLabelText('Encounter record').textContent).toContain('Next tier at 10 kills (full stats)');
  });
});
