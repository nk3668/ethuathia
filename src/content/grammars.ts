/**
 * Grammar content definitions (ETH-122): data tables for the seeded text generator
 * (`src/core/textGen.ts`), used for adventurer names, titles, epitaphs, ballads and backstories.
 *
 * Every grammar is statically checked at load time by `GRAMMAR_KIND.check` (`checkGrammar`):
 * - `root` (default `'root'`) and any extra `entries` exist in `rules`;
 * - every referenced `{symbol}` exists in `rules`;
 * - every referenced `{$var}` is declared in `vars`, and every declared variable is used;
 * - no symbol in `rules` is unreachable from `root` / `entries`;
 * - every symbol can terminate in finite steps.
 */
import { z } from 'zod';
import { checkGrammar, expand, Registry } from '../core';
import type { Def, ExpandOptions, Grammar, GrammarRule, Rng, TextVars } from '../core';
import type { ContentKind } from './kind';
import { RECRUIT_NAMES } from './recruits';
import { defShape, positiveInt } from './schema';

export interface GrammarDef extends Def {
  /** Top-level symbol expanded when `generateText` is called without `symbol` (default `'root'`). */
  readonly root?: string;
  /**
   * Additional top-level entry symbols (e.g. `['slain', 'fell']` on `grammar.epitaph` for deaths
   * with or without a killer). Counted alongside `root` for reachability validation.
   */
  readonly entries?: readonly string[];
  /** Variable names (`{$var}`) that templates in `rules` are allowed to reference. */
  readonly vars?: readonly string[];
  /** Symbol table mapping each symbol name to its weighted template alternatives. */
  readonly rules: Grammar;
}

export const GRAMMARS = new Registry<GrammarDef>('grammar');

const identSchema = z
  .string()
  .regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/, 'must be letters, digits and _, starting with a letter or _');

const ruleSchema: z.ZodType<GrammarRule> = z.union([
  z.string(),
  z.strictObject({
    text: z.string(),
    weight: positiveInt.optional(),
  }),
]);

export const GRAMMAR_KIND: ContentKind<GrammarDef> = {
  registry: GRAMMARS,
  schema: z.strictObject({
    ...defShape('grammar'),
    root: identSchema.optional(),
    entries: z.array(identSchema).optional(),
    vars: z.array(identSchema).optional(),
    rules: z.record(identSchema, z.array(ruleSchema)),
  }),
  check(defs) {
    const problems: string[] = [];
    for (const def of defs) {
      for (const issue of checkGrammar(def)) {
        problems.push(`grammar "${def.id}": ${issue}`);
      }
    }
    return problems;
  },
};

/** Registers a grammar definition and returns it. Checked by `validateContent`. */
export function defineGrammar(def: GrammarDef): GrammarDef {
  return GRAMMARS.register(def);
}

/**
 * Expands `id` (a registered `grammar.*` def) with `rng` and `vars`.
 * Pass `options.symbol` to start from a specific entry symbol (such as `'slain'` or `'fell'` on
 * `grammar.epitaph`) instead of `def.root ?? 'root'`.
 */
export function generateText(
  id: string,
  rng: Rng,
  vars: TextVars = {},
  options: ExpandOptions & { readonly symbol?: string } = {},
): string {
  const def = GRAMMARS.get(id);
  const symbol = options.symbol ?? def.root ?? 'root';
  return expand(def.rules, symbol, rng, vars, options);
}

// --- Shipped grammars ------------------------------------------------------------------------

