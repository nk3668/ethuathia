---
id: ETH-157
title: Split src/sim/combat/encounters.ts into focused modules
type: chore
status: idea
priority: P3
milestone: M2
epic: dungeon-gen
size: M
depends_on: []
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
- [ ] The file is split along its concerns (for example threat budgeting, group engagement,
      corridor patrols), with the public API re-exported from the original path; **or** it keeps
      an `eslint-disable max-lines` comment with a stated reason.
- [ ] Behavior-neutral: no test changes, and the fixed-seed state hashes match (T0 identity
      check, `docs/DIFFICULTY_PHILOSOPHY.md` §9).
- [ ] `npm run lint` shows no `max-lines` warning for this file.

## Notes
Refactor on green, in its own commit (§10.1).

## Log
- 2026-11-24: Created.
