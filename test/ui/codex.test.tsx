// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  CLASS_VANGUARD,
  CLASSES,
  CONTENT_KINDS,
  FEATURE_DOOR,
  ITEM_FLANGED_MACE,
  ITEM_OWL_EYE_RING,
  MONSTER_GLOAM_RAT,
  STATUS_POISONED,
  TERRAIN_WALL,
} from '../../src/content';
import { applyRunResult, newProfile } from '../../src/meta';
import { emptyRunResult } from '../../src/sim';
import { CodexModal, CodexPanel, CodexTab } from '../../src/ui/codex/CodexPanel';
import { Explain } from '../../src/ui/codex/Explain';
import { ALL_RENDERERS, CODEX_RENDERERS, codexEntry, collectRenderers } from '../../src/ui/codex/registry';
import { defineCodexRenderer } from '../../src/ui/codex/types';
import { AppShell } from '../../src/ui/shell/AppShell';
import { LogPanel } from '../../src/ui/shell/LogPanel';
import { resetProfileStore, useProfileStore } from '../../src/ui/stores/profileStore';
import { useSimStore } from '../../src/ui/stores/simStore';
import { useUiStore } from '../../src/ui/stores/uiStore';

function setNarrow(narrow: boolean) {
  window.matchMedia = (query: string) =>
    ({
      matches: narrow,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }) as unknown as MediaQueryList;
}

function reset() {
  cleanup();
  setNarrow(false);
  resetProfileStore();
  useSimStore.getState().reset();
  useUiStore.setState({ codexOpen: false });
}

beforeEach(reset);
afterEach(() => {
  reset();
  delete (window as Partial<Window>).matchMedia;
});

/** Banks a run that discovered `entries` and optionally recorded monster `kills`. */
function bank(entries: Record<string, string[]>, kills: Record<string, number> = {}) {
  const result = {
    ...emptyRunResult('retreat' as const),
    extras: {
      'track.codex': entries,
      ...(Object.keys(kills).length > 0 ? { 'track.kills': { kills: 0, trophies: 0, byMonster: kills } } : {}),
    },
  };
  act(() => useProfileStore.setState({ profile: applyRunResult(newProfile(), result) }));
}

