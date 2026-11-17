import { useEffect } from 'react';
import { useSimStore } from '../stores/simStore';
import { bindingFor, KEYMAP } from './keymap';
import type { KeyAction, KeyBinding } from './keymap';

/** Carries out a keymap action. The speed actions go to the sim through `simStore`. */
export function runKeyAction(action: KeyAction): void {
  const sim = useSimStore.getState();
  switch (action.type) {
    case 'togglePause':
      sim.togglePause();
      break;
    case 'setSpeed':
      sim.setSpeed(action.speed);
      break;
  }
}

/**
 * Listens for the keymap's keys on the window while the calling component is mounted. Handlers
 * on focused elements run first, so a key the map, the tabs or the log handle (and mark with
 * `preventDefault`) never reaches the keymap.
 *
 * A key the keymap takes has its default prevented on keydown and on the matching keyup, so
 * Space never also presses a focused button (browsers press it on keyup) or scrolls. Holding a
 * key down acts once.
 */
export function useKeymap(keymap: readonly KeyBinding[] = KEYMAP): void {
  useEffect(() => {
    const taken = new Set<string>();
    const onKeyDown = (event: KeyboardEvent) => {
      const binding = bindingFor(event, keymap);
      if (!binding) return;
      event.preventDefault();
      taken.add(event.code);
      if (!event.repeat) runKeyAction(binding.action);
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
