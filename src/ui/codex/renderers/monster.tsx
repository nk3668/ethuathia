/** Codex view of monsters (ETH-060): their numbers, where they live and how they behave. */
import { MONSTERS } from '../../../content';
import type { MonsterDef } from '../../../content';
import { defineCodexRenderer } from '../types';

/** How a monster's rule set reads, from the rule actions it can take. */
function behaviorText(def: MonsterDef): string {
  const actions = new Set(def.rules.map((r) => r.action.id));
  const parts: string[] = [];
  if (actions.has('act.flee')) parts.push('runs when badly hurt');
  if (actions.has('act.attack_adjacent')) parts.push('fights whoever is next to it');
  if (actions.has('act.approach_enemy')) parts.push('closes in on adventurers it sees');
  if (actions.has('act.wander')) parts.push('roams otherwise');
  const text = parts.join(', ');
  return text === '' ? 'Keeps to itself' : text.charAt(0).toUpperCase() + text.slice(1);
}

function depthText(def: MonsterDef): string {
  return def.depth.max >= 99 ? `Floor ${def.depth.min} and deeper` : `Floors ${def.depth.min}–${def.depth.max}`;
}

export default defineCodexRenderer({
  registry: MONSTERS,
  label: 'Monsters',
  order: 30,
  hint: 'See or slay one in the dungeon.',
  group: (def) => (def.sharesTile === true ? 'Crowding folk' : 'Creatures'),
  fields: (def) => [
    { label: 'HP', value: def.stats.hp, hint: 'Hit points when unhurt.', key: true },
    {
      label: 'Damage',
      value: `1–3 + ${def.stats.damage}`,
      hint: 'What a blow that lands does, before the target’s armor (never below 1).',
      key: true,
    },
    { label: 'Accuracy', value: def.stats.accuracy, hint: 'Each point adds 5% to its chance to hit, against your evasion.' },
    { label: 'Evasion', value: def.stats.evasion, hint: 'Each point takes 5% off your chance to hit it.' },
    { label: 'Armor', value: def.stats.armor, hint: 'Taken off the damage of each blow that lands on it.' },
    { label: 'Speed', value: def.stats.speed, hint: 'Energy gained each tick; 100 acts once a turn.', key: true },
    { label: 'Found on', value: depthText(def), hint: 'The dungeon floors it appears on.' },
    { label: 'Threat', value: def.threat, hint: 'How dangerous it is. Kills of it are weighed by this.' },
    {
      label: 'Crowds',
      value: def.sharesTile === true ? 'Yes' : 'No',
      hint: 'Small folk and swarms can share a tile with others of their sort; everyone else needs a tile of their own.',
    },
    { label: 'Behavior', value: behaviorText(def), hint: 'The rules it follows each turn.' },
  ],
});
