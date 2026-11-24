---
id: ETH-148
title: Smarter fleeing: hysteresis, only from real threats, and no walking back into danger
type: bug
status: idea
priority: P2
milestone: M1.6
epic: adventurer-ai
size: M
depends_on: [ETH-145]
created: 2026-11-24
updated: 2026-11-24
---

## Summary
Three faults in how the baseline handles a wounded adventurer:
- **Flip-flopping.** Flee is decided from this turn's HP alone, so an adventurer hovering around the
  threshold flips between fleeing and `act.explore` while monsters are still chasing.
- **Fleeing from harmless monsters.** Flee reacts to any visible enemy, including ones that can't hurt
  the party.
- **Walking back into danger.** Once out of sight, exploring and item pickup lead a wounded adventurer
  with no healing straight back toward the enemy it just fled.

Fix all three so fleeing actually gets the adventurer out of danger.

## Why
- **ETH-145 diagnosis** (seed 4, progressed party of 4): Tamsin fled alone, then went back to
  `act.explore` at 33% HP with a clinker automaton and a fetid stalker still on her trail, and died.
- **ETH-142 follow-up** (fresh party of 4, seeds 189 and 185): the last survivor, at low HP with no
  healing, swapped between two tiles forever. On one an enemy was in sight, so `act.flee` fired; on the
  other it wasn't, so `act.pick_up` or `act.explore` walked it back. In seed 189 the "threat" was moss
  tenders, which have `damage: 0` and only heal their kin. Loiter-aware stuck detection (7e18da8) now
  breaks the loop, but only after it has wasted 10 decisions; the behavior itself is still wrong.
- `CLAUDE.md` §5.3: the baseline flees at very low HP *when an escape route exists*. Flip-flopping or
  walking back wastes the escape, and fleeing from something harmless wastes turns.

## Acceptance criteria
- [ ] **Only real threats:** flee (and its "enemy in sight" checks) consider only enemies that can
      hurt the party: those with damage above 0, a damaging role power (e.g. a bolt), or a damaging
      status or bundle effect. Monsters like moss tenders (`damage: 0`, heal kin) don't trigger flight.
      One shared helper decides "is a threat", so flee, hysteresis and the avoidance below all agree.
      Content-driven, not a hard-coded list.
- [ ] **Hysteresis:** once fleeing starts, the adventurer keeps fleeing (or regrouping, per ETH-145)
      until HP is back above a higher release threshold **or** no threat has been visible for N turns.
      Both are shared constants.
- [ ] **No walking back:** while an adventurer is wounded (below the release threshold) and has no
      healing, `act.explore` and `act.pick_up` avoid tiles near a remembered threat's last known
      position (e.g. by weighting the goal map). The memory fades after N turns.
- [ ] The trace says why: "still fleeing: a fetid stalker is in pursuit, HP 33%", "ignoring the moss
      tender: it can't hurt anyone", "avoiding the crypt sentinel's last position while wounded".
- [ ] Sim tests, fixed seed and hand-built map:
  - a pursued adventurer at the threshold doesn't return to exploring until the release condition
    holds, and one with no pursuer releases normally;
  - an adventurer at low HP doesn't flee from a harmless monster;
  - a wounded adventurer with no healing doesn't path back past a remembered threat to reach an item
    or unexplored tile, when another way exists.
- [ ] Codex and tooltip text for flee mention the threat rule and the hysteresis.
- [ ] Sim gate per `docs/DIFFICULTY_PHILOSOPHY.md` §9 (balance-affecting AI change): T2 paired compare
      for party 1 and 4. The party-size ordering (ETH-145 check) still holds. `npm run check` passes.

## Notes
- Needs a little per-actor AI memory ("fleeing since", threat last-seen positions); keep it serializable,
  and bump `STATE_VERSION` if the state shape changes.
- The threat helper may belong next to `visibleEnemies` (`src/sim/combat/rules.ts`). Check whether
  `cond.safe_to_test` (ETH-142) should use it too: a harmless monster in sight shouldn't block testing
  a scroll.
- Found by the ETH-145 agent (hysteresis) and the ETH-142 agent (harmless threats, walking back).

## Log
- 2026-11-24: Created from the ETH-145 diagnosis (Nate approved filing).
- 2026-11-24: Widened per Nate: flee only from real threats (moss tenders, ETH-142 follow-up seed
  189), and no walking back into danger while wounded without healing (seeds 189/185). Size S → M;
  title updated.
