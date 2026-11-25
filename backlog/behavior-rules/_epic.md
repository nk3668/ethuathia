---
epic: behavior-rules
title: Tactics (formerly behavior rules)
status: active
milestones: [M2, M3]
---

## Goal
The player shapes how adventurers act by picking and swapping named tactics for the party and each adventurer, and can see which tactic produced each decision and why. (The folder keeps its old name so links stay valid; the design changed from player-written if-then rules to tactics on 2026-11-25.)

## Scope
**In:**
- Ability tags and the best-of-tag resolver
- The tactics engine: options as content that build each adventurer's rules
- Party stance and formation; each adventurer's role, range, focus and habits; class default builds
- The Controller role and the first stun and debuff sources
- Tactics panel, party-card intent and Prepare picks
- Library upgrade tree and saved loadouts
- AI trace in the log and on party cards

**Out (later or elsewhere):**
- The engine that evaluates rules (see `adventurer-ai`)
- Class-only options and class-fit bonuses (M4, ETH-038)
- *Ambusher* (M5, with sleeping monsters) and *Secret seeker* (M8, with secrets)

## Design refs
- `CLAUDE.md` §5.2: Tactics
- `docs/ARCHITECTURE.md` §4
- `docs/VISUAL-DESIGN.md` §5.1

## Items
- [x] [ETH-121 Shared conditions: run-scope conditions and a Requirement type usable outside rules](ETH-121-shared-conditions-requirements.md)
- [ ] [ETH-151 Formation tactic - Stick together, Loose or Spread out](ETH-151-formation-doctrine.md)
- [ ] [ETH-162 Tactics engine - tactic options as content that build each adventurer's rules](ETH-162-rules-editor.md)
- [ ] [ETH-163 Library tree unlocks tactics and habit slots](ETH-163-library-tree.md)
- [ ] [ETH-164 Saved tactics loadouts for the party and each adventurer, ready for talent builds](ETH-164-rule-presets.md)
- [ ] [ETH-192 Ability tags](ETH-192-ability-tags.md)
- [ ] [ETH-193 Roles, ranges and focuses](ETH-193-roles-ranges-focuses.md)
- [ ] [ETH-194 Habits and habit slots](ETH-194-habits-and-slots.md)
- [ ] [ETH-195 Controller role and Softens targets habit](ETH-195-controller-role.md)
- [ ] [ETH-196 Tactics panel, party-card intent and the Prepare tactics column](ETH-196-tactics-panel.md)
