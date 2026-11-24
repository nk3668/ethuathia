---
id: ETH-160
title: Starter set of unlockable classes and races
type: content
status: done
priority: P1
milestone: M2
epic: characters
size: M
depends_on: [ETH-033, ETH-034, ETH-081, ETH-176]
created: 2026-11-24
updated: 2026-11-24
---

## Summary
Add a small starter set of classes and races beyond Vanguard and Human, each defined by attributes, growth and starting gear, so the Guild Hall has something to unlock.

## Why
Only `class.vanguard` and `race.human` exist, so class and race unlocks (ETH-036) have nothing to unlock. Signature abilities and AI roles come later, in M4 (ETH-037, ETH-038). This item only gives the classes different statistical identities. See `CLAUDE.md` §4 (Guild Hall).

## Proposal (for Nate to approve)
What a class can differ in today: its four attributes, their growth rolls, and (with ETH-176) its starting weapon and armor. Each weapon type scales damage with one attribute (sword and dagger: Finesse; axe and mace: Brawn; staff: Wits). Attributes also drive the second-job chances (Wits: identify and trap spotting; Finesse: disarm and flee; Brawn: forcing doors; Grit: status resistance). There are no spells until M4, so MP does nothing yet.

Every class has the Vanguard's budget: 37 starting points and +3.25 points per level on average. Every race's adjustments sum to about the Human's +4, and a speed change is paid for in points.

**Classes**

| Class | Brawn / Finesse / Wits / Grit | Growth per level (avg) | Kit (ETH-176) | Plays as |
|---|---|---|---|---|
| Vanguard (exists) | 11 / 9 / 4 / 13 | B +1, F +0.5, W +0.25, G +1.5 | Oak cudgel (mace), round shield | Tank: most HP, slow to kill things |
| **Outrider** | 8 / 14 / 7 / 8 | B +0.75, F +1.5, W +0.5, G +0.5 | Skinning knife (dagger), soft boots | Scout: hits often, dodges, disarms traps and flees well; low HP |
| **Lorekeeper** | 6 / 9 / 14 / 8 | B +0.5, F +0.5, W +1.5, G +0.75 | Ashwood staff (staff), quilted jerkin | Scholar: identifies items and spots traps, Wits damage through the staff; most fragile. The M4 spellcaster |
| **Reaver** | 15 / 9 / 4 / 9 | B +1.5, F +0.5, W +0.25, G +1 | Iron hatchet (axe), iron cap | Glass cannon: hardest hitter, middling HP, carries the most. The hatchet is the only axe and gives +2 damage, the other kits +1; the harness says whether the Reaver needs points taken off |

Lore lines (Codex `description` and `hint`):
- **Outrider:** "A rider without a horse: the guild's eyes on the road ahead. Quick hands, quick feet, and no wish to be the one standing when the fighting starts." Hint: "Ranges ahead of the party and is first to see the trap."
- **Lorekeeper:** "A scholar of the guild's library who goes down to read the dungeon itself: its marks, its traps and the things it leaves lying about." Hint: "Reads the dark the way others read a ledger."
- **Reaver:** "A hireling from the border holds who settles every argument with an axe. Hits hard, thinks later." Hint: "Clears a room by making it smaller."

**Races**

| Race | Adjustments | Speed | Plays as |
|---|---|---|---|
| Human (exists) | +1 to each | 100 | Even |
| **Stonekin** | Brawn +2, Grit +3, Finesse −1 | 90 | Tough and strong, acts less often |
| **Fenling** | Finesse +2, Wits +2, Brawn −1, Grit −1 | 110 | Quick and sharp, frail |

- **Stonekin:** "Hill-dwellers who quarry their homes from the mountain and seem half quarried themselves. Slow to move and slower to fall." Hint: "Stone-boned folk who take a long time to fall over."
- **Fenling:** "Small, sharp-eyed folk of the reed marshes, quick on their feet and quicker to notice." Hint: "Marsh folk who see the snare before they step in it."

## Acceptance criteria
- [x] Spec reviewed by Nate before building (spec gate): names, lore and numbers above, or his changes
- [x] The three classes and two races are content defs with Codex text and tooltips; class kits use ETH-176
- [x] Until ETH-036 gates them, every new class and race is open from the start (`src/meta/prepare/available.ts` already does this); the Guild Hall Mastery list (ETH-087) shows only available classes plus any class with Mastery XP
- [x] `npm run sim` gets `--class <id>` and `--race <id>` to field a solo adventurer of one class and race
- [x] A T1 run (50 seeds per class with Human, and per race with Vanguard) shows each one within the band set in `docs/DIFFICULTY_PHILOSOPHY.md` §9 of the field, except the Lorekeeper, which may trail until M4 spells; tune the numbers above until they are, and put the table in the PR
- [x] The Lorekeeper's Codex text says it is a weak fighter until its spells arrive, so the gap reads as intended
- [x] Tests: content validation passes; each class's start matches its table row; each race's speed reaches the sim

