/** Codex view of timed statuses (buffs and debuffs, ETH-057). */
import { DEFAULT_MAX_STACKS, STATUSES, statusGroup } from '../../../content';
import type { Bundle, Effect, StatusDef } from '../../../content';
import { isStatId, STAT_INFO } from '../../../sim';
import { defineCodexRenderer } from '../types';

const STACKING_TEXT: Readonly<Record<StatusDef['stacking'], string>> = {
  refresh: 'Refreshes: the longer duration and the stronger dose win',
  extend: 'Extends: more turns are added',
  stack: 'Stacks: each dose runs on its own',
};

function statLabel(stat: string): string {
  return isStatId(stat) ? STAT_INFO[stat].label : stat;
}

/** One effect in words: "heals 8 HP", "applies Queasy for 20 turns". Also used by the draught renderer. */
export function effectText(effect: Effect): string {
  switch (effect.kind) {
    case 'heal':
      return `heals ${effect.amount} HP`;
    case 'damage':
      return `deals ${effect.amount} damage`;
    case 'applyStatus':
      return `applies ${STATUSES.has(effect.status) ? STATUSES.get(effect.status).name : effect.status} for ${effect.turns} turns`;
  }
}

/** A stat change in words: "Speed ×1.5", "Sight −3". Also used by the template renderer. */
export function changeText(stat: string, op: 'add' | 'mul', value: number): string {
  return op === 'add' ? `${statLabel(stat)} ${value >= 0 ? '+' : '−'}${Math.abs(value)}` : `${statLabel(stat)} ×${value}`;
}

const TRIGGER_WORDS: Readonly<Record<string, string>> = {
  'trigger.turn_start': 'each turn',
  'trigger.turn_end': 'at turn end',
  'trigger.hit': 'on a hit',
  'trigger.struck': 'when struck',
};

/** A bundle in words: "Speed ×1.5", "Sight −3", "each turn: heals 1 HP". Also used by the template renderer. */
export function bundleText(bundle: Bundle): string {
  const parts = (bundle.modifiers ?? []).map((m) => changeText(m.stat, m.op, m.value));
  for (const t of bundle.triggers ?? []) {
    parts.push(`${TRIGGER_WORDS[t.on] ?? t.on}: ${t.effects.map((e) => `${effectText(e)}${e.to === 'other' ? ' to the other' : ''}`).join(', ')}`);
  }
  return parts.length > 0 ? parts.join('; ') : 'No effect';
}

export default defineCodexRenderer({
  registry: STATUSES,
  label: 'Statuses',
  order: 45,
  hint: 'Have an adventurer gain it to learn about it.',
  group: (def) => (def.harmful ? 'Harmful' : 'Helpful'),
  fields: (def) => [
    { label: 'Effect', value: bundleText(def.bundle), hint: 'What it does while it lasts, at normal strength.', key: true },
    {
      label: 'Stacking',
      value: def.stacking === 'stack' ? `${STACKING_TEXT.stack} (up to ${def.maxStacks ?? DEFAULT_MAX_STACKS})` : STACKING_TEXT[def.stacking],
      hint: `What happens when it lands again while active.${def.group !== undefined ? ` Shares its slot with others of group ${statusGroup(def)}.` : ''}`,
    },
    { label: 'Kind', value: def.harmful ? 'Harmful' : 'Helpful', hint: 'Harmful statuses are debuffs.', key: true },
  ],
});
