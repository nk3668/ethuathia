// @vitest-environment jsdom
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { decodeSave, encodeSave, newProfile } from '../../src/meta';
import { MemorySaveStore } from '../../src/platform';
import type { AutosaveTarget } from '../../src/platform';
import { emptyRunResult, favorKey } from '../../src/sim';
import { SaveOptions } from '../../src/ui/shell/SaveOptions';
import { TopBar } from '../../src/ui/shell/TopBar';
import { bindSaveStore, resetProfileStore, useProfileStore } from '../../src/ui/stores/profileStore';

/** Autosave never fires on its own in these tests; they call `save` directly. */
const quiet: AutosaveTarget = {
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
  setInterval: () => 0,
  clearInterval: () => undefined,
};

const run = (renown: number) => ({ ...emptyRunResult('victory' as const), atRisk: { renown, [favorKey('deity.dawn')]: 2 } });

beforeEach(resetProfileStore);
afterEach(resetProfileStore);

describe('profileStore', () => {
  it('starts a new profile when there is no save, banks runs and autosaves only when changed', async () => {
    const store = new MemorySaveStore();
    const { loaded, unbind } = bindSaveStore(store, { target: quiet });
    expect(useProfileStore.getState().status).toBe('loading');
    await loaded;
    expect(useProfileStore.getState().status).toBe('ready');

    await useProfileStore.getState().save();
    expect(store.data).toBeNull(); // nothing changed yet

    useProfileStore.getState().applyRunResult(run(1500));
    expect(useProfileStore.getState().dirty).toBe(true);
    await useProfileStore.getState().save();
    const saved = decodeSave(store.data ?? '');
    expect(saved.ok && saved.profile.currencies.renown).toBe(1500);
    expect(useProfileStore.getState().dirty).toBe(false);
    unbind();
  });

  it('loads an existing save', async () => {
    const profile = { ...newProfile(), currencies: { renown: 9, trophies: 1, favor: {} } };
    const { loaded } = bindSaveStore(new MemorySaveStore(encodeSave(profile, 5)), { target: quiet });
    await loaded;
    expect(useProfileStore.getState().profile).toEqual(profile);
    expect(useProfileStore.getState().lastSavedAt).toBe(5);
  });

  it('never overwrites a save it could not load, until an import or a hard reset', async () => {
    const store = new MemorySaveStore('{"format":"ethuathia.save","version":99}');
    const { loaded } = bindSaveStore(store, { target: quiet });
    await loaded;
    const state = useProfileStore.getState();
    expect(state.status).toBe('failed');
    expect(state.error).toMatch(/newer version/);
    state.applyRunResult(run(10));
    await useProfileStore.getState().save(true);
    expect(store.data).toBe('{"format":"ethuathia.save","version":99}');

    await useProfileStore.getState().hardReset();
    expect(useProfileStore.getState().status).toBe('ready');
    expect(decodeSave(store.data ?? '')).toMatchObject({ ok: true, profile: newProfile() });
  });

  it('imports a valid save and refuses an invalid one without changing anything', async () => {
    const store = new MemorySaveStore();
    await bindSaveStore(store, { target: quiet }).loaded;
    const bad = await useProfileStore.getState().importSave('nope');
    expect(bad).toMatchObject({ ok: false });
    expect(useProfileStore.getState().profile).toEqual(newProfile());

    const profile = { ...newProfile(), currencies: { renown: 3, trophies: 0, favor: {} } };
    expect(await useProfileStore.getState().importSave(encodeSave(profile, 1))).toEqual({ ok: true });
    expect(useProfileStore.getState().profile).toEqual(profile);
    expect(decodeSave(store.data ?? '')).toMatchObject({ ok: true, profile });
  });
});

describe('top bar and Options', () => {
  it('shows banked currencies from the profile, formatted with suffixes', async () => {
    await bindSaveStore(new MemorySaveStore(), { target: quiet }).loaded;
    act(() => useProfileStore.getState().applyRunResult(run(12_400)));
    render(<TopBar narrow={false} drawerOpen={false} drawerId="d" onToggleDrawer={() => undefined} />);
    const list = screen.getByRole('list', { name: 'Banked currencies' });
    expect(list.textContent).toBe('♛Renown12.4k☠Trophies0♨Favor2');
  });

  it('exports, imports and hard-resets from the Options section, with a confirmation', async () => {
    const user = userEvent.setup();
    const store = new MemorySaveStore();
    await bindSaveStore(store, { target: quiet }).loaded;
    act(() => useProfileStore.getState().applyRunResult(run(50)));
    render(<SaveOptions />);

    await user.click(screen.getByRole('button', { name: 'Export as text' }));
    const box = screen.getByRole('textbox', { name: 'Save text' });
    const exported = (box as HTMLTextAreaElement).value;
    expect(decodeSave(exported)).toMatchObject({ ok: true, profile: { currencies: { renown: 50 } } });

    await user.click(screen.getByRole('button', { name: 'Hard reset…' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(useProfileStore.getState().profile.currencies.renown).toBe(50);
    await user.click(screen.getByRole('button', { name: 'Hard reset…' }));
    await user.click(screen.getByRole('button', { name: 'Erase everything' }));
    expect(useProfileStore.getState().profile).toEqual(newProfile());

    await user.click(screen.getByRole('button', { name: 'Import text' }));
    expect(useProfileStore.getState().profile.currencies.renown).toBe(50);
    expect(within(document.body).getAllByRole('status').some((el) => el.textContent?.includes('Save imported.'))).toBe(true);

    await user.clear(box);
    await user.type(box, 'garbage');
    await user.click(screen.getByRole('button', { name: 'Import text' }));
    expect(screen.getAllByRole('status').some((el) => el.textContent?.includes('Import failed'))).toBe(true);
  });
});
