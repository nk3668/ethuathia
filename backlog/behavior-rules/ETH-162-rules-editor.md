---
id: ETH-162
title: Tactics engine - tactic options as content that build each adventurer's rules
type: feature
status: ready
priority: P1
milestone: M3
epic: behavior-rules
size: M
depends_on: [ETH-009, ETH-121, ETH-192]
created: 2026-11-24
updated: 2026-11-25
---

## Summary
The sim side of tactics (`CLAUDE.md` §5.2). A content kind `tactic` defines named options on six axes: stance, formation, role, range, focus and habit. The party picks a stance and a formation, and each adventurer picks a role, range, focus and habits. The sim builds each adventurer's player rule list from those picks, ahead of the baseline. The player can swap picks at any time, mid-run included.

## Why
Nate rejected a free-form rules editor (2026-11-25). The player chooses tactics we design and swaps them on the fly. This item is the engine every other M3 tactics item builds on.

## Acceptance criteria
- [ ] Content kind `tactic` (`src/content/tactics.ts`), validated at load. Each def has:
  - an axis
  - name, description and hint
  - rule rows, for stance, role and habit options
  - parameters, for range, focus and formation options
  - optional `exclusiveWith`, for habit pairs
  - optional `requires` and `favors` fields, validated but unused until M4
- [ ] Building a rule list from the picks is pure and documented in `docs/ARCHITECTURE.md` §4:
  - rule order is stance overrides, then habits, then role, then the baseline
  - range, focus and formation reach rule actions through `AiCtx`
  - an option whose ability tag the adventurer lacks falls back to its general intent and says so in the trace
- [ ] Each class has a **default build** in its content. Random recruits use it; roster adventurers store their own picks on their record (save migration). Off-class picks are allowed.
- [ ] A `setTactics` command (party or one adventurer) applies on the next decision. It is covered by the determinism test's command script.
- [ ] The `ruleFired` trace and the AI log line name the option ("Healer: mending Bram").
- [ ] **Neutral picks reproduce today's behavior:** T0 identity holds (0 hash diffs) with tactics off. Hand-map sim tests on a fixed seed cover rule-list building, swapping mid-run and the tag fallback. `npm run check` passes.

## Notes
- Shipping the actual options is split out:
  - stances: ETH-071
  - formation: ETH-151
  - roles, ranges and focuses: ETH-193
  - habits and habit slots: ETH-194
  - the Controller role: ETH-195
  - UI: ETH-196
  - unlocks: ETH-163
  - loadouts: ETH-164

  This item ships one or two options per axis, as test fixtures or the starter defaults.
- ARCHITECTURE §4 already plans `paramSchema`; parameters for tactics are fixed per option, not set by the player.
- No automatic switching (Nate, 2026-11-25): only the player changes tactics.

## Log
- 2026-11-24: Created in the backlog reorganization by theme (gap: no item built the editor).
- 2026-11-25: Rewritten for the tactics design (Nate, 2026-11-25): named tactics the player picks and swaps, no rules editor and no auto-switching. Now `ready`.
