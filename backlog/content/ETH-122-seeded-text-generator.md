---
id: ETH-122
title: Seeded text generator: grammar templates for names, titles, epitaphs, ballads and backstories
type: feature
status: done
priority: P1
milestone: M7
epic: content
size: M
depends_on: [ETH-002, ETH-015]
created: 2026-11-19
updated: 2026-11-24
---

## Summary
A small, deterministic text generator: grammars (named symbols with weighted alternatives that
can refer to other symbols and to supplied variables) kept as content, expanded with a seeded RNG
derived from a purpose and a key, so the same adventurer always gets the same epitaph and no
gameplay stream is touched.

## Why
Names and titles (ETH-068, ETH-101), epitaphs (ETH-069), ballads (ETH-103) and recruit backstories
(ETH-089) all need varied text from templates. Today the only generated text is a pick from
`RECRUIT_NAMES` (`src/content/recruits.ts`) with the `prepare` RNG. Without a shared generator
each feature would write its own template code with its own determinism bugs. See `CLAUDE.md` §1
(Attachment), §7 and the "Shared systems" list in `docs/ARCHITECTURE.md`.

## Acceptance criteria
- [x] Engine in `src/core/textGen.ts` (no dependencies, our own syntax): a `Grammar` is
      `Record<symbol, (string | { text, weight })[]>`; `{symbol}` expands a symbol, `{$var}`
      inserts a variable, `{symbol|cap}` / `{$var|a}` apply a small set of filters (capitalize,
      article, plural). `expand(grammar, symbol, rng, vars) → string`. Recursion depth is capped
      and a missing variable is an error in tests, a visible `[?var]` in release.
- [x] Content: a `grammar` kind (`src/content/grammars.ts`, `grammar.*`) holding grammars as data,
      validated at load time: every referenced symbol exists, every variable used is declared in
      the def's `vars`, no symbol is unreachable, and expansion terminates.
- [x] Determinism: `textRng(seed, purpose, key)` = `Rng.seeded(seed, 'text/<purpose>/<key>')`;
      generation never draws from a sim stream, so adding a grammar never changes a run. The same
      seed, purpose and key always give the same text.
- [x] First grammars: `grammar.adventurer_name` (replacing the flat `RECRUIT_NAMES` pick in
      `prepare/party`, keeping the old list as one of its alternatives), `grammar.title` and
      `grammar.epitaph` (variables: name, class, depth, cause, killer). All text original.
- [x] Tests: deterministic output per key; filters; validation errors for a missing symbol, an
      undeclared variable and an infinite grammar; a property test that 1,000 expansions of each
      shipped grammar contain no `{` or `[?`.

