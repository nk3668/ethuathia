/**
 * The three currencies (CLAUDE.md §3): Renown, Trophies and Favor kept per deity. One shape,
 * `Currencies`, serves banked totals in the profile and the amounts in a `RunResult`.
 */
import { z } from 'zod';
import { idSchema } from '../content/schema';

export type CurrencyId = 'renown' | 'trophies' | 'favor';

export const CURRENCY_IDS: readonly CurrencyId[] = ['renown', 'trophies', 'favor'];

/** An amount of each currency. Favor is kept per deity, keyed by deity content id (`deity.x`). */
export interface Currencies {
  readonly renown: number;
  readonly trophies: number;
  readonly favor: Readonly<Record<string, number>>;
}

/** Name and tooltip text for each currency, shared by the top bar, the run summary and the Codex. */
export const CURRENCY_INFO: Readonly<Record<CurrencyId, { name: string; about: string }>> = {
  renown: {
    name: 'Renown',
    about: 'Earned by depth reached and turns survived. Spent in the Guild Hall and the Library.',
  },
  trophies: {
    name: 'Trophies',
    about: 'Earned by kills, weighted by how dangerous the monster was. Spent in the Smithy.',
  },
  favor: {
    name: 'Favor',
    about: 'Earned per deity by victories, kept conducts and honoring your patron. Spent in the Temple.',
  },
};

/** A non-negative finite amount. */
export const amountSchema = z.number().finite().nonnegative();

export const currenciesSchema = z.object({
  renown: amountSchema,
  trophies: amountSchema,
  favor: z.record(idSchema('deity'), amountSchema),
});

export function emptyCurrencies(): Currencies {
  return { renown: 0, trophies: 0, favor: {} };
}

/** `a + b`, per currency and per deity. */
export function addCurrencies(a: Currencies, b: Currencies): Currencies {
  const favor: Record<string, number> = { ...a.favor };
  for (const [deity, n] of Object.entries(b.favor)) favor[deity] = (favor[deity] ?? 0) + n;
  return { renown: a.renown + b.renown, trophies: a.trophies + b.trophies, favor };
}

/** `a - b`, per currency and per deity, never below zero. A deity at zero is left out. */
export function subtractCurrencies(a: Currencies, b: Currencies): Currencies {
  const favor: Record<string, number> = {};
  for (const [deity, n] of Object.entries(a.favor)) {
    const left = Math.max(0, n - (b.favor[deity] ?? 0));
    if (left > 0) favor[deity] = left;
  }
  return {
    renown: Math.max(0, a.renown - b.renown),
    trophies: Math.max(0, a.trophies - b.trophies),
    favor,
  };
}

/** Favor across every deity, as the top bar shows it. */
export function totalFavor(favor: Currencies['favor']): number {
  return Object.values(favor).reduce((sum, n) => sum + n, 0);
}
