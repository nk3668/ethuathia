---
id: ETH-157
title: Split src/sim/combat/encounters.ts into focused modules
type: chore
status: pending-review
priority: P2
milestone: M2
epic: dungeon-gen
size: M
depends_on: []
assignee: antigravity
created: 2026-11-24
updated: 2026-11-24
---

## Summary
`src/sim/combat/encounters.ts` has about 1,090 lines of code (1,290 with blanks and comments),
well past the 600-line split point in `docs/ARCHITECTURE.md` §10.1, and trips the `max-lines`
lint warning. Split it along its concerns, or record why it should stay whole.

## Why
Files should stay small and single-purpose so they are easy to read and change
(`docs/ARCHITECTURE.md` §10.1). Found when the `max-lines` warning was added.

## Acceptance criteria
- [x] The file is split along its concerns (for example threat budgeting, group engagement,
      corridor patrols), with the public API re-exported from the original path; **or** it keeps
      an `eslint-disable max-lines` comment with a stated reason.
- [x] Behavior-neutral: no test changes, and the fixed-seed state hashes match (T0 identity
      check, `docs/DIFFICULTY_PHILOSOPHY.md` §9).
- [x] `npm run lint` shows no `max-lines` warning for this file.

## Notes
Refactor on green, in its own commit (§10.1).

## Log
- 2026-11-24: Created.
- 2026-11-24: Assigned to Gemini (Antigravity); Claude reviews the PR.
- 2026-11-24: Split `src/sim/combat/encounters.ts` into `encounterShared.ts`, `encounterPatrols.ts`, `encounterSurge.ts`, and `encounters.ts` preserving the exact public API (commit `8b5b235`); `npm run check` passed (0 errors, 0 `max-lines` warnings on `src/sim/combat/encounter*.ts`, 108 test files / 1323 tests), and both 20-seed T0 `npm run sim -- --compare origin/main` checks (default fresh party-1 and `--preset progressed --party 4`) produced 0 state-hash diffs. Marked `pending-review`.
