---
id: ETH-158
title: Split tools/headless.ts into focused modules
type: chore
status: done
priority: P2
milestone: M2
epic: tools-balance
size: M
depends_on: []
assignee: antigravity
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
- [x] The file is split along its concerns (for example running a seed, aggregating results,
      report formatting, compare and baseline I/O), with the public API re-exported from the
      original path; **or** it keeps an `eslint-disable max-lines` comment with a stated reason.
- [x] `npm run sim` output (including the state hash column) and `test/tools/headless.test.ts`
      are unchanged.
- [x] `npm run lint` shows no `max-lines` warning for this file.

## Notes
Refactor on green, in its own commit (§10.1).

## Log
- 2026-11-24: Created.
- 2026-11-24: Assigned to Gemini (Antigravity); Claude reviews the PR.
- 2026-11-24: Split `tools/headless.ts` into `tools/headless/{config,runner,summary,format,args}.ts`, preserved the full public API from `tools/headless.ts` (including `--jobs` in JSDoc), and updated `jobsFlagSupported` in `tools/compare.ts` to inspect both `tools/headless/args.ts` and `tools/headless.ts` (commit `60a7b5a`, rebased onto `origin/main` `0e8a55a`). Verified with `npm run check` (0 lint errors, 0 `max-lines` warnings on `tools/headless.ts` / `tools/headless/*.ts`, 108 test files / 1323 tests passing), `npm run sim -- --seeds 5 --jobs 1`, and `npm run sim -- --seeds 20 --compare origin/main` (0 hash diffs across all 20 shared seeds, all deltas 0). Set to `pending-review`.
- 2026-11-24: Reviewed by Claude (npm run check green merged with main; sim state hashes identical to main). Merged; status done.
