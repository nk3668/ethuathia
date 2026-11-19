import { useEffect } from 'react';
import type { EntityId, Snapshot } from '../../sim';
import { useSimStore } from '../stores/simStore';
import { cycleSelection, useUiStore } from '../stores/uiStore';
import { bindingFor, KEYMAP } from './keymap';
import type { KeyAction, KeyBinding } from './keymap';

/** The living adventurer the player possesses (ETH-066), or `null`. */
export function possessedId(snapshot: Snapshot | null): EntityId | null {
  return snapshot?.party.find((m) => m.possessed && m.alive)?.id ?? null;
}

/**
 * Possesses the selected adventurer (or the first living one, which is then selected), or
 * releases the one possessed (ETH-066). Possessing selects the adventurer, so the map follows it.
 */
export function togglePossession(): void {
  const sim = useSimStore.getState();
  const ui = useUiStore.getState();
  const snapshot = sim.snapshot;
  if (snapshot === null) return;
  const possessed = possessedId(snapshot);
  const selected = snapshot.party.find((m) => m.id === ui.selected && m.alive);
  if (possessed !== null && (selected === undefined || selected.id === possessed)) {
    sim.send({ type: 'release', actor: possessed });
    return;
  }
  const target = selected ?? snapshot.party.find((m) => m.alive);
  if (target === undefined) return;
  ui.select(target.id);
  sim.send({ type: 'possess', actor: target.id });
}

/**
 * Carries out a keymap action. The speed actions go to the sim through `simStore`; cycling the
 * selection changes `uiStore` only; possession and the possessed adventurer's actions are sent to
 * the sim as commands.
 */
export function runKeyAction(action: KeyAction): void {
  const sim = useSimStore.getState();
  switch (action.type) {
    case 'togglePause':
      sim.togglePause();
      break;
    case 'setSpeed':
      sim.setSpeed(action.speed);
      break;
    case 'cycleSelection': {
      // The map's follow camera and the party cards both read `selected`, so they move with it.
      const ui = useUiStore.getState();
      ui.select(cycleSelection(sim.snapshot?.party ?? [], ui.selected, action.step));
      break;
    }
    case 'togglePossession':
      togglePossession();
      break;
    case 'act': {
      const actor = possessedId(sim.snapshot);
      if (actor !== null) sim.send({ type: 'playerAction', actor, action: action.action });
      break;
    }
  }
}

/**
 * Listens for the keymap's keys on the window while the calling component is mounted. Handlers
 * on focused elements run first, so a key the map, the tabs or the log handle (and mark with
 * `preventDefault`) never reaches the keymap.
 *
 * A key the keymap takes has its default prevented on keydown and on the matching keyup, so
 * Space never also presses a focused button (browsers press it on keyup) or scrolls. Holding a
 * key down acts once, except for bindings marked `repeat` (walking a possessed adventurer). The
 * possessed-only bindings apply while the latest snapshot has a living possessed adventurer.
 */
export function useKeymap(keymap: readonly KeyBinding[] = KEYMAP): void {
  useEffect(() => {
    const taken = new Set<string>();
    const onKeyDown = (event: KeyboardEvent) => {
      const possessed = possessedId(useSimStore.getState().snapshot) !== null;
      const binding = bindingFor(event, keymap, possessed);
      if (!binding) return;
      event.preventDefault();
      taken.add(event.code);
      if (!event.repeat || binding.repeat === true) runKeyAction(binding.action);
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (taken.delete(event.code)) event.preventDefault();
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [keymap]);
}
