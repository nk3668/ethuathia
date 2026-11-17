---
id: ETH-065
title: Codex tab, discovery tracking and Explain tooltips from content
type: feature
status: ready
priority: P1
milestone: M2
epic: codex-tooltips
size: M
depends_on: [ETH-059]
created: 2026-11-17
updated: 2026-11-17
---

## Summary
A Codex that fills in as things are discovered, plus a shared `Explain` tooltip that renders any content def by id.

## Why
See `CLAUDE.md` §1 (Readable), §8 (Codex). Many items need "a Codex entry" and should only add data.

## Acceptance criteria
- [ ] A discovery tracker turns sim events (first seen, first killed, first used) into `codex` discoveries in the run result; `applyRunResult` merges them into the Profile
- [ ] Codex tab: sections per content kind (classes, races, monsters, items, Omens, deities…), undiscovered entries shown as unknown, search box
- [ ] Each content kind can register a Codex renderer (fields shown, grouping key such as monster family) without editing the tab
- [ ] `Explain` tooltip component renders a def's name, description and key stats by id; used by the log and map inspect
- [ ] Tests for the tracker and a component test for the tab

## Log
- 2026-11-17: Created as part of the backlog fan-out plan.
