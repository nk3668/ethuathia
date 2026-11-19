/**
 * The keymap (docs/ARCHITECTURE.md §8.3): one table that maps keys to actions. The in-run screen
 * listens with `useKeymap`; buttons read the table to show their key in tooltips and in
 * `aria-keyshortcuts`. Rebinding later means editing this table.
 *
 * Keys are matched by `KeyboardEvent.code`, the physical key, so the digits sit in the same
 * place on every layout (AZERTY needs Shift for them otherwise). The number row is used, not the
 * numpad, which is kept for movement while possessing an adventurer.
 *
 * While an adventurer is possessed (ETH-066) the `POSSESSED_KEYS` join in: WASD and Q/E/Z/C,
 * the arrows and the numpad move it, and a few more keys act. They are free otherwise.
 *
 * `Tab` is deliberately not bound: it moves keyboard focus, and taking it would strand keyboard
 * users (docs/VISUAL-DESIGN.md §7). `]` and `[` cycle the selected adventurer instead.
 */
import type { ActionRequest } from '../../sim';
import type { RunningSpeed } from '../stores/simStore';

/** What a key does. */
export type KeyAction =
  | { type: 'togglePause' }
  | { type: 'setSpeed'; speed: RunningSpeed }
  /** Select the next (`1`) or previous (`-1`) living party member, wrapping around. */
  | { type: 'cycleSelection'; step: 1 | -1 }
  /** Possess the selected adventurer, or release the possessed one (ETH-066). */
  | { type: 'togglePossession' }
  /**
   * What the possessed adventurer does (ETH-066): any sim action, sent as a `playerAction`.
   * Movement keys send `bump`, which attacks, opens or swaps when that is what stepping means. A
   * new player action (use, cast, pray) is one more binding with its request.
   */
  | { type: 'act'; action: ActionRequest };

/** When a binding applies: always, or only while an adventurer is possessed. */
export type KeyContext = 'always' | 'possessed';

export interface KeyBinding {
  /** `KeyboardEvent.code` of the key. */
  code: string;
  /** How the key is written for people, and in `aria-keyshortcuts`. */
  label: string;
  action: KeyAction;
  /** Set when Shift must be held (`true`) or must not be (`false`); left out, Shift doesn't matter. */
  shift?: boolean;
  /**
   * `possessed`: only while an adventurer is possessed, so these keys stay free otherwise (Q and E
   * are to cycle adventurers then, ETH-090). Default `always`.
   */
  when?: KeyContext;
  /** Holding the key down repeats the action (walking). Default: it acts once. */
  repeat?: boolean;
}

/** The eight steps, keyed by their compass name. */
const STEP = {
  n: { x: 0, y: -1 },
  ne: { x: 1, y: -1 },
  e: { x: 1, y: 0 },
  se: { x: 1, y: 1 },
  s: { x: 0, y: 1 },
  sw: { x: -1, y: 1 },
  w: { x: -1, y: 0 },
  nw: { x: -1, y: -1 },
} as const;

/** A movement key of a possessed adventurer: step, or attack, open or swap by bumping. */
function moveKey(code: string, label: string, dir: keyof typeof STEP): KeyBinding {
  return { code, label, action: { type: 'act', action: { id: 'bump', dir: { ...STEP[dir] } } }, when: 'possessed', repeat: true };
}

/** Another action of a possessed adventurer. */
function actKey(code: string, label: string, action: ActionRequest, extra: Partial<KeyBinding> = {}): KeyBinding {
  return { code, label, action: { type: 'act', action }, when: 'possessed', ...extra };
}

/**
 * Possession's keys (ETH-066, CLAUDE.md §8): WASD with Q/E/Z/C for diagonals, the arrows and the
 * numpad move or bump-attack; `.`, X or numpad 5 wait; G picks up; `>` and `<` take the stairs;
 * F drinks from the fountain underfoot. Equipping and taking off gear are buttons in the pack.
 */
