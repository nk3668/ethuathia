// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CLASS_VANGUARD, CLASSES, CONTENT_KINDS, FEATURE_DOOR, TERRAIN_WALL } from '../../src/content';
import { applyRunResult, newProfile } from '../../src/meta';
import { emptyRunResult } from '../../src/sim';
import { CodexPanel } from '../../src/ui/codex/CodexPanel';
import { Explain } from '../../src/ui/codex/Explain';
import { ALL_RENDERERS, CODEX_RENDERERS, codexEntry, collectRenderers } from '../../src/ui/codex/registry';
import { defineCodexRenderer } from '../../src/ui/codex/types';
import { LogPanel } from '../../src/ui/shell/LogPanel';
import { resetProfileStore, useProfileStore } from '../../src/ui/stores/profileStore';
import { useSimStore } from '../../src/ui/stores/simStore';

function reset() {
  cleanup();
  resetProfileStore();
  useSimStore.getState().reset();
}

beforeEach(reset);
afterEach(reset);

/** Banks a run that discovered `entries`, as ETH-062 will at run end. */
function bank(entries: Record<string, string[]>) {
  const result = { ...emptyRunResult('retreat' as const), extras: { 'track.codex': entries } };
  act(() => useProfileStore.setState({ profile: applyRunResult(newProfile(), result) }));
}

const section = (name: string) => screen.getByRole('region', { name: new RegExp(`^${name}`) });

describe('Codex renderers', () => {
  it('cover content kinds only, one file per kind, and every kind has a section', () => {
    const kinds = new Set(CONTENT_KINDS.map((k) => k.registry.kind));
    for (const kind of CODEX_RENDERERS.keys()) expect(kinds.has(kind), kind).toBe(true);
    expect(ALL_RENDERERS.map((r) => r.registry.kind).sort()).toEqual([...kinds].sort());
  });

  it('refuse two renderers for one kind and a file with no renderer', () => {
    const one = defineCodexRenderer({ registry: CLASSES, label: 'A', order: 1 });
    expect(() => collectRenderers({ './a.tsx': { default: one }, './b.tsx': { default: one } })).toThrow(/Two Codex renderers/);
    expect(() => collectRenderers({ './c.tsx': {} })).toThrow(/no default export/);
  });

  it('look up any def by id with its renderer', () => {
    expect(codexEntry(CLASS_VANGUARD.id)?.renderer.label).toBe('Classes');
    expect(codexEntry('monster.nothing')).toBeUndefined();
  });
});

describe('CodexPanel', () => {
  it('shows undiscovered entries as ??? with a hint, and always-known terrain by name', () => {
    render(<CodexPanel />);
    const classes = section('Classes');
    expect(within(classes).getByText('???')).toBeTruthy();
    expect(within(classes).queryByText(CLASS_VANGUARD.name)).toBeNull();
    expect(within(classes).getByText('0 / 1')).toBeTruthy();
    expect(within(section('Terrain')).getByText(TERRAIN_WALL.name)).toBeTruthy();
  });

  it('fills in from the profile, with the marks and stats of each entry', () => {
    bank({ [CLASS_VANGUARD.id]: ['seen'] });
    render(<CodexPanel />);
    const classes = section('Classes');
    expect(within(classes).getByText(CLASS_VANGUARD.name)).toBeTruthy();
    expect(within(classes).getByText('Seen')).toBeTruthy();
    expect(within(classes).getByText('1 / 1')).toBeTruthy();
    expect(within(classes).getByText(CLASS_VANGUARD.description)).toBeTruthy();
    expect(within(classes).getByText('Grit').nextSibling?.textContent).toBe(String(CLASS_VANGUARD.attributes.grit));
    expect(within(classes).getByText('Attributes').nextSibling?.textContent).toBe('BRN 11 · FIN 9 · WIT 4 · GRT 13');
  });

  it('fills in live from the running sim before the run ends', () => {
    render(<CodexPanel />);
    expect(within(section('Dungeon features')).queryByText(FEATURE_DOOR.name)).toBeNull();
    act(() => useSimStore.getState().receiveEvents([{ type: 'doorOpened', actor: 1, door: 2, pos: { x: 1, y: 1 }, turn: 3 }]));
    expect(within(section('Dungeon features')).getByText(FEATURE_DOOR.name)).toBeTruthy();
    expect(within(section('Dungeon features')).getByText('Used')).toBeTruthy();
  });

  it('searches known entries only, and filters by section', async () => {
    const user = userEvent.setup();
    bank({ [FEATURE_DOOR.id]: ['used'] });
    render(<CodexPanel />);
    const search = screen.getByRole('searchbox', { name: 'Search the Codex' });

    await user.type(search, 'hinges');
    expect(screen.getByText(FEATURE_DOOR.name)).toBeTruthy();
    expect(screen.queryByText('???')).toBeNull();
    expect(screen.queryByRole('region', { name: /^Terrain/ })).toBeNull();

    await user.clear(search);
    await user.type(search, 'vanguard');
    expect(screen.getByText(/Nothing you have discovered matches/)).toBeTruthy();

    await user.clear(search);
    await user.click(within(screen.getByRole('group', { name: 'Codex sections' })).getByRole('button', { name: 'Terrain' }));
    expect(screen.getByRole('region', { name: /^Terrain/ })).toBeTruthy();
    expect(screen.queryByRole('region', { name: /^Classes/ })).toBeNull();
  });
});

describe('Explain', () => {
  it('names a def and explains it in a tooltip on focus, with its key fields', async () => {
    const user = userEvent.setup();
    render(<Explain id={CLASS_VANGUARD.id} />);
    expect(screen.getByText(CLASS_VANGUARD.name)).toBeTruthy();
    await user.tab();
    const tip = await screen.findByRole('tooltip');
    expect(tip.textContent).toContain(CLASS_VANGUARD.description);
    expect(tip.textContent).toContain('AttributesBRN 11 · FIN 9 · WIT 4 · GRT 13');
  });

  it('shows a piece of gear’s slot, base type and stats (ETH-043)', async () => {
    const user = userEvent.setup();
    render(<Explain id="item.flanged_mace" />);
    await user.tab();
    const tip = await screen.findByRole('tooltip');
    expect(tip.textContent).toContain('WornMain hand · Mace');
    expect(tip.textContent).toContain('StatsDamage +3, Accuracy −1');
  });

  it('shows that a ring fits either ring slot (ETH-111)', async () => {
    const user = userEvent.setup();
    render(<Explain id="item.owl_eye_ring" />);
    await user.tab();
    const tip = await screen.findByRole('tooltip');
    expect(tip.textContent).toContain('WornLeft ring or Right ring · Ring');
    expect(tip.textContent).toContain('StatsSight +1, Accuracy +1');
  });

  it('renders an unknown id as plain text', () => {
    const { container } = render(<Explain id="monster.nothing">a thing</Explain>);
    expect(container.textContent).toBe('a thing');
    expect(container.querySelector('[tabindex]')).toBeNull();
  });

  it('marks content mentions in the log', () => {
    act(() => {
      useSimStore.getState().receiveEvents([{ type: 'doorOpened', actor: 1, door: 2, pos: { x: 1, y: 1 }, turn: 3 }]);
    });
    const { container } = render(<LogPanel />);
    const link = container.querySelector(`[data-explain="${FEATURE_DOOR.id}"]`);
    expect(link?.textContent).toBe('door');
  });
});
