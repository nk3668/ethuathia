---
id: ETH-164
title: Saved tactics loadouts for the party and each adventurer, ready for talent builds
type: feature
status: idea
priority: P1
milestone: M3
epic: behavior-rules
size: S
depends_on: [ETH-162, ETH-196, ETH-071]
created: 2026-11-24
updated: 2026-11-25
---

## Summary
The player saves named loadouts and applies them on the Prepare screen or the tactics panel. A loadout holds the party's stance and formation and each adventurer's role, range, focus and habits. Its format leaves room for each adventurer's talent build, which arrives in M4 (ETH-088).

## Why
"Saved loadouts could be nice. Incorporate the class talent trees as well" (Nate, 2026-11-25). See `CLAUDE.md` §5.2 and §4 (Builds).

## Acceptance criteria
- [ ] The player can save, rename, apply and delete loadouts. They are saved with the profile (save migration).
- [ ] There are two scopes:
  - **party loadouts** hold stance, formation and one build per slot
  - **adventurer builds** hold role, range, focus and habits
  
  A party loadout can point at adventurer builds or embed them.
- [ ] Applying a loadout skips options that are now locked or over the habit-slot limit, and says which ones.
- [ ] The adventurer-build record has a `talents` field, empty until ETH-088 fills it. ETH-088's named talent builds save into these records rather than a separate list.
- [ ] A few shipped loadouts, e.g. "Careful", "Delver" and "Plunderer", use only starter options.
- [ ] Tooltips and Codex text. `npm run check` passes.

## Log
- 2026-11-24: Created in the backlog reorganization by theme.
- 2026-11-25: Rewritten for the tactics design: rule presets become saved tactics loadouts, with room for M4 talent builds.
- 2026-11-25: Also depends on ETH-071: loadouts hold the party stance.