const section = (name: string) => screen.getByRole('region', { name: new RegExp(`^${name}`) });
const detailPane = () => screen.getByRole('region', { name: 'Codex entry' });

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
  it('shows undiscovered entries as ??? with their glyph and riddle hint, and always-known terrain by name', () => {
    render(<CodexPanel />);
    const classes = section('Classes');
    expect(within(classes).getByText('???')).toBeTruthy();
    expect(within(classes).getByText(CLASS_VANGUARD.hint ?? '')).toBeTruthy();
    expect(within(classes).queryByText(CLASS_VANGUARD.name)).toBeNull();
    expect(within(classes).getByText('0 / 1')).toBeTruthy();

    // Undiscovered entries with a glyph (such as Door or Gloam rat) show their glyph and riddle hint.
    const features = section('Dungeon features');
    expect(within(features).getByText(FEATURE_DOOR.glyph.ch)).toBeTruthy();
    expect(within(features).getByText(FEATURE_DOOR.hint ?? '')).toBeTruthy();

    expect(within(section('Terrain')).getByText(TERRAIN_WALL.name)).toBeTruthy();
  });

  it('fills in from the profile, showing the selected entry page with lore and stats on the right', async () => {
    const user = userEvent.setup();
    bank({ [CLASS_VANGUARD.id]: ['seen'] });
    render(<CodexPanel />);
    const classes = section('Classes');
    expect(within(classes).getByText(CLASS_VANGUARD.name)).toBeTruthy();
    expect(within(classes).getByText('Seen')).toBeTruthy();
    expect(within(classes).getByText('1 / 1')).toBeTruthy();

    await user.click(within(classes).getByRole('button', { name: new RegExp(CLASS_VANGUARD.name) }));
    const detail = detailPane();
    expect(within(detail).getByText(CLASS_VANGUARD.description)).toBeTruthy();
    expect(within(detail).getByText('Grit').nextSibling?.textContent).toBe(String(CLASS_VANGUARD.attributes.grit));
    expect(within(detail).getByText('Attributes').nextSibling?.textContent).toBe('BRN 11 · FIN 9 · WIT 4 · GRT 13');
  });

  it('reveals monster entries in tiers at 0 (seen), 1 (basics), 10 (full stats) and 50 (lore and drops) kills (ETH-091)', async () => {
    const user = userEvent.setup();

    // Tier 0: seen only (0 kills) — name and riddle hint shown, no stats or full lore yet.
    bank({ [MONSTER_GLOAM_RAT.id]: ['seen'] });
    render(<CodexPanel />);
    await user.click(within(section('Monsters')).getByRole('button', { name: new RegExp(MONSTER_GLOAM_RAT.name) }));
    let detail = detailPane();
    expect(within(detail).getByText(MONSTER_GLOAM_RAT.hint ?? '')).toBeTruthy();
    expect(within(detail).queryByText(MONSTER_GLOAM_RAT.description)).toBeNull();
    expect(within(detail).queryByText('HP')).toBeNull();
    expect(within(detail).getByLabelText('Encounter record').textContent).toContain('Next tier at 1 kill (basics)');

    // Tier 1: 1 kill — reveals basics (Role, HP, Damage, Speed, Found on), still hides full stats and lore/drops.
    bank({ [MONSTER_GLOAM_RAT.id]: ['seen', 'killed'] }, { [MONSTER_GLOAM_RAT.id]: 1 });
    detail = detailPane();
    expect(within(detail).getByText('Role').nextSibling?.textContent).toBe('Skirmisher');
    expect(within(detail).getByText('HP').nextSibling?.textContent).toBe(String(MONSTER_GLOAM_RAT.stats.hp));
    expect(within(detail).getByText('Damage').nextSibling?.textContent).toBe('1–3 + 0');
    expect(within(detail).getByText('Speed').nextSibling?.textContent).toBe(String(MONSTER_GLOAM_RAT.stats.speed));
    expect(within(detail).getByText('Found on').nextSibling?.textContent).toBe('Floors 1–4');
    expect(within(detail).queryByText('Evasion')).toBeNull();
    expect(within(detail).queryByText('Behavior')).toBeNull();
    expect(within(detail).queryByText('Drops')).toBeNull();
    expect(within(detail).queryByText(MONSTER_GLOAM_RAT.description)).toBeNull();
    expect(within(detail).getByLabelText('Encounter record').textContent).toContain('Next tier at 10 kills (full stats)');

    // Tier 2: 10 kills — reveals full stats (Accuracy, Evasion, Armor, Threat, Crowds, Behavior, Variants met), still hides lore/drops.
    bank({ [MONSTER_GLOAM_RAT.id]: ['seen', 'killed'] }, { [MONSTER_GLOAM_RAT.id]: 10 });
    detail = detailPane();
    expect(within(detail).getByText('Evasion').nextSibling?.textContent).toBe(String(MONSTER_GLOAM_RAT.stats.evasion));
    expect(within(detail).getByText('Threat').nextSibling?.textContent).toBe(String(MONSTER_GLOAM_RAT.threat));
    expect(within(detail).getByText('Behavior')).toBeTruthy();
    expect(within(detail).queryByText('Drops')).toBeNull();
    expect(within(detail).queryByText(MONSTER_GLOAM_RAT.description)).toBeNull();
    expect(within(detail).getByLabelText('Encounter record').textContent).toContain('Next tier at 50 kills (lore and drops)');

    // Tier 3: 50 kills — reveals full lore description and Drops.
    bank({ [MONSTER_GLOAM_RAT.id]: ['seen', 'killed'] }, { [MONSTER_GLOAM_RAT.id]: 50 });
    detail = detailPane();
    expect(within(detail).getByText(MONSTER_GLOAM_RAT.description)).toBeTruthy();
    expect(within(detail).getByText('Drops').nextSibling?.textContent).toContain('1 Trophy on kill');
    expect(within(detail).getByLabelText('Encounter record').textContent).toContain('All tiers unlocked');
  });

  it('fills in live from the running sim before the run ends, including kill and death counts', async () => {
    const user = userEvent.setup();
    render(<CodexPanel />);
    expect(within(section('Dungeon features')).queryByText(FEATURE_DOOR.name)).toBeNull();
    act(() =>
      useSimStore.getState().receiveEvents([
        { type: 'doorOpened', actor: 1, door: 2, pos: { x: 1, y: 1 }, turn: 3 },
        {
          type: 'killed',
          killer: 1,
          killerDef: 'actor.adventurer',
          byParty: true,
          victim: 5,
          victimDef: MONSTER_GLOAM_RAT.id,
          threat: 1,
          floor: 'd1',
          pos: { x: 2, y: 1 },
          turn: 4,
        },
      ]),
    );
    expect(within(section('Dungeon features')).getByText(FEATURE_DOOR.name)).toBeTruthy();
    expect(within(section('Dungeon features')).getByText('Used')).toBeTruthy();

    await user.click(within(section('Monsters')).getByRole('button', { name: new RegExp(MONSTER_GLOAM_RAT.name) }));
    const record = within(detailPane()).getByLabelText('Encounter record');
    expect(record.textContent).toContain('Slain1');
    expect(record.textContent).toContain('Adventurers lost0');
  });

  it('searches known entries only, and filters by section', async () => {
    const user = userEvent.setup();
    bank({ [FEATURE_DOOR.id]: ['used'] });
    render(<CodexPanel />);
    const search = screen.getByRole('searchbox', { name: 'Search the Codex' });

    await user.type(search, 'hinges');
    expect(within(section('Dungeon features')).getByText(FEATURE_DOOR.name)).toBeTruthy();
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

  it('supports keyboard arrow navigation across entries in the list pane', async () => {
    const user = userEvent.setup();
    render(<CodexPanel />);
    await user.click(within(screen.getByRole('group', { name: 'Codex sections' })).getByRole('button', { name: 'Terrain' }));

    const wallBtn = within(section('Terrain')).getByRole('button', { name: new RegExp(TERRAIN_WALL.name) });
    wallBtn.focus();
    await user.keyboard('{ArrowDown}');
    const active = document.activeElement as HTMLElement | null;
    expect(active?.getAttribute('data-entry')).toBe('terrain.floor');
    expect(within(detailPane()).getByRole('heading', { name: 'Floor' })).toBeTruthy();

    await user.keyboard('{ArrowUp}');
    expect((document.activeElement as HTMLElement | null)?.getAttribute('data-entry')).toBe(TERRAIN_WALL.id);
  });

  it('collapses to one pane at tablet width with a Back to list button that restores focus', async () => {
    setNarrow(true);
    const user = userEvent.setup();
    render(<CodexPanel />);

    // List pane is shown first; detail pane is hidden until an entry is chosen.
    expect(screen.getByRole('searchbox', { name: 'Search the Codex' })).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Codex entry' })).toBeNull();

    const wallBtn = within(section('Terrain')).getByRole('button', { name: new RegExp(TERRAIN_WALL.name) });
    await user.click(wallBtn);

    expect(screen.queryByRole('searchbox', { name: 'Search the Codex' })).toBeNull();
    const detail = detailPane();
    expect(within(detail).getByRole('heading', { name: TERRAIN_WALL.name })).toBeTruthy();

    const backBtn = within(detail).getByRole('button', { name: /Back to list/ });
    await user.click(backBtn);

    expect(screen.getByRole('searchbox', { name: 'Search the Codex' })).toBeTruthy();
    expect((document.activeElement as HTMLElement | null)?.getAttribute('data-entry')).toBe(TERRAIN_WALL.id);
  });

  it('does not double-count adventurers lost once the run is banked, and avoids substring fallback on modern runs', async () => {
    const user = userEvent.setup();
    const fellMoment = {
      kind: 'adventurerFell',
      turn: 12,
      floor: 'd1',
      pos: { x: 2, y: 1 },
      depth: 1,
      actors: [1],
      ids: [MONSTER_GLOAM_RAT.id],
    };
    const result = {
      ...emptyRunResult('wipe' as const),
      extras: {
        'track.codex': { [MONSTER_GLOAM_RAT.id]: ['seen'], [STATUS_POISONED.id]: ['seen'] },
        'track.chronicle': [fellMoment],
        'run.party': [{ actor: 1, name: 'Mira', classId: 'class.vanguard', raceId: 'race.human' }],
        'track.deaths': {
          fallen: [{ actor: 1, depth: 1, turn: 12, how: 'was slain by a poisoned gloam rat' }],
        },
      },
    };
    act(() => {
      useProfileStore.setState({ profile: applyRunResult(newProfile(), result) });
      // Same chronicle still sits in simStore after run end, marked banked.
      useSimStore.setState({ chronicle: { entries: [fellMoment] }, banked: true });
    });

    render(<CodexPanel />);
    await user.click(within(section('Monsters')).getByRole('button', { name: new RegExp(MONSTER_GLOAM_RAT.name) }));
    const ratRecord = within(detailPane()).getByLabelText('Encounter record');
    expect(ratRecord.textContent).toContain('Adventurers lost1');

    // Modern run has `moments.length > 0` naming gloam rat, not status.poisoned: no substring false positive.
    await user.click(within(section('Statuses')).getByRole('button', { name: new RegExp(STATUS_POISONED.name) }));
    expect(within(detailPane()).queryByLabelText('Encounter record')).toBeNull();
  });

  it('omits the Slain row for non-monster entries that caused adventurer deaths', async () => {
    const user = userEvent.setup();
    const poisonDeath = {
      kind: 'adventurerFell',
      turn: 15,
      floor: 'd2',
      pos: { x: 1, y: 1 },
      depth: 2,
      actors: [1],
      ids: [STATUS_POISONED.id],
    };
    const result = {
      ...emptyRunResult('wipe' as const),
      extras: {
        'track.codex': { [STATUS_POISONED.id]: ['seen'] },
        'track.chronicle': [poisonDeath],
      },
    };
    act(() => {
      useProfileStore.setState({ profile: applyRunResult(newProfile(), result) });
    });

    render(<CodexPanel />);
    await user.click(within(section('Statuses')).getByRole('button', { name: new RegExp(STATUS_POISONED.name) }));
    const record = within(detailPane()).getByLabelText('Encounter record');
    expect(record.textContent).toContain('Adventurers lost1');
    expect(record.textContent).not.toContain('Slain');
  });
});

