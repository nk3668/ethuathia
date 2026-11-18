/**
 * Attributes in words (ETH-033), for the Codex renderers and the party card: what each one
 * raises, read from the sim's formula table so the text never drifts from the numbers.
 */
import { ATTRIBUTE_IDS, attributeDef } from '../../content';
import type { AttributeId } from '../../content';
import { formulasFor, STAT_INFO } from '../../sim';

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

/** Compact attribute values, "BRN 11 · FIN 9 · WIT 4 · GRT 13"; `signed` writes "+1", for adjustments. */
export function attributeLine(values: Readonly<Partial<Record<AttributeId, number>>>, signed = false): string {
  const parts = ATTRIBUTE_IDS.filter((a) => !signed || (values[a] ?? 0) !== 0).map((a) => {
    const v = values[a] ?? 0;
    return `${attributeDef(a).abbr} ${signed && v > 0 ? '+' : ''}${signed && v < 0 ? '−' : ''}${signed ? Math.abs(v) : v}`;
  });
  return parts.length > 0 ? parts.join(' · ') : 'None';
}
