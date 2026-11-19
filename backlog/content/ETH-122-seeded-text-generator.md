---
id: ETH-122
title: Seeded text generator: grammar templates for names, titles, epitaphs, ballads and backstories
type: feature
status: blocked
priority: P1
milestone: M5
epic: content
size: M
depends_on: [ETH-002, ETH-015]
created: 2026-11-19
updated: 2026-11-19
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
- [ ] Engine in `src/core/textGen.ts` (no dependencies, our own syntax): a `Grammar` is
      `Record<symbol, (string | { text, weight })[]>`; `{symbol}` expands a symbol, `{$var}`
      inserts a variable, `{symbol|cap}` / `{$var|a}` apply a small set of filters (capitalize,
      article, plural). `expand(grammar, symbol, rng, vars) → string`. Recursion depth is capped
      and a missing variable is an error in tests, a visible `[?var]` in release.
- [ ] Content: a `grammar` kind (`src/content/grammars.ts`, `grammar.*`) holding grammars as data,
      validated at load time: every referenced symbol exists, every variable used is declared in
      the def's `vars`, no symbol is unreachable, and expansion terminates.
- [ ] Determinism: `textRng(seed, purpose, key)` = `Rng.seeded(seed, 'text/<purpose>/<key>')`;
      generation never draws from a sim stream, so adding a grammar never changes a run. The same
      seed, purpose and key always give the same text.
- [ ] First grammars: `grammar.adventurer_name` (replacing the flat `RECRUIT_NAMES` pick in
      `prepare/party`, keeping the old list as one of its alternatives), `grammar.title` and
      `grammar.epitaph` (variables: name, class, depth, cause, killer). All text original.
- [ ] Tests: deterministic output per key; filters; validation errors for a missing symbol, an
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

## Log
- 2026-11-19: Created in the shared-systems pass (foundation for ETH-068, 069, 089, 101, 103).
- 2026-11-19: (spec gate) awaiting Nate's review of this spec
