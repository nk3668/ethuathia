---
id: ETH-076
title: Sim compare warns when its base has moved since the branch was cut
type: chore
status: ready
priority: P3
milestone: M1
epic: tools-balance
size: S
depends_on: [ETH-056]
created: 2026-11-18
updated: 2026-11-18
---

## Summary
`npm run sim -- --compare origin/main` warns when origin/main has commits the branch doesn't contain, because hash diffs then mix in other people's changes.

## Why
Follow-up from ETH-074: agents misread diffs that came from main moving.

## Acceptance criteria
- [ ] The compare prints a clear warning naming how many commits origin/main is ahead of the merge base
- [ ] The warning suggests rebasing or comparing against the merge base
- [ ] An option `--compare merge-base` compares against the merge base instead

## Log
- 2026-11-18: Created from Nate's interview answers (2026-11-18).
