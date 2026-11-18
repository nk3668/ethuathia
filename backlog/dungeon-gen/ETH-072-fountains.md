---
id: ETH-072
title: Fountains with a documented effect table and a drink action
type: feature
status: ready
priority: P2
milestone: M4
epic: dungeon-gen
size: M
depends_on: [ETH-057, ETH-058]
created: 2026-11-18
updated: 2026-11-18
---

## Summary
Fountains appear on some floors. Drinking from one has a seeded effect from a small, readable table.

## Why
The Dry Wells Omen and the "drink from a fountain" bounty both assume fountains exist (`CLAUDE.md` §6). Found as a follow-up of ETH-039.

## Acceptance criteria
- [ ] A fountain feature def with glyph and Codex entry; a gen step places 0–2 per floor (seeded)
- [ ] `drink` action and `act.drink_fountain` rule action; effects are bundles from a weighted table in content (heal, a short buff, a mild debuff, nothing), shown in the Codex once seen
- [ ] A fountain can run dry after N uses; events and log text
- [ ] Baseline: drink only when hurt and no healing potion is carried
- [ ] Exposes a run param the Dry Wells Omen (ETH-067) can set to remove fountains
- [ ] Hand-map sim tests

## Log
- 2026-11-18: Created from the ETH-039 survey follow-ups.
