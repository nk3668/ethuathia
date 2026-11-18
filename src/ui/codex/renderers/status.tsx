/** Codex view of timed statuses (buffs and debuffs, ETH-057). */
import { DEFAULT_MAX_STACKS, STATUSES, statusGroup } from '../../../content';
import type { Effect, StatusDef } from '../../../content';
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

/** The bundle in words: "Speed ×1.5", "Sight −3", "turn start: heals 1 HP". */
function bundleText(def: StatusDef): string {
  const parts = (def.bundle.modifiers ?? []).map((m) =>
    m.op === 'add' ? `${statLabel(m.stat)} ${m.value >= 0 ? '+' : '−'}${Math.abs(m.value)}` : `${statLabel(m.stat)} ×${m.value}`,
  );
  for (const t of def.bundle.triggers ?? []) {
    const when = t.on === 'trigger.turn_start' ? 'each turn' : t.on === 'trigger.turn_end' ? 'at turn end' : t.on;
    parts.push(`${when}: ${t.effects.map(effectText).join(', ')}`);
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
    { label: 'Effect', value: bundleText(def), hint: 'What it does while it lasts, at normal strength.', key: true },
    {
      label: 'Stacking',
      value: def.stacking === 'stack' ? `${STACKING_TEXT.stack} (up to ${def.maxStacks ?? DEFAULT_MAX_STACKS})` : STACKING_TEXT[def.stacking],
      hint: `What happens when it lands again while active.${def.group !== undefined ? ` Shares its slot with others of group ${statusGroup(def)}.` : ''}`,
    },
    { label: 'Kind', value: def.harmful ? 'Harmful' : 'Helpful', hint: 'Harmful statuses are debuffs.', key: true },
  ],
});
