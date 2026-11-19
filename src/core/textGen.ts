/**
 * Seeded, deterministic text generation from grammar templates (ETH-122).
 *
 * A `Grammar` is a table of named symbols, each with one or more weighted template alternatives.
 * Inside a template:
 * - `{symbol}` expands another symbol recursively.
 * - `{$var}` inserts a caller-supplied variable from `vars`.
 * - `{symbol|cap}` or `{$var|a|cap}` applies one or more named filters left-to-right.
 *
 * `textRng(seed, purpose, key)` derives an isolated sfc32 stream (`text/<purpose>/<key>`) so
 * generating names, titles, epitaphs or ballads never touches any simulation RNG stream.
 */
import { Rng } from './rng';

/** One alternative in a symbol's rule list: a template string, optionally weighted (default 1). */
export type GrammarRule = string | { readonly text: string; readonly weight?: number };

/** A grammar table mapping symbol names to non-empty lists of weighted alternatives. */
export type Grammar = Readonly<Record<string, readonly GrammarRule[]>>;

/** Caller-supplied variables substituted into `{$var}` placeholders. */
export type TextVars = Readonly<Record<string, string | number>>;

/** A pure string filter applied by `{token|filter}`. */
export type TextFilter = (value: string) => string;

/** Default recursion limit for nested `{symbol}` expansions. */
export const MAX_GRAMMAR_DEPTH = 24;

export interface ExpandOptions {
  /**
   * When true, a missing `{$var}` throws a `RangeError` (for tests and content validation).
   * When false (the default), a missing variable renders visibly as `[?var]`.
   */
  readonly strict?: boolean;
  /** Maximum symbol recursion depth before throwing a `RangeError` (default `MAX_GRAMMAR_DEPTH`). */
  readonly maxDepth?: number;
}

/** Silent-h stems that take "an" despite starting with a consonant letter. */
const AN_WORD_PREFIX = /^(?:hour|heir|honest|honou?r)/i;

/** Vowel-letter stems pronounced with a leading /j/ or /w/ glide that take "a". */
const A_WORD_PREFIX = /^(?:one\b|once\b|uni(?:c|f|l|o|q|t|v)|use|usu|uten|util|usurp)/i;

/** Prefixes "a " or "an " according to the leading sound of `value`. */
function indefiniteArticle(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) return value;
  const firstWord = (trimmed.split(/[\s-]+/)[0] ?? '').replace(/^[^a-zA-Z0-9]+/, '');
  let useAn: boolean;
  if (AN_WORD_PREFIX.test(firstWord)) useAn = true;
  else if (A_WORD_PREFIX.test(firstWord)) useAn = false;
  else useAn = /^[aeiou]/i.test(trimmed);
  return `${useAn ? 'an' : 'a'} ${value}`;
}

/** Simple English pluralizer (`-y` after a consonant → `-ies`, sibilants → `-es`, else `-s`). */
function pluralize(value: string): string {
  if (value.trim().length === 0) return value;
  if (/[bcdfghjklmnpqrstvwxz]y$/i.test(value)) return `${value.slice(0, -1)}ies`;
  if (/(?:s|x|z|ch|sh)$/i.test(value)) return `${value}es`;
  return `${value}s`;
}

/** Formats an integer string with its English ordinal suffix (`1st`, `2nd`, `3rd`, `4th`, `11th`). */
function ordinal(value: string): string {
  const trimmed = value.trim();
  if (!/^-?\d+$/.test(trimmed)) return `${value}th`;
  const n = Math.abs(Number(trimmed));
  const mod100 = n % 100;
  const mod10 = n % 10;
  const suffix =
    mod100 >= 11 && mod100 <= 13 ? 'th' : mod10 === 1 ? 'st' : mod10 === 2 ? 'nd' : mod10 === 3 ? 'rd' : 'th';
  return `${trimmed}${suffix}`;
}

