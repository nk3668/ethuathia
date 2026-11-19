---
id: ETH-076
title: Sim compare warns when its base has moved since the branch was cut
type: chore
status: done
priority: P3
milestone: M1
epic: tools-balance
size: S
depends_on: [ETH-056]
created: 2026-11-18
updated: 2026-11-19
---

## Summary
`npm run sim -- --compare origin/main` warns when origin/main has commits the branch doesn't contain, because hash diffs then mix in other people's changes.

## Why
Follow-up from ETH-074: agents misread diffs that came from main moving.

## Acceptance criteria
- [x] The compare prints a clear warning naming how many commits origin/main is ahead of the merge base
- [x] The warning suggests rebasing or comparing against the merge base
- [x] An option `--compare merge-base` compares against the merge base instead

## Log
- 2026-11-18: Created from Nate's interview answers (2026-11-18).
- 2026-11-19: (default) `--compare merge-base` resolves against `origin/main` (falling back to `main` when `origin/main` does not exist) — alternative: a `--base` flag or `merge-base:<ref>` syntax.
- 2026-11-19: Implemented by Gemini; marked pending-review (PR opened, not merged).
- 2026-11-19: Reviewed by Claude and merged as PR #70. Done.
