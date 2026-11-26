---
id: ETH-162
title: Tactics engine - tactic options as content that build each adventurer's rules
type: feature
status: pending-review
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
- [x] Content kind `tactic` (`src/content/tactics.ts`), validated at load. Each def has:
  - an axis
  - name, description and hint
  - rule rows, for stance, role and habit options
  - parameters, for range, focus and formation options
  - optional `exclusiveWith`, for habit pairs
  - optional `requires` and `favors` fields, validated but unused until M4
- [x] Building a rule list from the picks is pure and documented in `docs/ARCHITECTURE.md` §4:
  - rule order is stance overrides, then habits, then role, then the baseline
  - range, focus and formation reach rule actions through `AiCtx`
  - an option whose ability tag the adventurer lacks falls back to its general intent and says so in the trace
- [x] Each class has a **default build** in its content. Random recruits use it; roster adventurers store their own picks on their record (save migration). Off-class picks are allowed.
- [x] A `setTactics` command (party or one adventurer) applies on the next decision. It is covered by the determinism test's command script.
- [x] The `ruleFired` trace and the AI log line name the option ("Healer: mending Bram").
- [x] **Neutral picks reproduce today's behavior:** T0 identity holds (0 hash diffs) with tactics off. Hand-map sim tests on a fixed seed cover rule-list building, swapping mid-run and the tag fallback. `npm run check` passes.

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
- 2026-11-25: Built (branch eth-162-tactics-engine, commit 73567ae plus docs). Option content in src/content/tactics.ts (kind tactic, ids tactic.<name>), engine in src/sim/ai/tactics.ts, tacticActions.ts and tacticsCommand.ts; STATE_VERSION 41; adventurers slice version 2 (records carry optional tactics picks). Starter options: stance Steady and Fall back, formation Stick together and Loose, role Damage and Healer, range Front line and Back line, focus Weakest and Strongest, habit Quick to quaff; the first on each axis is neutral and every class's default build is the neutral set until ETH-193 and ETH-194. T0 against origin/main: the raw state hash differs on 20/20 seeds only because the serialized state gained its version bump and ai.tactics; every metric row is identical, and with the version and ai.tactics stripped from the hash 0 of 20 seeds differ. Smoke (20 seeds, party of 4 with Healer, Strongest focus, Back line and Quick to quaff on): 9 wins and 11 wipes against 10 and 10 with defaults, no stalls, mean depth 7.25 against 7.1. `npm run check` passes.
- 2026-11-25: Review fixes. Merged main (ETH-192 review fixes). act.use_ability no longer re-uses a heal-over-time source while Regenerating has RATION_REFRESH_TURNS or more left; unknown or wrong-axis picks fall back to the class default (never throw) with a trace note; content check: exactly one default option per axis but habits, with no rows and baseline params (formation leash/close equal PARTY_LEASH/PARTY_CLOSE, checked in checkGame); use_ability secrecy property test. Fall back is a placeholder that runs ahead of urgent rules; ETH-071 supersedes it. Stance and formation are stored per adventurer: members joining mid-run (ETH-089 recruits and companions) must copy the party's stance and formation. The Codex renderer for tactics is hidden: ETH-196's follow-up.
