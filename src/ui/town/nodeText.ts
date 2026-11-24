/** Wording shared by the Town tree's node, tooltip and detail card. */
import { formatCurrencies } from '../../meta';
import type { Currencies, NodeStatus } from '../../meta';

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

/** A rank or tier as a Roman numeral (1 to 10); larger numbers fall back to digits. */
export function roman(n: number): string {
  return ROMAN[n - 1] ?? String(n);
}

/** How each status is named next to the node (never by color alone, VISUAL-DESIGN §5.2). */
export const STATUS_TEXT: Readonly<Record<NodeStatus, string>> = {
  owned: 'Owned',
  available: 'Available',
  expensive: 'Too expensive',
  locked: 'Locked',
  excluded: 'Not chosen',
};

/** A fee in words: "no fee" when it is zero. */
export function feeText(fee: Currencies): string {
  const text = formatCurrencies(fee);
  return text === 'nothing' ? 'no fee' : `a fee of ${text}`;
}
