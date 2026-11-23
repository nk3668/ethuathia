---
epic: tools-balance
title: Test and balance tooling
status: active
milestones: [M0, M1, M1.5, M1.6, M2, M3]
---

## Goal
Confidence that the sim is deterministic and that balance changes are measured, not guessed.

## Scope
**In:**
- Determinism and save round-trip tests
- Headless run script
- Balance harness report
- Content validation command

**Out (later or elsewhere):**
- Unit tests for individual features (they live with each item)

## Design refs
- `CLAUDE.md` §9: Balance harness
- `docs/ARCHITECTURE.md` §10
- `docs/DIFFICULTY_PHILOSOPHY.md`

## Items
- [x] [ETH-016 Determinism test and headless run script](ETH-016-determinism-headless-run.md)
- [x] [ETH-022 Run content validation as a tsx command](ETH-022-validate-content-cli.md)
- [x] [ETH-056 Safety net: state invariants, soak test, app-boot smoke test and sim compare](ETH-056-invariants-soak-compare.md)
- [x] [ETH-076 Sim compare warns when its base has moved since the branch was cut](ETH-076-sim-compare-stale-base-warning.md)
- [ ] [ETH-080 Systemic monster, loot and progression balance pass (M1.5 capstone)](ETH-080-monster-balance-pass.md)
- [x] [ETH-131 Cross-domain contract and property-based test guards](ETH-131-contract-and-property-guards.md)
- [ ] [ETH-143 Content check that every discoverable def can actually appear in a run](ETH-143-content-spawn-reachability-check.md)
- [ ] [ETH-145 Fix the party-size inversion so solo is the hardest way to play](ETH-145-party-size-ordering.md)
- [ ] [ETH-146 Composition and rules balance pass (M3 milestone balance check)](ETH-146-composition-balance-pass.md)
