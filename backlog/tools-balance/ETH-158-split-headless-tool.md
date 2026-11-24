---
id: ETH-158
title: Split tools/headless.ts into focused modules
type: chore
status: idea
priority: P3
milestone: M2
epic: tools-balance
size: M
depends_on: []
created: 2026-11-24
updated: 2026-11-24
---

## Summary
`tools/headless.ts` has about 825 lines of code (1,040 with blanks and comments), past the
600-line split point in `docs/ARCHITECTURE.md` §10.1, and trips the `max-lines` lint warning.
Split it along its concerns, or record why it should stay whole.

## Why
Files should stay small and single-purpose so they are easy to read and change
(`docs/ARCHITECTURE.md` §10.1). Found when the `max-lines` warning was added.

## Acceptance criteria
- [ ] The file is split along its concerns (for example running a seed, aggregating results,
      report formatting, compare and baseline I/O), with the public API re-exported from the
      original path; **or** it keeps an `eslint-disable max-lines` comment with a stated reason.
- [ ] `npm run sim` output (including the state hash column) and `test/tools/headless.test.ts`
      are unchanged.
- [ ] `npm run lint` shows no `max-lines` warning for this file.

## Notes
Refactor on green, in its own commit (§10.1).

## Log
- 2026-11-24: Created.
