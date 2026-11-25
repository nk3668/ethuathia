---
id: ETH-197
title: The Library building and its building quest
type: feature
status: idea
priority: P1
milestone: M3
epic: town-meta
size: S
depends_on: [ETH-093, ETH-170]
created: 2026-11-25
updated: 2026-11-25
---

## Summary
Add the Library as a town building, opened by its own building quest in the chain after the Smithy (`CLAUDE.md` §4). The tree itself is ETH-163.

## Why
Neither the Library nor its quest exists yet: `src/content/buildingQuests.ts` says the quests of later buildings "come with those buildings". The Library is where tactics are unlocked.

## Acceptance criteria
- [ ] A Library building quest offered once the set share of the open buildings' nodes is bought (ETH-093, ETH-161 pacing). The quest has to be doable with today's content. CLAUDE.md's example, "recover a tome from a named foe", needs named foes (ETH-026, M6), so the spec picks a stand-in, e.g. recover a tome from a mid-depth floor. Checked with Nate.
- [ ] The Library appears in the town, locked until the quest is done, and its tier quest uses the ETH-170 mechanism.
- [ ] The starter tactics set (ETH-163) works before the Library opens.
- [ ] Codex, tooltip and log text. `npm run check` passes.

## Log
- 2026-11-25: Created from the tactics design (Nate, 2026-11-25).
