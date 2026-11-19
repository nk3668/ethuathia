/** Codex view of monster templates (ETH-117): the variants a monster can come in, such as Venomous or Swift. */
import { MONSTER_TEMPLATES, ROLE_INFO, STATUSES } from '../../../content';
import type { MonsterTemplateDef } from '../../../content';
import { defineCodexRenderer } from '../types';
import type { CodexField } from '../types';
import { bundleText, changeText } from './status';

/** Its stat changes and traits in words: "Speed ×1.3", "on a hit: applies Poisoned for 4 turns to the other". */
function effectText(def: MonsterTemplateDef): string {
  const parts: string[] = [];
  for (const [stat, value] of Object.entries(def.stats?.add ?? {})) parts.push(changeText(stat, 'add', value));
  for (const [stat, value] of Object.entries(def.stats?.mul ?? {})) parts.push(changeText(stat, 'mul', value));
  if (def.bundle !== undefined) parts.push(bundleText(def.bundle));
  return parts.length > 0 ? parts.join('; ') : 'No change to its numbers';
}

function powerFields(def: MonsterTemplateDef): CodexField[] {
  const rows: CodexField[] = [];
  const { bolt, mend, bolster } = def.powers ?? {};
  if (bolt !== undefined) {
    rows.push({ label: 'Ranged', value: `${bolt.range} tiles`, hint: `Hurls a ${bolt.name} at an adventurer it can see this far away.` });
  }
  if (mend !== undefined) rows.push({ label: 'Mends', value: `${mend.amount} HP`, hint: `Heals a hurt ally within ${mend.range} tiles.` });
  if (bolster !== undefined) {
    const status = STATUSES.has(bolster.status) ? STATUSES.get(bolster.status).name : bolster.status;
    rows.push({ label: 'Bolsters', value: `${bolster.turns} turns`, hint: `Gives a fighting ally within ${bolster.range} tiles ${status}.` });
  }
  return rows;
}

export default defineCodexRenderer({
  registry: MONSTER_TEMPLATES,
  label: 'Monster variants',
  order: 31,
  hint: 'See a monster that carries it.',
  fields: (def) => [
    { label: 'Name', value: [def.prefix, '…', def.suffix].filter((p) => p !== undefined).join(' '), hint: 'How it changes the monster’s name.' },
    { label: 'Effect', value: effectText(def), hint: 'What it adds to the monster, at full strength.', key: true },
    ...(def.role === undefined
      ? []
      : [{ label: 'Fights as', value: ROLE_INFO[def.role].name, hint: ROLE_INFO[def.role].description, key: true }]),
    ...powerFields(def),
    {
      label: 'Threat',
      value: `×${def.threatMul}`,
      hint: 'Multiplies the monster’s threat, so killing it is worth more Trophies and XP.',
      key: true,
    },
    { label: 'Loot tier', value: def.lootTier, hint: 'Monsters of a higher tier will drop better loot (0 is the plain table).' },
    {
      label: 'Found on',
      value: def.families === undefined ? 'Any monster' : def.families.map((f) => f.replace(/_/g, ' ')).join(', '),
      hint: 'The kinds of monster it can appear on.',
    },
  ],
});