/** Built-in filters available after `|` inside `{...}` placeholders. */
export const TEXT_FILTERS = {
  cap: (s: string) => (s.length === 0 ? '' : `${s.charAt(0).toUpperCase()}${s.slice(1)}`),
  lower: (s: string) => s.toLowerCase(),
  a: indefiniteArticle,
  the: (s: string) => (s.trim().length === 0 ? s : `the ${s}`),
  s: pluralize,
  plural: pluralize,
  ord: ordinal,
} as const satisfies Readonly<Record<string, TextFilter>>;

/** Valid symbol or variable identifier inside `{...}`. */
const IDENT_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/** One parsed segment of a template string. */
export type TemplatePart =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'symbol'; readonly name: string; readonly filters: readonly string[] }
  | { readonly kind: 'var'; readonly name: string; readonly filters: readonly string[] };

export type ParseTemplateResult =
  | { readonly ok: true; readonly parts: readonly TemplatePart[] }
  | { readonly ok: false; readonly error: string };

/**
 * Parses a template string into literal text, `{symbol}` and `{$var}` parts, checking braces,
 * identifier names and filter names.
 */
export function parseTemplate(template: string): ParseTemplateResult {
  const parts: TemplatePart[] = [];
  let cursor = 0;
  while (cursor < template.length) {
    const open = template.indexOf('{', cursor);
    const strayClose = template.indexOf('}', cursor);
    if (strayClose !== -1 && (open === -1 || strayClose < open)) {
      return { ok: false, error: `unmatched "}" at index ${strayClose}` };
    }
    if (open === -1) {
      parts.push({ kind: 'text', text: template.slice(cursor) });
      break;
    }
    if (open > cursor) {
      parts.push({ kind: 'text', text: template.slice(cursor, open) });
    }
    const close = template.indexOf('}', open + 1);
    if (close === -1) {
      return { ok: false, error: `unclosed "{" at index ${open}` };
    }
    const nestedOpen = template.indexOf('{', open + 1);
    if (nestedOpen !== -1 && nestedOpen < close) {
      return { ok: false, error: `nested "{" inside placeholder at index ${nestedOpen}` };
    }
    const raw = template.slice(open + 1, close);
    if (raw.trim().length === 0) {
      return { ok: false, error: `empty placeholder "{}" at index ${open}` };
    }
    const segments = raw.split('|');
    const head = segments[0] ?? '';
    const filters = segments.slice(1);
    for (const filter of filters) {
      if (!Object.hasOwn(TEXT_FILTERS, filter)) {
        return { ok: false, error: `unknown filter "${filter}" in "{${raw}}"` };
      }
    }
    if (head.startsWith('$')) {
      const name = head.slice(1);
      if (!IDENT_PATTERN.test(name)) {
        return { ok: false, error: `invalid variable name "${head}" in "{${raw}}"` };
      }
      parts.push({ kind: 'var', name, filters });
    } else {
      if (!IDENT_PATTERN.test(head)) {
        return { ok: false, error: `invalid symbol name "${head}" in "{${raw}}"` };
      }
      parts.push({ kind: 'symbol', name: head, filters });
    }
    cursor = close + 1;
  }
  return { ok: true, parts };
}

/** Extracts the template string and weight from a `GrammarRule`, checking the weight is positive. */
function unpackRule(rule: GrammarRule, symbol: string): { text: string; weight: number } {
  if (typeof rule === 'string') return { text: rule, weight: 1 };
  const weight = rule.weight ?? 1;
  if (!Number.isInteger(weight) || weight <= 0) {
    throw new RangeError(`Invalid rule weight ${weight} in grammar symbol "${symbol}"`);
  }
  return { text: rule.text, weight };
}

/**
 * Picks one template alternative from `rules`. A single-alternative rule list makes zero RNG
 * draws; multi-alternative lists make exactly one `rng.int(1, totalWeight)` draw.
 */
