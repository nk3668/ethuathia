---
id: ETH-184
title: Run-scope kill and identify counts, so the Reaver and Lorekeeper get their intended reveals
type: feature
status: ready
priority: P2
milestone: M2
epic: characters
size: S
depends_on: [ETH-036, ETH-121]
created: 2026-11-24
updated: 2026-11-24
---

## Summary
Add two run-scope conditions, "the party has killed at least N monsters this run" and "the party has identified at least N items this run", and switch the Reaver's and Lorekeeper's reveals to them.

## Why
ETH-036 approved the Reaver revealing at 40 kills in a run and the Lorekeeper at 5 identifications in a run, but no run-scope condition could count either, so it used fallbacks (reach floor 5; finish 5 runs). Nate (2026-11-24): add them.

## Acceptance criteria
- [ ] Two run-scope conditions on the ETH-121 requirement system (e.g. `cond.run_kills` and `cond.run_identified`, each with a `min` count), read from what the run already tracks (`track.kills`; identification events), with condition words for tooltips ("killed 40 monsters in one run")
- [ ] The Reaver's reveal becomes `metInRun` 40 kills, the Lorekeeper's 5 identifications; the Codex training row and the sealed-node text show the new wording
- [ ] Saves that already revealed either class under the old fallback keep the reveal (the milestone record stays)
- [ ] Extend the §11.6 guards if a new condition falls under them (`docs/ARCHITECTURE.md`)
- [ ] Tests: each condition true and false at the boundary; the reveal records once from a run that meets it; an old recorded reveal survives
- [ ] Sim: the default sim is unchanged (`--compare origin/main`, identical state hashes)

## Log
- 2026-11-24: Created from ETH-036's report (fallback reveals); Nate asked for it.
