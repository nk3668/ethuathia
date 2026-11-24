---
id: ETH-167
title: Quests, Omens and reward multiplier balance pass (M6 capstone)
type: chore
status: idea
priority: P2
milestone: M6
epic: tools-balance
size: M
depends_on: [ETH-026, ETH-027, ETH-029, ETH-067, ETH-141]
created: 2026-11-24
updated: 2026-11-24
---

## Summary
Check that each opt-in risk (extra contracts, Omen ranks, bounties) pays enough to be worth taking and never pays enough to be mandatory.

## Why
"Risk is a choice" (`CLAUDE.md` §1). The milestone balance check (`docs/DIFFICULTY_PHILOSOPHY.md` §9.1).

## Acceptance criteria
- [ ] Expected currency per hour rises with Omen level for a competent rule set and falls for the baseline
- [ ] Contract rewards compensate for their added wipe risk
- [ ] T3 acceptance sweep recorded in the Log

## Log
- 2026-11-24: Created in the backlog reorganization by theme.