export const POSSESSED_KEYS: readonly KeyBinding[] = [
  moveKey('KeyW', 'W', 'n'),
  moveKey('KeyA', 'A', 'w'),
  moveKey('KeyS', 'S', 's'),
  moveKey('KeyD', 'D', 'e'),
  moveKey('KeyQ', 'Q', 'nw'),
  moveKey('KeyE', 'E', 'ne'),
  moveKey('KeyZ', 'Z', 'sw'),
  moveKey('KeyC', 'C', 'se'),
  moveKey('ArrowUp', 'ArrowUp', 'n'),
  moveKey('ArrowDown', 'ArrowDown', 's'),
  moveKey('ArrowLeft', 'ArrowLeft', 'w'),
  moveKey('ArrowRight', 'ArrowRight', 'e'),
  moveKey('Numpad8', 'Numpad8', 'n'),
  moveKey('Numpad9', 'Numpad9', 'ne'),
  moveKey('Numpad6', 'Numpad6', 'e'),
  moveKey('Numpad3', 'Numpad3', 'se'),
  moveKey('Numpad2', 'Numpad2', 's'),
  moveKey('Numpad1', 'Numpad1', 'sw'),
  moveKey('Numpad4', 'Numpad4', 'w'),
  moveKey('Numpad7', 'Numpad7', 'nw'),
  actKey('Period', '>', { id: 'stairs', dir: 'down' }, { shift: true }),
  actKey('Comma', '<', { id: 'stairs', dir: 'up' }, { shift: true }),
  actKey('Period', '.', { id: 'wait' }, { shift: false, repeat: true }),
  actKey('KeyX', 'X', { id: 'wait' }, { repeat: true }),
  actKey('Numpad5', 'Numpad5', { id: 'wait' }, { repeat: true }),
  actKey('KeyG', 'G', { id: 'pickup' }),
  actKey('KeyF', 'F', { id: 'drink' }),
];

export const KEYMAP: readonly KeyBinding[] = [
  { code: 'Space', label: 'Space', action: { type: 'togglePause' } },
  { code: 'Digit1', label: '1', action: { type: 'setSpeed', speed: 1 } },
  { code: 'Digit2', label: '2', action: { type: 'setSpeed', speed: 2 } },
  { code: 'Digit3', label: '3', action: { type: 'setSpeed', speed: 4 } },
  { code: 'Digit4', label: '4', action: { type: 'setSpeed', speed: 8 } },
  { code: 'Digit5', label: '5', action: { type: 'setSpeed', speed: 'max' } },
  { code: 'BracketRight', label: ']', action: { type: 'cycleSelection', step: 1 } },
  { code: 'BracketLeft', label: '[', action: { type: 'cycleSelection', step: -1 } },
  { code: 'KeyP', label: 'P', action: { type: 'togglePossession' } },
  ...POSSESSED_KEYS,
];

function sameAction(a: KeyAction, b: KeyAction): boolean {
  switch (a.type) {
    case 'togglePause':
      return b.type === 'togglePause';
    case 'setSpeed':
      return b.type === 'setSpeed' && a.speed === b.speed;
    case 'cycleSelection':
      return b.type === 'cycleSelection' && a.step === b.step;
    case 'togglePossession':
      return b.type === 'togglePossession';
    case 'act':
      return b.type === 'act' && JSON.stringify(a.action) === JSON.stringify(b.action);
  }
}

/** The labels of the keys bound to `action`, e.g. `['Space']`. */
export function keysFor(action: KeyAction, keymap: readonly KeyBinding[] = KEYMAP): string[] {
  return keymap.filter((binding) => sameAction(binding.action, action)).map((binding) => binding.label);
}

/**
 * The keys for `action`, ready for a control: `keys` goes into `aria-keyshortcuts` (empty when
 * nothing is bound) and `hint` into its tooltip, e.g. "Key: Space" (empty when nothing is bound).
 */
export function keyHint(action: KeyAction, keymap: readonly KeyBinding[] = KEYMAP): { keys: string; hint: string } {
  const keys = keysFor(action, keymap);
  return { keys: keys.join(' '), hint: keys.length === 0 ? '' : `Key: ${keys.join(' or ')}` };
}

/** The subset of `KeyboardEvent` the keymap looks at. */
export type KeyPress = Pick<
  KeyboardEvent,
  'code' | 'target' | 'ctrlKey' | 'altKey' | 'metaKey' | 'isComposing' | 'defaultPrevented'
> & {
  /** Shift, for the keys that care (the stairs). Left out counts as not held. */
  shiftKey?: boolean;
};

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
 *
 * `possessed` says whether an adventurer is possessed: the `possessed` bindings (movement and
 * the other player actions, ETH-066) only match then.
 */
export function bindingFor(
  event: KeyPress,
  keymap: readonly KeyBinding[] = KEYMAP,
  possessed = false,
): KeyBinding | undefined {
  if (event.defaultPrevented || event.isComposing) return undefined;
  if (event.ctrlKey || event.altKey || event.metaKey) return undefined;
  const binding = keymap.find(
    (b) =>
      b.code === event.code &&
      (b.shift === undefined || b.shift === (event.shiftKey ?? false)) &&
      ((b.when ?? 'always') === 'always' || possessed),
  );
  if (!binding) return undefined;
  if (takesText(event.target)) return undefined;
  if (binding.code === 'Space' && spaceTogglesIt(event.target)) return undefined;
  return binding;
}