## Balance (T1, 200 seeds, solo, fresh, The Old Delve at budgetMul 1.5, kits on)

| Adventurer | Win | Floor 3+ | Mean depth |
|---|---|---|---|
| Vanguard / Human (the field) | 21.0% | 96.0% | 6.1 |
| Outrider / Human | 22.5% | 96.5% | 6.1 |
| Lorekeeper / Human | 14.0% | 87.5% | 5.3 |
| Reaver / Human | 23.5% | 97.0% | 6.2 |
| Vanguard / Stonekin | 17.0% | 99.5% | 6.2 |
| Vanguard / Fenling | 21.5% | 98.0% | 6.0 |

On the spec numbers the harness showed (100 seeds): Outrider 100% wins (50 seeds), Reaver 65%, Lorekeeper 35%, Stonekin 9.5% (200 seeds), Fenling about 26%. Changes made to reach the band:
- **Outrider:** 8/12/6/6 (32 points, was 8/14/7/8), growth Finesse +0.75, Brawn +0.5, Grit +0.5, Wits +0.25 (+2 a level, was +3.25). Finesse buys accuracy, evasion and dagger damage at once, so on the shared budget it was worth far more than a point of Grit.
- **Reaver:** 12/8/4/8 (32 points, was 15/9/4/9), growth Brawn +1, Grit +0.75, Finesse +0.5, Wits +0.25 (+2.5 a level, was +3.25). The hatchet's +2 damage is the rest of its edge.
- **Lorekeeper:** 5/8/12/8 (33 points, was 6/9/14/8), growth unchanged. At spec it won 35%, ahead of the Vanguard, so it was trimmed to trail as intended; it sits just under the band.
- **Stonekin:** Brawn +3, Grit +4, Finesse 0 (was +2, +3, -1), speed 90. The slower speed costs a tenth of its turns, so it needs more points than the Human's +4 (spec 9.5%).
- **Fenling:** Brawn -2 (was -1); the rest as written, speed 110.
- Kits, the Vanguard, Human and the dungeon are untouched.

## Notes
- Unlocking them (milestone reveals, Guild Hall sells for Renown) is ETH-036, built on these defs.
- Race slot restrictions and innate bundles (survey 1.1) need equipment slots (ETH-043) and wait for M4.
- ETH-039's survey (`docs/ROGUELIKE-SURVEY.md` §1) was the starting point. The names are our own.
- ETH-177 (2026-11-24) repriced the attribute formulas and put the Outrider back on the shared budget (8/14/7/8, +3.25 a level). The Reaver is 11/9/4/9 (33 points, +3.25 a level), four under the shared 37: on 37 it still won 32% against the Vanguard's 14%, and on 35 and 34 it stayed above the band, its hatchet's +2 damage being the rest of its edge. The Old Delve's `budgetMul` went from 1.5 to 1.4 in the same change to bring the Vanguard back to about 18%. The Stonekin gained Finesse +1 (3/1/0/4, +8 where the Human has +4, speed 90). The Lorekeeper stays at 5/8/12/8 (33 points, it trails on purpose). The class table in the Proposal above shows the original spec, not the numbers now in `src/content/classes.ts`.

Open decisions:
- **Decided (Nate, 2026-11-24):** these three classes and two races, named and written as above.
- **Decided (Nate, 2026-11-24):** the Lorekeeper may trail the others in power until spells arrive in M4; the other classes and races are tuned into the band.
- **Decided (Nate, 2026-11-24):** each kit is a weapon plus one piece of armor (ETH-176).

## Log
- 2026-11-24: Created in the backlog reorganization by theme (gap: one class and one race exist).
- 2026-11-24: (spec gate) Proposal written: three classes, two races, numbers on the Vanguard's budget; starting kits split out to ETH-176. Awaiting Nate's review.
- 2026-11-24: Spec approved by Nate: classes, races and lore as written; the Lorekeeper may trail until M4 spells; each kit adds a piece of armor. Status ready.
- 2026-11-24: Started. Defs, sim flags and Mastery list filter built; T1 balance in progress.
- 2026-11-24: Built. Three classes, two races, `--class` / `--race` on `npm run sim`, Mastery list shows available classes plus any with XP. T1 on 200 seeds: Outrider, Reaver, Stonekin and Fenling in the band after trimming points (table above); Lorekeeper trails at 14%. Random recruits can now be any class or race, so tests that assumed a Vanguard recruit were loosened. Status done.
