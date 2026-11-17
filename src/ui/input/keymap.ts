/**
 * The keymap (docs/ARCHITECTURE.md §8.3): one table that maps keys to actions. The in-run screen
 * listens with `useKeymap`; buttons read the table to show their key in tooltips and in
 * `aria-keyshortcuts`. Rebinding later means editing this table.
 *
 * Keys are matched by `KeyboardEvent.code`, the physical key, so the digits sit in the same
 * place on every layout (AZERTY needs Shift for them otherwise). The number row is used, not the
 * numpad, which is kept for movement while possessing an adventurer.
 */
import type { RunningSpeed } from '../stores/simStore';

/** What a key does. Sim commands (movement while possessed) join this union later. */
export type KeyAction = { type: 'togglePause' } | { type: 'setSpeed'; speed: RunningSpeed };

export interface KeyBinding {
  /** `KeyboardEvent.code` of the key. */
  code: string;
  /** How the key is written for people, and in `aria-keyshortcuts`. */
  label: string;
  action: KeyAction;
}

export const KEYMAP: readonly KeyBinding[] = [
  { code: 'Space', label: 'Space', action: { type: 'togglePause' } },
  { code: 'Digit1', label: '1', action: { type: 'setSpeed', speed: 1 } },
  { code: 'Digit2', label: '2', action: { type: 'setSpeed', speed: 2 } },
  { code: 'Digit3', label: '3', action: { type: 'setSpeed', speed: 4 } },
  { code: 'Digit4', label: '4', action: { type: 'setSpeed', speed: 8 } },
  { code: 'Digit5', label: '5', action: { type: 'setSpeed', speed: 'max' } },
];

function sameAction(a: KeyAction, b: KeyAction): boolean {
  return a.type === b.type && (a.type !== 'setSpeed' || (b.type === 'setSpeed' && a.speed === b.speed));
}

/** The labels of the keys bound to `action`, e.g. `['Space']`. */
export function keysFor(action: KeyAction, keymap: readonly KeyBinding[] = KEYMAP): string[] {
  return keymap.filter((binding) => sameAction(binding.action, action)).map((binding) => binding.label);
}

/** The subset of `KeyboardEvent` the keymap looks at. */
export type KeyPress = Pick<
  KeyboardEvent,
  'code' | 'target' | 'ctrlKey' | 'altKey' | 'metaKey' | 'isComposing' | 'defaultPrevented'
>;

/** Input types that take typed text. Typing a digit or a space into them is never a shortcut. */
const TEXT_INPUT_TYPES = new Set([
  'text',
  'search',
  'email',
  'url',
  'tel',
  'password',
  'number',
  'date',
  'datetime-local',
  'month',
  'week',
  'time',
]);

/** Roles whose own meaning for Space (toggle, choose) wins over pausing. */
const SPACE_ROLES = new Set(['checkbox', 'radio', 'switch', 'option', 'menuitemcheckbox', 'menuitemradio']);

/** Whether the element takes typed text: a text field, a textarea, a select or editable content. */
export function takesText(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  return target instanceof HTMLInputElement && TEXT_INPUT_TYPES.has(target.type);
}

/** Whether Space on this element toggles or chooses it (a checkbox, a radio, a switch). */
function spaceTogglesIt(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target instanceof HTMLInputElement && (target.type === 'checkbox' || target.type === 'radio')) return true;
  return SPACE_ROLES.has(target.getAttribute('role') ?? '');
}

/**
 * The binding a key press triggers, or `undefined` when it triggers none: no key in the table,
 * a modifier held (Ctrl+1 belongs to the browser), a key another handler already took, typing in
 * a text field, or Space on a control that Space toggles.
 *
 * Space on a button pauses rather than pressing the button, so pausing works wherever focus was
 * left by a click. Enter still presses a focused button.
 */
export function bindingFor(event: KeyPress, keymap: readonly KeyBinding[] = KEYMAP): KeyBinding | undefined {
  if (event.defaultPrevented || event.isComposing) return undefined;
  if (event.ctrlKey || event.altKey || event.metaKey) return undefined;
  const binding = keymap.find((b) => b.code === event.code);
  if (!binding) return undefined;
  if (takesText(event.target)) return undefined;
  if (binding.code === 'Space' && spaceTogglesIt(event.target)) return undefined;
  return binding;
}
