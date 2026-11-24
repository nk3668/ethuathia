---
epic: tools-balance
title: Test and balance tooling
status: active
milestones: [M0, M1, M1.5, M1.6, M2, M3, M4, M5, M6, M7, M8]
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
- [x] [ETH-080 Systemic monster, loot and progression balance pass (M1.5 capstone)](ETH-080-monster-balance-pass.md)
- [x] [ETH-131 Cross-domain contract and property-based test guards](ETH-131-contract-and-property-guards.md)
- [x] [ETH-143 Content check that every discoverable def can actually appear in a run](ETH-143-content-spawn-reachability-check.md)
- [x] [ETH-145 Fix the party-size inversion so solo is the hardest way to play](ETH-145-party-size-ordering.md)
- [ ] [ETH-146 Composition and rules balance pass (M4 capstone)](ETH-146-composition-balance-pass.md)
- [x] [ETH-149 Tooling hygiene: formatter policy, line endings and worktree-safe tests](ETH-149-tooling-hygiene.md)
- [x] [ETH-178 Sim harness option for a random mixed party, as players get it](ETH-178-sim-mixed-party.md)
- [x] [ETH-152 Run harness seeds in parallel across CPU cores](ETH-152-parallel-sim-harness.md)
- [ ] [ETH-153 Scale the return-trip surge with party size](ETH-153-party-scaled-return-surge.md)
- [ ] [ETH-161 Meta-loop economy balance pass (M2 capstone)](ETH-161-meta-loop-economy-balance.md)
- [ ] [ETH-165 Rules and presets balance pass (M3 capstone)](ETH-165-rules-balance-pass.md)
- [ ] [ETH-166 Foes and loot balance pass (M5 capstone)](ETH-166-foes-and-loot-balance-pass.md)
- [ ] [ETH-167 Quests, Omens and reward multiplier balance pass (M6 capstone)](ETH-167-quests-and-risk-balance-pass.md)
- [ ] [ETH-168 Lineage balance pass (M7 capstone)](ETH-168-lineage-balance-pass.md)
- [ ] [ETH-169 Deities, merchants and themed dungeons balance pass (M8 capstone)](ETH-169-gods-and-world-balance-pass.md)
