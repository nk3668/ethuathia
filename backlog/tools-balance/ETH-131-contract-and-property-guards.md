---
id: ETH-131
title: Cross-domain contract and property-based test guards (honesty, secrecy, potency, discoverability)
type: chore
status: pending-review
priority: P2
milestone: M2
epic: tools-balance
size: S
depends_on: [ETH-025, ETH-044]
created: 2026-11-23
updated: 2026-11-23
---

## Summary
Add six reusable contract and property-based test guards to the test suite to automatically catch cross-domain bug classes surfaced during the `ETH-025` / `ETH-044` code review: AI peeking at hidden item data, unidentified item spoilers in logs/highlights/chronicle, effect kinds ignoring `ctx.potency`, unreachable Codex entries, non-canonical `ItemPropertyKind` values, and single-bound `{ max: 0 }` range overrides.

## Why
Individual unit tests verify the paths an author remembered to think about, but cross-cutting invariants—such as "the AI never peeks at hidden properties," "unidentified items never leak into Codex links or Highlights," or "every `Effect` kind honors `ctx.potency`"—tend to regress silently whenever a new domain, event, effect, or content registry is added in M2–M6. Capturing these as automated contract tests turns code-review catches into permanent compile-time and CI safety nets (see `docs/ARCHITECTURE.md` §11).

## Recommendations (Ranked by Impact & Value)

| # | Guard | Impact | Effort | Value (ROI) | Bug Class Prevented | Target File(s) |
|---|---|---|---|---|---|---|
| 1 | **AI Information-Leak ("Indistinguishability") Property Test** | **High** — Guards every current and future AI domain (fountains, shrines, merchants, spells, behavior rules) against secretly reading hidden item fields. | **Low** (~35 lines) | **Very High** | AI peeking at unidentified potions/gear (e.g. `carriesHealingPotion` checking `healAmount` on unknown vials). | `test/sim/ai.test.ts` or `test/sim/enchantIdentify.test.ts` |
| 2 | **Non-Spoiling Event / Log / Chronicle Sweep** | **High** — Protects player-facing secrecy across `describeEvent` mentions/tooltips, `highlightWhen`, `chronicle`, and `discoveriesOf` for every item-bearing event. | **Low** (~45 lines) | **Very High** | Unidentified items leaking real names or Codex tooltips via `dropped`, `died.drops`, `HIGHLIGHT_VALUABLE_FIND`, or `ITEMS_CHRONICLE`. | `test/ui/logText.test.ts`, `test/sim/codex.test.ts` |
| 3 | **Exhaustive `Effect['kind']` Potency Contract Test** | **High** — Compile-time enforced via `Record<Effect['kind'], ...>` so every future effect kind must explicitly declare and prove its `0.5×` / `1×` / `1.5×–2×` scaling. | **Low** (~35 lines) | **High** | New or existing `Effect` kinds ignoring `ctx.potency` (e.g. `applyStatus` ignoring blessed/cursed consumable potency and ranked trigger levels). | `test/sim/stats.test.ts` |
| 4 | **Codex Discoverability / Reachability Check** | **Medium-High** — Verifies that every non-`alwaysKnown`, non-`hidden` entry across all Codex registries can be discovered by at least one `discoveriesOf` rule. | **Low-Medium** (~50 lines) | **High** | Registry groups or entries staying permanently stuck at `???` (e.g. base `+N`/`-N` enchantments missing from `equipped`/`itemIdentified` discoveries). | `test/sim/codex.test.ts` |
| 5 | **Canonical-Value Invariant Test for `ItemPropertyKind`** | **Medium** — Ensures every registered item property rejects its default/no-op value (`0`, `true`, `[]`, `{}`), preserving `canStack` equivalence and compact saves. | **Very Low** (~20 lines) | **High** | Non-canonical property values (e.g. `identified: true` instead of absent) slipping into state and splitting identical stacks. | `test/sim/itemProperties.test.ts` |
| 6 | **Shared `clampRange` Helper & `{ max: 0 }` Boundary Tests** | **Low-Medium** — Prevents default `min >= 1` values from silently overriding an explicit `{ max: 0 }` disable option in spawn/loot/feature configs. | **Very Low** (~15 lines) | **Medium** | Single-bound range bugs like `respawnFloor` bumping `{ max: 0 }` up to `1` when `min` is omitted. | `src/core/` (or `src/sim/gen/params.ts`) + unit tests |