describe('CodexModal', () => {
  it('opens from CodexTab and returns focus to the launcher button when closed with Escape', async () => {
    const user = userEvent.setup();
    render(
      <>
        <CodexTab />
        <CodexModal />
      </>,
    );

    const openBtn = screen.getByRole('button', { name: 'Open Codex' });
    await user.click(openBtn);

    const dialog = screen.getByRole('dialog', { name: 'Codex' });
    expect(within(dialog).getByRole('searchbox', { name: 'Search the Codex' })).toBeTruthy();
    expect(within(dialog).getByRole('region', { name: 'Codex entry' })).toBeTruthy();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Codex' })).toBeNull();
    expect(document.activeElement).toBe(openBtn);
  });

  it('makes the narrow SideDrawer inert behind the Codex modal and restores it on close', async () => {
    setNarrow(true);
    const user = userEvent.setup();
    useUiStore.setState({ drawerOpen: false, codexOpen: false, tab: 'rules' });
    render(<AppShell />);

    await user.click(screen.getByRole('button', { name: /Panels/ }));
    const drawer = screen.getByRole('dialog', { name: 'Side panel' });
    await user.click(within(drawer).getByRole('tab', { name: 'Codex' }));
    await user.click(within(drawer).getByRole('button', { name: 'Open Codex' }));

    expect(screen.getByRole('dialog', { name: 'Codex' })).toBeTruthy();
    expect(drawer.closest('[inert]')).not.toBeNull();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Codex' })).toBeNull();
    expect(drawer.closest('[inert]')).toBeNull();
  });
});