export const GRAMMAR_ADVENTURER_NAME = defineGrammar({
  id: 'grammar.adventurer_name',
  name: 'Adventurer name',
  description: 'Names recorded in the Guild Hall ledger when recruits sign on for a descent.',
  tags: ['name'],
  rules: {
    root: [
      { text: '{known}', weight: 2 },
      { text: '{two_part}', weight: 2 },
      { text: '{three_part}', weight: 1 },
    ],
    known: RECRUIT_NAMES,
    two_part: ['{onset}{coda}', '{vowel_lead}{coda}'],
    three_part: ['{onset}{bridge}{ending}', '{vowel_lead}{bridge}{ending}'],
    onset: [
      'Al', 'Br', 'Cal', 'Cor', 'Dal', 'Dr', 'Fal', 'Fen', 'Gar', 'Hal',
      'Jor', 'Kel', 'Lor', 'Mar', 'Mor', 'Nor', 'pel', 'Ren', 'Sar', 'Tal',
      'Tor', 'Val', 'Ver', 'Vor', 'Wren',
    ].map((s) => `${s.charAt(0).toUpperCase()}${s.slice(1)}`),
    vowel_lead: ['Ad', 'El', 'Er', 'Id', 'Il', 'Is', 'Ol', 'Or', 'Ul', 'Ys'],
    bridge: ['a', 'e', 'i', 'o', 'u', 'ar', 'el', 'en', 'ir', 'or'],
    coda: [
      'dan', 'den', 'dis', 'dor', 'dris', 'gan', 'gar', 'lin', 'lan', 'mar',
      'mir', 'mon', 'nan', 'nar', 'ric', 'rin', 'ris', 'ron', 'sel', 'sen',
      'tan', 'tar', 'tin', 'van', 'ven', 'vin', 'win',
    ],
    ending: ['a', 'an', 'el', 'en', 'ia', 'in', 'is', 'on', 'or', 'yn'],
  },
});

export const GRAMMAR_TITLE = defineGrammar({
  id: 'grammar.title',
  name: 'Adventurer title',
  description: 'Epithets and styles attached to an adventurer or nemesis after deeds below.',
  tags: ['title'],
  vars: ['name', 'class', 'race'],
  rules: {
    root: [
      { text: '{$name} the {epithet}', weight: 3 },
      { text: '{$name}, {epithet} {$class}', weight: 2 },
      { text: '{$name} of the {domain}', weight: 2 },
      { text: '{$name}, {$race} {mantle}', weight: 2 },
      { text: '{$name} the {adj} {noun}', weight: 2 },
    ],
    epithet: [
      'Unbroken', 'Lantern-Bearer', 'Deep-Sworn', 'Grey-Cloaked', 'Stone-Eyed',
      'Twice-Returned', 'Vault-Walker', 'Grim-Handed', 'Ash-Marked', 'Iron-Shod',
    ],
    domain: [
      'Low Steps', 'Sunken Vaults', 'Quiet Torch', 'Seventh Arch', 'Cold Cistern',
      'Black Mortar', 'Outer Pale', 'Weeping Stair',
    ],
    mantle: [
      'Pathfinder', 'Warden', 'Delver', 'Torchbearer', 'Shield-Mate', ' Oathkeeper'.trim(),
    ],
    adj: ['Ashen', 'Hollow', 'Steadfast', 'Silent', 'Gilded', 'Riven', 'Sunken', 'Dusk'],
    noun: ['Blade', 'Lantern', 'Sentinel', 'Anvil', 'Watch', 'Pillar', 'Hound', 'Crown'],
  },
});

export const GRAMMAR_EPITAPH = defineGrammar({
  id: 'grammar.epitaph',
  name: 'Epitaph',
  description: 'Inscriptions carved into memorial stones for adventurers who did not return.',
  tags: ['epitaph'],
  entries: ['slain', 'fell'],
  vars: ['name', 'class', 'race', 'depth', 'cause', 'killer'],
  rules: {
    root: ['{slain}', '{fell}'],
    slain: [
      { text: 'Here lies {$name}, {$race} {$class|lower}, brought down on the {$depth|ord} floor by {$killer|a}. {closing}', weight: 3 },
      { text: 'In memory of {$name} ({$class}), who met {$cause} at the hands of {$killer|a} on floor {$depth}. {closing}', weight: 2 },
      { text: '{$name}, {$race|lower} {$class|lower}, stood to the last against {$killer|a} on the {$depth|ord} floor ({$cause}).', weight: 2 },
    ],
    fell: [
      { text: 'Here lies {$name}, {$race} {$class|lower}, lost on the {$depth|ord} floor to {$cause}. {closing}', weight: 3 },
      { text: 'In memory of {$name} ({$class}), claimed by {$cause} on floor {$depth}. {closing}', weight: 2 },
      { text: '{$name}, {$race|lower} {$class|lower}, went no further than the {$depth|ord} floor ({$cause}).', weight: 2 },
    ],
    closing: [
      'The lantern went no deeper.',
      'Remembered in the ledger.',
      'The hall keeps their name.',
      'No stone below went unturned.',
      'Their watch is ended.',
    ],
  },
});
