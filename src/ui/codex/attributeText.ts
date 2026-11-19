/**
 * Attributes in words (ETH-033), for the Codex renderers and the party card: what each one
 * raises, read from the sim's formula table so the text never drifts from the numbers.
 */
import { ATTRIBUTE_IDS, attributeDef, expectedGrowth } from '../../content';
import type { AttributeGrowth, AttributeId } from '../../content';
import { formulasFor, KILL_SHARE_RADIUS, STAT_INFO, XP_PER_DEPTH, XP_PER_THREAT } from '../../sim';

/** "Max HP +1 per point; Damage +0.5 per point above 10". */
export function attributeEffectText(attribute: AttributeId): string {
  return formulasFor(attribute)
    .map((f) => `${STAT_INFO[f.stat].label} +${f.perPoint} per point${f.from > 0 ? ` above ${f.from}` : ''}`)
    .join('; ');
}

/** An attribute's tooltip: its description, then what it raises. */
export function attributeHint(attribute: AttributeId): string {
  return `${attributeDef(attribute).description} ${attributeEffectText(attribute)}.`;
}

/**
 * A class's level-up rolls, compact (ETH-110): "BRN 0–2 · FIN 0–1 · WIT 1 (25%) · GRT 1–2".
 * Attributes that never grow are left out.
 */
export function growthLine(growth: AttributeGrowth): string {
  const parts = ATTRIBUTE_IDS.flatMap((a) => {
    const roll = growth[a];
    if (roll === undefined || expectedGrowth(roll) === 0) return [];
    const range = roll.min === roll.max ? `${roll.min}` : `${roll.min}–${roll.max}`;
    const chance = roll.chance === undefined || roll.chance === 1 ? '' : ` (${Math.round(roll.chance * 100)}%)`;
    return [`${attributeDef(a).abbr} ${range}${chance}`];
  });
  return parts.length > 0 ? parts.join(' · ') : 'None';
}

/** Where XP comes from and how levels grow, in one paragraph for tooltips (ETH-034, ETH-110). */
export function xpSourcesText(): string {
  return (
    `XP comes from kills (${XP_PER_THREAT} per point of the foe's threat, shared by every party member within ` +
    `${KILL_SHARE_RADIUS} tiles of the fight, with a bonus for fighting together) and from each new depth ` +
    `(${XP_PER_DEPTH} per floor of depth, to every living member). Levels have no cap; each one rolls the class's growth.`
  );
}

/** Compact attribute values, "BRN 11 · FIN 9 · WIT 4 · GRT 13"; `signed` writes "+1", for adjustments. */
export function attributeLine(values: Readonly<Partial<Record<AttributeId, number>>>, signed = false): string {
  const parts = ATTRIBUTE_IDS.filter((a) => !signed || (values[a] ?? 0) !== 0).map((a) => {
    const v = values[a] ?? 0;
    return `${attributeDef(a).abbr} ${signed && v > 0 ? '+' : ''}${signed && v < 0 ? '−' : ''}${signed ? Math.abs(v) : v}`;
  });
  return parts.length > 0 ? parts.join(' · ') : 'None';
}
