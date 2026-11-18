---
id: ETH-033
title: Four attributes and the stats derived from them
type: feature
status: done
priority: P1
milestone: M1
epic: characters
size: M
depends_on: [ETH-057]
created: 2026-11-17
updated: 2026-11-18
---

## Summary
Adds four attributes with original names (roughly might, agility, intellect and vitality) and derives HP, MP, accuracy, evasion, damage and carry capacity from them through the existing modifier system.

## Why
Classes, races, gear and leveling all need a shared stat base. See `CLAUDE.md` §5 and `docs/ARCHITECTURE.md` §2.2.

## Acceptance criteria
- [x] Attribute and derived stat ids are defined once, with Codex and tooltip text
- [x] Classes and races set base attributes in their definitions (replacing the flat HP/MP fields)
- [x] `getStat` shows each derived stat's contributing modifiers in its tooltip
- [x] Unit tests cover the derivation formulas

## Notes
- Names: Brawn, Finesse, Wits, Grit (original; not the NetHack/DCSS six). Formulas live in `ATTRIBUTE_FORMULAS` (`src/sim/stats/attributes.ts`).
- Starting Human Vanguard before → after: HP 20 → 20, MP 5 → 5, accuracy 0 → 0, evasion 0 → 0, damage 0 → 1, armor 0 → 0, speed 100 → 100, sight 8 → 8, carry 0 → 24.

## Log
- 2026-11-17: Created from a design discussion on quests, depth and extra features.
- 2026-11-17: Wired `depends_on` to the foundation items added in the fan-out plan.
- 2026-11-18: Started (in-progress).
- 2026-11-18: (default) Attribute names Brawn / Finesse / Wits / Grit (BRN/FIN/WIT/GRT) — alternatives: Might / Agility / Intellect / Vitality, or other original names.
- 2026-11-18: (default) Formulas: max HP = Grit + ½ Brawn, MP = Wits, carry = 2 × Brawn; accuracy and evasion = Finesse − 10, damage = ½ (Brawn − 10). Tuned so a starting Human Vanguard keeps 20 HP / 5 MP — alternatives: other weights, armor from Grit, sight from Wits.
- 2026-11-18: Done. Attribute kind and Codex section, class/race attributes replace hp/mp/hpBonus/mpBonus, `stats.attributes` provider, per-actor points in `stats.attributes` (STATE_VERSION 8), party card chips with tooltips, Explain links for race and class.