## Acceptance criteria
- [x] **AI indistinguishability test (#1):** Mutating hidden fields (`enchant`, `blessing`, `enchantments`, or swapping an unidentified appearance-category item's `def` to another item of the same category/weight) on an `identified: false` item yields the identical `decide(...)` action across exploration, combat, healing, and fountain scenarios.
- [x] **Non-spoiling sweep (#2):** Driving `itemSighted`, `pickedUp`, `dropped`, and `died.drops` with a high-value (`>= NOTABLE_ITEM_VALUE`), `identified: false` appearance item produces zero `{ ref: defId }` `LogPart` mentions, `false` from `highlightWhen`, `null` from chronicle rules, and `[]` from `discoveriesOf`.
- [x] **Exhaustive effect potency contract (#3):** A `Record<Effect['kind'], ...>` test map exercises every `Effect` kind at `potency = 0.5`, `1`, and `1.5` (or `2`), causing a TypeScript compile error if a new `Effect` kind is added without a potency test.
- [x] **Codex reachability check (#4):** Every non-`alwaysKnown`, non-`hidden` entry across registered Codex renderers is proven reachable by `discoveriesOf` via a fixture event table or seeded discovery sweep.
- [x] **Canonical `ItemPropertyKind` check (#5):** Every registered `ItemPropertyKind` schema rejects its canonical no-op/default value (`0`, `true`, `[]`, `{}` as applicable).
- [x] **Range clamping utility (#6):** A small `clampRange(minOpt, maxOpt, defaultMin, defaultMax)` helper (used by `respawnFloor` and similar range options) computes `max` before clamping `min <= max`, tested with `{ max: 0 }`, `{ min: 0, max: 0 }`, and `{ min: 5 }`.

## Notes
- **Recommended implementation order:** Land #1, #2, and #3 first (highest ROI and zero flakiness), followed by #4, #5, and #6 in the same PR (total scope fits cleanly in Size `S`).
- For #1, be sure to hold item `weight` equal when swapping `def` (or test at light encumbrance) so weight differences don't legitimately change pickup/encumbrance decisions.
- For #4, registries with entries that only appear in later milestones (e.g. hand-crafted artifacts or `weight: 0` smithy enchantments) can be covered via a small table of representative events rather than relying solely on random loot RNG.
- **ID reservation note:** `ETH-129` (PR #83) and `ETH-130` (PR #84) are allocated on their respective branches.
- **Branch & PR sequencing:** Implemented on local branch `eth-131-contract-property-guards` with `eth-025-return-trip` (PR #83) and `eth-044-enchant-curse-identify` (PR #84) merged locally (`STATE_VERSION = 28`). The branch has not been pushed to GitHub yet; once PRs #83 and #84 merge to `main`, rebase `eth-131-contract-property-guards` onto `main` (reconciling `STATE_VERSION`, `docs/ARCHITECTURE.md`, and `backlog/INDEX.md` if needed) before pushing and opening its PR.

## Log
- 2026-11-23: Created from `ETH-025` / `ETH-044` code review recommendations with Impact, Effort, and Value ratings.
- 2026-11-23: Implemented all 6 contract and property-based guards (`test/sim/enchantIdentify.test.ts`, `test/ui/logText.test.ts`, `test/sim/stats.test.ts`, `test/ui/codex.test.tsx`, `test/sim/itemProperties.test.ts`, `src/core/range.ts` + `test/core/range.test.ts`), fixed two real hardening findings surfaced by the guards (`PROP_IDENTIFIED.value` unknown-type value leak via `UNKNOWN_TYPE_VALUE`, and `PROP_ORIGIN` rejecting `{}`), and documented critical-service testing criteria in `docs/ARCHITECTURE.md` §11.6, `backlog/README.md`, and `CLAUDE.md`.
- 2026-11-23: Added branch/PR sequencing note (`eth-131-contract-property-guards` awaits rebase onto `main` after PRs #83 and #84 merge).
- 2026-11-23: Rebased onto main (bundled with docs/DIFFICULTY_PHILOSOPHY.md) and merged to main; PENDING REVIEW.