describe('Explain', () => {
  it('shows only glyph and riddle hint for an undiscovered entry (ETH-091)', async () => {
    const user = userEvent.setup();
    render(<Explain id={ITEM_FLANGED_MACE.id} />);
    expect(screen.getByText(ITEM_FLANGED_MACE.name)).toBeTruthy();
    await user.tab();
    const tip = await screen.findByRole('tooltip');
    expect(tip.textContent).toContain('???');
    expect(tip.textContent).toContain(ITEM_FLANGED_MACE.glyph.ch);
    expect(tip.textContent).toContain(ITEM_FLANGED_MACE.hint ?? '');
    expect(tip.textContent).not.toContain(ITEM_FLANGED_MACE.description);
    expect(tip.textContent).not.toContain('StatsDamage +3');
  });

  it('names a discovered def and explains it in a tooltip on focus, with its key fields', async () => {
    const user = userEvent.setup();
    bank({ [CLASS_VANGUARD.id]: ['seen'] });
    render(<Explain id={CLASS_VANGUARD.id} />);
    expect(screen.getByText(CLASS_VANGUARD.name)).toBeTruthy();
    await user.tab();
    const tip = await screen.findByRole('tooltip');
    expect(tip.textContent).toContain(CLASS_VANGUARD.description);
    expect(tip.textContent).toContain('AttributesBRN 11 · FIN 9 · WIT 4 · GRT 13');
  });

  it('shows a discovered piece of gear’s slot, base type and stats (ETH-043)', async () => {
    const user = userEvent.setup();
    bank({ [ITEM_FLANGED_MACE.id]: ['seen'] });
    render(<Explain id={ITEM_FLANGED_MACE.id} />);
    await user.tab();
    const tip = await screen.findByRole('tooltip');
    expect(tip.textContent).toContain('WornMain hand · Mace');
    expect(tip.textContent).toContain('StatsDamage +3, Accuracy −1');
  });

  it('shows that a discovered ring fits either ring slot (ETH-111)', async () => {
    const user = userEvent.setup();
    bank({ [ITEM_OWL_EYE_RING.id]: ['seen'] });
    render(<Explain id={ITEM_OWL_EYE_RING.id} />);
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
