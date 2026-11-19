/**
 * Attribute and derived HP/MP previews for the Prepare screen's party slots (ETH-077).
 */
import { ATTRIBUTE_IDS } from '../../../content';
import type { Attributes, ClassDef, RaceDef } from '../../../content';
import { ATTRIBUTE_FORMULAS, STAT_INFO } from '../../../sim';
import type { StatId } from '../../../sim';
import { attributeLine } from '../../codex/attributeText';

function deriveStat(stat: StatId, attrs: Attributes): number {
  let add = STAT_INFO[stat].base;
  for (const f of ATTRIBUTE_FORMULAS) {
    if (f.stat === stat) add += (attrs[f.attribute] - f.from) * f.perPoint;
  }
  const info = STAT_INFO[stat];
  const value = Math.max(info.min, Math.round(add));
  return info.max === undefined ? value : Math.min(info.max, value);
}

function combineAttributes(cls: ClassDef, race: RaceDef): Attributes {
  return Object.fromEntries(
    ATTRIBUTE_IDS.map((id) => [id, cls.attributes[id] + (race.attributes[id] ?? 0)]),
  ) as Attributes;
}

function raceModifiersText(race: RaceDef): string {
  return ATTRIBUTE_IDS.some((id) => (race.attributes[id] ?? 0) !== 0) ? attributeLine(race.attributes, true) : '';
}

function formatDerivedLine(attrs: Attributes): string {
  return `${attributeLine(attrs)} · HP ${deriveStat('hp', attrs)} · MP ${deriveStat('mp', attrs)}`;
}

/** Class `<option>` label: `Vanguard (BRN 11 · FIN 9 · WIT 4 · GRT 13)`. */
export function classOptionLabel(cls: ClassDef): string {
  return `${cls.name} (${attributeLine(cls.attributes)})`;
}

/** Race `<option>` label: `Human (BRN +1 · FIN +1 · WIT +1 · GRT +1)`, or just the name if all modifiers are 0. */
export function raceOptionLabel(race: RaceDef): string {
  const mod = raceModifiersText(race);
  return mod ? `${race.name} (${mod})` : race.name;
}

export interface SlotPreview {
  readonly text: string;
  readonly resolved: boolean;
}

/**
 * Preview line for an unlocked party slot from the selected class and/or race.
 * Shows base class + race attributes and derived HP/MP without town upgrades.
 */
export function slotAttributePreview(cls: ClassDef | undefined, race: RaceDef | undefined): SlotPreview {
  if (cls && race) {
    return { text: formatDerivedLine(combineAttributes(cls, race)), resolved: true };
  }
  if (cls) {
    return { text: `${formatDerivedLine(cls.attributes)} (before race)`, resolved: true };
  }
  if (race) {
    const mod = raceModifiersText(race);
    return { text: `${mod || 'No attribute modifiers'} (before class)`, resolved: true };
  }
  return { text: 'Attributes rolled on descent', resolved: false };
}
