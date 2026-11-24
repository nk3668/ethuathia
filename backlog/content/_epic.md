---
epic: content
title: Content definitions
status: active
milestones: [M0, M7]
---

## Goal
Classes, races, monsters, items and the rest exist as validated data that the sim, Codex and tooltips all read.

## Scope
**In:**
- Content registries and `define*` helpers
- Schema and cross-reference validation
- Text templates for log lines
- The actual monsters, items, classes and races

**Out (later or elsewhere):**
- Upgrade node content (see `town-meta`)
- Omen and deity content (see `risk-omens`, `deities`)

## Design refs
- `CLAUDE.md` §9: Content is data
- `docs/ARCHITECTURE.md` §2.1, §5

## Items
- [x] [ETH-015 Content registry with validation and first definitions](ETH-015-content-registry-first-defs.md)
- [x] [ETH-122 Seeded text generator: grammar templates for names, titles, epitaphs, ballads and backstories](ETH-122-seeded-text-generator.md)