function pickAlternative(rules: readonly GrammarRule[], rng: Rng, symbol: string): string {
  const unpacked = rules.map((r) => unpackRule(r, symbol));
  const first = unpacked[0];
  if (!first) throw new RangeError(`Empty rule list for grammar symbol "${symbol}"`);
  if (unpacked.length === 1) return first.text;
  let totalWeight = 0;
  for (const item of unpacked) totalWeight += item.weight;
  let roll = rng.int(1, totalWeight);
  for (const item of unpacked) {
    if (roll <= item.weight) return item.text;
    roll -= item.weight;
  }
  return first.text;
}

/** Applies a chain of named `TEXT_FILTERS` left-to-right. */
function applyFilters(value: string, filters: readonly string[]): string {
  const filterTable: Readonly<Record<string, TextFilter>> = TEXT_FILTERS;
  let out = value;
  for (const name of filters) {
    const fn = filterTable[name];
    if (!fn) throw new RangeError(`Unknown text filter "${name}"`);
    out = fn(out);
  }
  return out;
}

/**
 * Expands `symbol` in `grammar` using `rng` and `vars`.
 *
 * Throws a `RangeError` if a referenced symbol is missing, template syntax is invalid, recursion
 * exceeds `options.maxDepth` (default `MAX_GRAMMAR_DEPTH`), or `options.strict` is true and a
 * referenced `{$var}` is absent from `vars`.
 */
export function expand(
  grammar: Grammar,
  symbol: string,
  rng: Rng,
  vars: TextVars = {},
  options: ExpandOptions = {},
): string {
  const strict = options.strict ?? false;
  const maxDepth = options.maxDepth ?? MAX_GRAMMAR_DEPTH;

  function expandSymbol(sym: string, depth: number): string {
    if (depth > maxDepth) {
      throw new RangeError(`Grammar expansion exceeded max depth (${maxDepth}) at symbol "${sym}"`);
    }
    const rules = Object.hasOwn(grammar, sym) ? grammar[sym] : undefined;
    if (!rules || rules.length === 0) {
      throw new RangeError(`Unknown or empty grammar symbol "${sym}"`);
    }
    const template = pickAlternative(rules, rng, sym);
    const parsed = parseTemplate(template);
    if (!parsed.ok) {
      throw new RangeError(`Invalid template in grammar symbol "${sym}": ${parsed.error}`);
    }
    let out = '';
    for (const part of parsed.parts) {
      if (part.kind === 'text') {
        out += part.text;
      } else if (part.kind === 'var') {
        const raw = Object.hasOwn(vars, part.name) ? vars[part.name] : undefined;
        if (raw === undefined) {
          if (strict) throw new RangeError(`Missing template variable "${part.name}"`);
          out += `[?${part.name}]`;
        } else {
          out += applyFilters(String(raw), part.filters);
        }
      } else {
        const expanded = expandSymbol(part.name, depth + 1);
        out += applyFilters(expanded, part.filters);
      }
    }
    return out;
  }

  return expandSymbol(symbol, 0);
}

/**
 * A fresh seeded RNG for text generation: `Rng.seeded(seed, 'text/<purpose>/<key>')`.
 * Independent of all simulation streams so text generation never shifts gameplay draws.
 */
export function textRng(seed: number, purpose: string, key: string | number = ''): Rng {
  return Rng.seeded(seed, `text/${purpose}/${String(key)}`);
}

export interface GrammarSpec {
  readonly root?: string;
  readonly entries?: readonly string[];
  readonly vars?: readonly string[];
  readonly rules: Grammar;
}

/**
 * Statically validates a grammar specification:
 * - `root` (default `'root'`) and any `entries` exist in `rules`;
 * - every symbol's rule list is non-empty, has positive whole weights and valid template syntax;
 * - every referenced `{symbol}` exists in `rules`;
 * - every referenced `{$var}` is declared in `vars`, and every declared variable is used;
 * - every symbol in `rules` is reachable from `root` or `entries`;
 * - every symbol can terminate in a finite number of steps (fixed-point productivity check).
 */
