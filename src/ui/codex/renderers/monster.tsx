/**
 * Codex view of monsters (ETH-060, ETH-091): their numbers, their role (ETH-040), where they live,
 * how they behave, and their lore and drops. Revealed in kill-count tiers:
 * - 1 kill (`MONSTER_KILL_TIERS.basics`): basic stats (Role, HP, Damage, Speed, Found on).
 * - 10 kills (`MONSTER_KILL_TIERS.stats`): full stats (Accuracy, Evasion, Armor, role powers,
 *   Threat, Crowds, Behavior, Variants met).
 * - 50 kills (`MONSTER_KILL_TIERS.lore`): full lore (`def.description`) and drops (`Drops`).
 */
import { MONSTERS, monsterRules, ROLE_INFO, STATUSES } from '../../../content';
import type { MonsterDef } from '../../../content';
import { trophiesForKill } from '../../../sim';
import { defineCodexRenderer } from '../types';
import { VariantsMet } from '../VariantsMet';
import type { CodexField } from '../types';
import { bundleText } from './status';

/** Monster kill-count tiers (ETH-091). */
export const MONSTER_KILL_TIERS = {
  basics: 1,
  stats: 10,
  lore: 50,
} as const;

/** How a monster's rule set reads, from the rule actions it can take. */
function behaviorText(def: MonsterDef): string {
  const actions = new Set(monsterRules(def).map((r) => r.action.id));
  const parts: string[] = [];
  if (actions.has('act.flee')) parts.push('runs when badly hurt');
  if (actions.has('act.mend_ally')) parts.push('mends hurt kin');
  if (actions.has('act.bolster_ally')) parts.push('spurs on kin in a fight');
  if (actions.has('act.cast_bolt')) parts.push('attacks from range');
  if (actions.has('act.fall_back')) parts.push('steps back out of reach');
  if (actions.has('act.attack_adjacent')) parts.push('fights whoever is next to it');
  if (actions.has('act.surround')) parts.push('spreads out around its prey');
  if (actions.has('act.approach_enemy')) parts.push('closes in on adventurers it sees');
  if (actions.has('act.hang_back')) parts.push('hangs back behind its kin');
  if (actions.has('act.wander')) parts.push('roams otherwise');
  const text = parts.join(', ');
  return text === '' ? 'Keeps to itself' : text.charAt(0).toUpperCase() + text.slice(1);
}

function dangerText(def: MonsterDef): string {
  return def.danger.max >= 99 ? `Danger ${def.danger.min}+` : `Danger ${def.danger.min}–${def.danger.max}`;
}

function dropsText(def: MonsterDef): string {
  const trophies = trophiesForKill(def.threat);
  const trophyWord = trophies === 1 ? '1 Trophy' : `${trophies} Trophies`;
  return `${trophyWord} on kill; variant and elite kin drop carried floor loot (${dangerText(def).toLowerCase()}).`;
}

/** Rows for the role powers a def has (revealed at the full-stats tier). */
function powerFields(def: MonsterDef): CodexField[] {
  const rows: CodexField[] = [];
  if (def.bolt !== undefined) {
    rows.push({
      label: 'Ranged',
      value: `${def.bolt.range} tiles`,
      hint: `Hurls a ${def.bolt.name} at an adventurer it can see this far away, with the same hit and damage as a blow.`,
      minKills: MONSTER_KILL_TIERS.stats,
    });
  }
  if (def.mend !== undefined) {
    rows.push({
      label: 'Mends',
      value: `${def.mend.amount} HP`,
      hint: `Heals a hurt ally it can see within ${def.mend.range} tiles.`,
      minKills: MONSTER_KILL_TIERS.stats,
    });
  }
  if (def.bolster !== undefined) {
    const status = STATUSES.has(def.bolster.status) ? STATUSES.get(def.bolster.status).name : def.bolster.status;
    rows.push({
      label: 'Bolsters',
      value: `${def.bolster.turns} turns`,
      hint: `Gives an ally fighting within ${def.bolster.range} tiles a status (${status}) for this long.`,
      minKills: MONSTER_KILL_TIERS.stats,
    });
  }
  return rows;
}

export default defineCodexRenderer({
  registry: MONSTERS,
  label: 'Monsters',
  order: 30,
  hint: 'See or slay one in the dungeon.',
  killTiers: [
    { kills: MONSTER_KILL_TIERS.basics, label: 'basics' },
    { kills: MONSTER_KILL_TIERS.stats, label: 'full stats' },
    { kills: MONSTER_KILL_TIERS.lore, label: 'lore and drops' },
  ],
  loreKills: MONSTER_KILL_TIERS.lore,
  group: (def) => ROLE_INFO[def.role].plural,
  fields: (def) => [
    { label: 'Role', value: ROLE_INFO[def.role].name, hint: ROLE_INFO[def.role].description, key: true, minKills: MONSTER_KILL_TIERS.basics },
    { label: 'HP', value: def.stats.hp, hint: 'Hit points when unhurt.', key: true, minKills: MONSTER_KILL_TIERS.basics },
    {
      label: 'Damage',
      value: `1–3 + ${def.stats.damage}`,
      hint: 'What a blow that lands does, before the target’s armor (never below 1).',
      key: true,
      minKills: MONSTER_KILL_TIERS.basics,
    },
    { label: 'Accuracy', value: def.stats.accuracy, hint: 'Each point adds 5% to its chance to hit, against your evasion.', minKills: MONSTER_KILL_TIERS.stats },
    { label: 'Evasion', value: def.stats.evasion, hint: 'Each point takes 5% off your chance to hit it.', minKills: MONSTER_KILL_TIERS.stats },
    { label: 'Armor', value: def.stats.armor, hint: 'Taken off the damage of each blow that lands on it.', minKills: MONSTER_KILL_TIERS.stats },
    { label: 'Speed', value: def.stats.speed, hint: 'Energy gained each tick; 100 acts once a turn.', key: true, minKills: MONSTER_KILL_TIERS.basics },
    ...powerFields(def),
    ...(def.bundle === undefined
      ? []
      : [{ label: 'Traits', value: bundleText(def.bundle), hint: 'Innate abilities and passives of this kind.', minKills: MONSTER_KILL_TIERS.stats }]),
    { label: 'Found on', value: dangerText(def), hint: 'The Danger range it appears in.', minKills: MONSTER_KILL_TIERS.basics },
    { label: 'Threat', value: def.threat, hint: 'How dangerous it is. Kills of it are weighed by this.', minKills: MONSTER_KILL_TIERS.stats },
    {
      label: 'Crowds',
      value: def.sharesTile === true ? 'Yes' : 'No',
      hint: 'Small folk and swarms can share a tile with others of their sort; everyone else needs a tile of their own.',
      minKills: MONSTER_KILL_TIERS.stats,
    },
    { label: 'Behavior', value: behaviorText(def), hint: 'The rules it follows each turn.', minKills: MONSTER_KILL_TIERS.stats },
    {
      label: 'Variants met',
      value: <VariantsMet monster={def.id} />,
      hint: 'Monster variants (Venomous, Swift, …) seen on this kind so far.',
      minKills: MONSTER_KILL_TIERS.stats,
    },
    {
      label: 'Drops',
      value: dropsText(def),
      hint: 'Trophies and carried loot left behind when slain.',
      minKills: MONSTER_KILL_TIERS.lore,
    },
  ],
});
