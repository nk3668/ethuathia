---
epic: tools-balance
title: Test and balance tooling
status: active
milestones: [M0, M1]
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

## Items
- [x] [ETH-016 Determinism test and headless run script](ETH-016-determinism-headless-run.md)
- [x] [ETH-022 Run content validation as a tsx command](ETH-022-validate-content-cli.md)
- [ ] [ETH-056 Safety net: state invariants, soak test, app-boot smoke test and sim compare](ETH-056-invariants-soak-compare.md)
