---
id: ETH-175
title: Kit button that explains why it is disabled, with a tooltip
type: feature
status: done
priority: P2
milestone: M2
epic: ui-shell
size: S
depends_on: [ETH-086, ETH-172]
assignee: antigravity
created: 2026-11-24
updated: 2026-11-24
---

## Summary
A shared kit component for a button that stays visible but disabled, with the reason in a tooltip and read out to screen readers. Use it everywhere a button can be disabled for a reason the player should know.

## Why
A disabled `<button>` gets no hover or focus events, so a `Tooltip` around it never shows. ETH-086 solved this locally with `GuardedButton` in `src/ui/town/UpgradeTree.tsx` (a focusable wrapper span plus `sr-only` text). Every number and control should explain itself (`CLAUDE.md` §1 "Readable", §8 "Every number and icon has a tooltip").

## Acceptance criteria
- [x] The kit (`src/ui/kit/`) exports a button that takes an optional `disabledReason`: when it is set the button is disabled, the reason shows in a tooltip on hover and keyboard focus, and screen readers read it
- [x] `GuardedButton` in `UpgradeTree.tsx` is replaced by it
- [x] Other buttons that are disabled for a reason the player can't see are found and switched (Prepare screen, run summary, Town); list them in the PR
- [x] Tests (jsdom): the tooltip appears on focus of a disabled button; the reason is in the accessible name or description; an enabled button behaves as before

## Notes
Found while reviewing ETH-086 (PR #91).

## Log
- 2026-11-24: Created from the ETH-086 review; Nate asked for it in M2.
- 2026-11-24: Assigned to Antigravity (Gemini) by Nate. Added ETH-172 to depends_on: it adds rank labels and tier dividers to the same Town tree, so start after it is done and cover its buttons too.
- 2026-11-24: Implemented on `eth-175-disabled-button-tooltips` (commit `a498b6d`): added `disabledReason` and `tooltipPlacement` to `Button` (`src/ui/kit/Button.tsx`, `Button.module.css`) with a focusable `.disabledTrigger` span (`pointer-events: none` on the disabled `<button>`), `Tooltip`, and `sr-only` `aria-describedby` reason. Replaced `GuardedButton` and switched disabled-with-reason buttons in `UpgradeTree` (`Reset tree`, `Respec`, and `Buy` including ETH-172 ranked/tier-gated nodes), `PartyColumn` (`PackAction` / cursed worn gear `Cursed`), and `SaveOptions` (`Save now` and `Import text`); audited `PrepareScreen`, `ContractsPanel`, `DungeonPanel`, `RunSummary`, `SpeedControls`, and `Tabs` (left intentionally unchanged). Added sample in `KitGallery`, updated `docs/ARCHITECTURE.md` §8.1, and added tests in `test/ui/kit.test.tsx`, `test/ui/town.test.tsx`, `test/ui/townRanks.test.tsx`, `test/ui/profileStore.test.tsx`, and `test/ui/possession.test.tsx`. Marked `pending-review`; verified with `npm run check` (114 test files / 1398 tests) and `npm run build`.
- 2026-11-24: Reviewed by Claude: npm run check green merged with main (timeouts seen only under machine load; reruns pass). Merged; status done.