export function checkGrammar(spec: GrammarSpec): string[] {
  const problems: string[] = [];
  const rules = spec.rules;
  const symbolNames = Object.keys(rules);
  if (symbolNames.length === 0) {
    problems.push('rules: must define at least one symbol');
    return problems;
  }

  const root = spec.root ?? 'root';
  const entryList = [root, ...(spec.entries ?? []).filter((e) => e !== root)];
  for (const entry of entryList) {
    if (!Object.hasOwn(rules, entry)) {
      problems.push(`entry symbol "${entry}" is not defined in rules`);
    }
  }

  const declaredVars = new Set<string>();
  for (const v of spec.vars ?? []) {
    if (declaredVars.has(v)) problems.push(`vars: lists variable "${v}" more than once`);
    declaredVars.add(v);
  }

  const usedVars = new Set<string>();
  const parsedBySymbol = new Map<string, { symbols: string[]; allKnown: boolean }[]>();

  for (const [sym, alts] of Object.entries(rules)) {
    if (alts.length === 0) {
      problems.push(`rules.${sym}: must have at least one alternative`);
      parsedBySymbol.set(sym, []);
      continue;
    }
    const parsedAlts: { symbols: string[]; allKnown: boolean }[] = [];
    alts.forEach((alt, i) => {
      const text = typeof alt === 'string' ? alt : alt.text;
      const weight = typeof alt === 'string' ? 1 : (alt.weight ?? 1);
      if (!Number.isInteger(weight) || weight <= 0) {
        problems.push(`rules.${sym}[${i}]: weight must be a positive whole number`);
      }
      const parsed = parseTemplate(text);
      if (!parsed.ok) {
        problems.push(`rules.${sym}[${i}]: ${parsed.error}`);
        return;
      }
      const refSymbols: string[] = [];
      let allKnown = true;
      for (const part of parsed.parts) {
        if (part.kind === 'symbol') {
          refSymbols.push(part.name);
          if (!Object.hasOwn(rules, part.name)) {
            problems.push(`rules.${sym}[${i}] refers to unknown symbol "${part.name}"`);
            allKnown = false;
          }
        } else if (part.kind === 'var') {
          usedVars.add(part.name);
          if (!declaredVars.has(part.name)) {
            problems.push(`rules.${sym}[${i}] uses undeclared variable "$${part.name}"`);
          }
        }
      }
      parsedAlts.push({ symbols: refSymbols, allKnown });
    });
    parsedBySymbol.set(sym, parsedAlts);
  }

  for (const v of declaredVars) {
    if (!usedVars.has(v)) {
      problems.push(`vars declares "$${v}", which is never used in rules`);
    }
  }

  // Reachability from root and any additional entry symbols.
  const reachable = new Set<string>();
  const queue: string[] = [];
  for (const entry of entryList) {
    if (Object.hasOwn(rules, entry) && !reachable.has(entry)) {
      reachable.add(entry);
      queue.push(entry);
    }
  }
  for (const current of queue) {
    for (const alt of parsedBySymbol.get(current) ?? []) {
      for (const target of alt.symbols) {
        if (Object.hasOwn(rules, target) && !reachable.has(target)) {
          reachable.add(target);
          queue.push(target);
        }
      }
    }
  }
  for (const sym of symbolNames) {
    if (!reachable.has(sym)) {
      problems.push(`symbol "${sym}" is unreachable from ${entryList.map((e) => `"${e}"`).join(', ')}`);
    }
  }

  // Fixed-point productivity (termination) check.
  const productive = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const [sym, alts] of parsedBySymbol) {
      if (productive.has(sym)) continue;
      if (alts.some((alt) => alt.allKnown && alt.symbols.every((target) => productive.has(target)))) {
        productive.add(sym);
        changed = true;
      }
    }
  }
  for (const sym of symbolNames) {
    const alts = parsedBySymbol.get(sym) ?? [];
    if (!productive.has(sym) && alts.length > 0 && alts.every((alt) => alt.allKnown)) {
      problems.push(`symbol "${sym}" cannot terminate (infinite recursion)`);
    }
  }

  return problems;
}
