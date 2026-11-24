---
id: ETH-175
title: Kit button that explains why it is disabled, with a tooltip
type: feature
status: ready
priority: P2
milestone: M2
epic: ui-shell
size: S
depends_on: [ETH-086]
created: 2026-11-24
updated: 2026-11-24
---

## Summary
A shared kit component for a button that stays visible but disabled, with the reason in a tooltip and read out to screen readers. Use it everywhere a button can be disabled for a reason the player should know.

## Why
A disabled `<button>` gets no hover or focus events, so a `Tooltip` around it never shows. ETH-086 solved this locally with `GuardedButton` in `src/ui/town/UpgradeTree.tsx` (a focusable wrapper span plus `sr-only` text). Every number and control should explain itself (`CLAUDE.md` §1 "Readable", §8 "Every number and icon has a tooltip").

## Acceptance criteria
- [ ] The kit (`src/ui/kit/`) exports a button that takes an optional `disabledReason`: when it is set the button is disabled, the reason shows in a tooltip on hover and keyboard focus, and screen readers read it
- [ ] `GuardedButton` in `UpgradeTree.tsx` is replaced by it
- [ ] Other buttons that are disabled for a reason the player can't see are found and switched (Prepare screen, run summary, Town); list them in the PR
- [ ] Tests (jsdom): the tooltip appears on focus of a disabled button; the reason is in the accessible name or description; an enabled button behaves as before

## Notes
Found while reviewing ETH-086 (PR #91).

## Log
- 2026-11-24: Created from the ETH-086 review; Nate asked for it in M2.
