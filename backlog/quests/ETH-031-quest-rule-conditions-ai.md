---
id: ETH-031
title: Quest rule conditions and objective weighting in the AI
type: feature
status: idea
priority: P2
milestone: M3
epic: quests
size: M
depends_on: [ETH-024, ETH-029]
created: 2026-11-17
updated: 2026-11-17
---

## Summary
Adds rule conditions `contract complete`, `bounty target seen` and `carrying relic`, and makes the baseline AI weigh contract and bounty targets in goal selection.

## Why
Lets the player decide how much the party chases bounties versus the contract. See `CLAUDE.md` §5.2 and §6 (Quests).

## Acceptance criteria
- [ ] The three conditions exist in the rule vocabulary, with Codex and tooltip text
- [ ] The baseline gives contract targets high weight and bounty targets light weight while exploring
- [ ] The trace explains when a goal was chosen because of a contract or bounty
- [ ] Sim tests with a hand-built map cover each condition

## Notes
- None yet.

## Log
- 2026-11-17: Created from a design discussion on quests, depth and extra features.