## Notes
Who uses it and how:
- **ETH-068:** recruit names and the epitaph written when an adventurer falls (from ETH-119's
  `death` and ETH-120's last chronicle entries).
- **ETH-069:** the grave's inscription.
- **ETH-101:** the nemesis's name and title ("Vell the Guildbane").
- **ETH-103:** a ballad stanza per chronicle entry kind.
- **ETH-089:** the found adventurer's backstory line ("Found shackled on floor 6").

Open decisions:
- (default) The engine lives in `src/core/` (pure, no content) and grammars in `src/content/` —
  alternative: both in content.
- (default) Our own minimal `{symbol}` syntax — alternative: adopt an existing grammar library
  (must be bundled, licence-compatible and not CDN-hosted; more features, more weight).
- (default) Generated text is stored once made (the epitaph on the record), not regenerated —
  alternative: regenerate on display from the key (smaller saves, but grammar edits change old text).

## Implementation instructions

To keep the engine fast, deterministic, dependency-free and strictly validated:

1. **Core engine (`src/core/textGen.ts`, exported from `src/core/index.ts`):**
   - Must import only from `src/core/` (`Rng`, `seedState`) to respect the layer rule (`core` imports nothing outside `core`).
   - Types:
     - `GrammarRule = string | { readonly text: string; readonly weight?: number }` (default `weight = 1`, must be a positive integer/finite number > 0).
     - `Grammar = Readonly<Record<string, readonly GrammarRule[]>>`.
     - `TextVars = Readonly<Record<string, string | number>>`.
     - `ExpandOptions = { readonly strict?: boolean; readonly maxDepth?: number }` (`maxDepth` default `MAX_GRAMMAR_DEPTH = 24`). `strict` defaults to `false` (a missing variable renders `[?var]`); tests and content validation pass `strict: true`. `core` can't read Vite's env, so the caller decides, never a build flag.
   - Template syntax & parser:
     - Support placeholders `{token}` where `token` is `<name>` or `<name>|<filter1>|<filter2>...` (chained filters allowed).
     - If `<name>` starts with `$` (e.g. `{$name}`, `{$killer|a}`), look up `vars[name.slice(1)]`; otherwise look up symbol `grammar[name]` and pick a weighted alternative with exactly one `rng.int(1, totalWeight)` draw (a symbol with a single alternative draws nothing), then recursively expand it before applying filters.
     - Built-in filters (`TEXT_FILTERS`):
       - `cap`: capitalize the first character (`"gloam rat"` → `"Gloam rat"`).
       - `lower`: lowercase the string (`"Vanguard"` → `"vanguard"`).
       - `a`: prefix `"an "` when the value's **first** letter is a vowel (`/^[aeiou]/i.test(s.trim())`; note the `^`), else `"a "`, with a small exception list for vowel-sound edge cases (`hour` → an; `one`, `unique`, `user` → a). No proper-name detection: grammars simply don't put `|a` on names. Also `the` (`"the " + s`).
       - `s` / `plural`: simple English pluralizer (`-y` after consonant → `-ies`, `-s/-x/-z/-ch/-sh` → `-es`, else `-s`).
       - `ord`: ordinal number (`1` → `"1st"`, `2` → `"2nd"`, `3` → `"3rd"`, `4` → `"4th"`, handling `11..13`).
     - On missing variable: throw a `RangeError` when `strict: true`, or render `[?varName]` when `strict: false`. On missing symbol or depth exceeding `maxDepth`: throw a `RangeError`.
   - Seeded RNG helper:
     - `textRng(seed: number, purpose: string, key: string | number = ''): Rng` returning `Rng.seeded(seed, 'text/' + purpose + '/' + String(key))`.
2. **Content kind & load-time static validation (`src/content/grammars.ts`):**
   - Define `GrammarDef extends Def`: `{ readonly root?: string; readonly vars?: readonly string[]; readonly rules: Grammar }` (`root` defaults to `'root'`).
   - Register `GRAMMARS = new Registry<GrammarDef>('grammar')` and `GRAMMAR_KIND` in `CONTENT_KINDS` (`src/content/registries.ts`); mark its Codex renderer `hidden: true` (`src/ui/codex/renderers/grammar.tsx`) so internal grammar tables don't clutter the player's Codex tab.
   - In `GRAMMAR_KIND.check(defs)` (or schema refinement + `checkGrammar(def)` in `src/core/textGen.ts`), statically validate every registered `GrammarDef`:
     - `root` symbol exists in `def.rules`, and every rule list is non-empty with valid template syntax (no unclosed `{` or `}`, no unknown `|filter` names).
     - Every `{symbol}` referenced in any rule exists in `def.rules`.
     - Every `{$var}` referenced in any rule is listed in `def.vars`, and every variable in `def.vars` is referenced at least once.
     - Every symbol in `def.rules` is reachable from `root` (BFS/DFS from `root`).
     - **Termination check:** compute the *productive* symbols by fixed-point iteration (a symbol is productive if at least one alternative references only productive symbols; plain text is productive). Every symbol reachable from `root` must be productive, or it's a validation problem ("symbol X can never finish"). That's the whole static check. A grammar that is productive but can still recurse deeply is caught at run time by `maxDepth` (a `RangeError`) and in tests by the 1,000-expansion property test.
3. **First grammars & integration with `PARTY_CHOICE` (`src/meta/prepare/party.ts`):**
   - Define `grammar.adventurer_name` (keeping `RECRUIT_NAMES` as one weighted branch alongside compound syllable/root patterns so all existing names remain possible), `grammar.title` (`vars: ['name', 'class', 'race']`), and `grammar.epitaph` (`vars: ['name', 'class', 'race', 'depth', 'cause', 'killer']`).
   - **Optional variables:** not every death has a killer, and strict mode throws on a missing variable. So `generateText` takes an optional `symbol` (default `root`), and `grammar.epitaph` has two entry symbols: `slain`, which uses `{$killer}`, and `fell`, which doesn't. The caller picks `slain` only when there is a killer. Validation counts every top-level symbol a def lists in `entries?: string[]` as a root for the reachability and variable checks.
   - Provide a high-level helper `generateText(id: string, rng: Rng, vars?: TextVars, options?: ExpandOptions & { symbol?: string }): string` in `src/content/grammars.ts`.
   - In `src/meta/prepare/party.ts`, `recruitName` must **not** draw from the `prepare` RNG any more. Today it draws from the same stream as the random class and race picks, so changing how many draws it makes would shift every later slot's class and race. Generate the name from `textRng(seed, 'recruit-name', slot + '/' + attempt)` instead, retrying up to 16 attempts until the name is not in `taken`, then falling back to `${name} ${n}`. (`buildRunConfig` already has `seed`; pass the slot index through `PARTY_CHOICE`.) This drops the `rng.pick(free)` draw from the `prepare` stream, which changes recruit class/race picks for slots 2+ once. Say so in the PR. The sim compare is unaffected (0 delta, same hashes), because `npm run sim` builds its party with `headlessParty` and never calls `recruitName`. Update any test that pins specific random recruit names.

## Log
- 2026-11-19: Created in the shared-systems pass (foundation for ETH-068, 069, 089, 101, 103).
- 2026-11-19: (spec gate) awaiting Nate's review of this spec
- 2026-11-19: Spec approved by Nate with all defaults as written. Status ready.
- 2026-11-19: Implementation instructions drafted by Antigravity; reviewed and amended by Claude (bugs fixed, open either/or choices decided, missing cases added). Ready to build.
- 2026-11-19: Implemented by Gemini (`src/core/textGen.ts`, `src/content/grammars.ts`, `src/ui/codex/renderers/grammar.tsx`, and `recruitName` in `src/meta/prepare/party.ts` using `textRng(seed, 'recruit-name', slot + '/' + attempt)`). Kept all `(default)` choices: engine in `src/core/` with content in `src/content/`, custom `{symbol}` / `{$var|filter}` syntax, and generated text stored once made. Pending review.
- 2026-11-19: Review fixes (no article on named killers, `epitaph` root no longer needs `killer`, data cleanups) landed; reviewed by Nate and Claude and merged as PR #77. Done.
- 2026-11-24: Moved from M5 to M7 in the backlog reorganization by theme.
