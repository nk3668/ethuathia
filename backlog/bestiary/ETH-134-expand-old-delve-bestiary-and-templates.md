---
id: ETH-134
title: Expand The Old Delve bestiary and templates across Danger bands
type: content
status: done
priority: P1
milestone: M1.5
epic: bestiary
size: M
depends_on: [ETH-040, ETH-091, ETH-117, ETH-131, ETH-133]
created: 2026-11-23
updated: 2026-11-23
---

## Summary
Expand *The Old Delve*'s starter bestiary (~8 → ~18–22 original monsters) and `MonsterTemplateDef` pool across Danger bands `1–2` (Outskirts), `3–5` (Galleries), `6–8` (Deep Workings), and `9–11` (Abyssal Strata), adding depth-ramped templates and out-of-depth (OOD) spawns.

## Why
Eight starter monsters cannot sustain distinct ecological layers, combined-arms fights, or rising threat across a 6–10 floor dungeon (`docs/DIFFICULTY_PHILOSOPHY.md` §8). Adding deeper, harder creatures (rather than level-scaling early pests) makes descending feel dangerous and rewarding.

## Acceptance criteria
- [x] Expand `src/content/monsters.ts` from 8 starter creatures to ~18–22 completely original clean-room monsters covering Danger bands `1–2`, `3–5`, `6–8`, and `9–11`, populating all 5 roles (`brute`, `skirmisher`, `caster`, `support`, `swarm`), ecology `tags`, and innate `Bundle` traits (on-hit statuses, regeneration, resistances) aligned to `docs/DIFFICULTY_PHILOSOPHY.md` §8.1–8.2 across all combat axes.
- [x] Expand `src/content/monsterTemplates.ts` with additional clean-room templates carrying `threatMul` (`1.5–2.0`) and raised `lootTier`, with depth-ramped `templateChance` (`0%` on Danger 1–2, ramping smoothly from Danger 3+).
- [x] Add out-of-depth (OOD) spawn support (~5% chance from Danger 3+ for `+2` Danger) with a clear, readable log/highlight warning.
- [x] Every new monster and template includes an original clean-room name, glyph, description, and Codex `hint` (`ETH-091`), passing `npm run validate:content` and `ETH-131`'s Codex reachability guard (`test/ui/codex.test.tsx`).
- [x] Record `npm run sim -- --seeds 50 --compare origin/main` results in the PR and verify `npm run check`.

## Notes
- Follow the clean-room convention (`CLAUDE.md` §9) and `docs/DIFFICULTY_PHILOSOPHY.md` §8.4 checklist strictly.
- Keep `ETH-091` monster kill-count tiers and `ETH-131` `probesByKind` green for every entry.
- Expanded from 8 -> 20 clean-room monsters and 4 -> 8 templates with tradeoffs (`Ironclad`, `Knitflesh`, `Dazzling`, `Relentless`), wired `src/sim/combat/ood.ts` (`computeTemplateChance`, `computeOodDanger`, `HIGHLIGHT_OOD_ID`, `CHRONICLE_OOD_SIGHTED`) and OOD sighting log/highlight (`HIGHLIGHT_OOD_SIGHTED`, `COMBAT_MOMENT_TEXT.oodSighted`).
- `npm run sim -- --seeds 50 --compare origin/main` (default solo L1 Vanguard, post-ETH-133 + ETH-134):
  - `origin/main` -> `eth-134-old-delve-bestiary`: outcomes `50 victory / 0 wipe` -> `38 victory / 12 wipe (-24.0%)`; depth mean `10.00 -> 7.34`; party level mean `13.06 -> 10.18`; renown/hr (1x) `6646.4 -> 4956.2`; 0 stuck, 0 turn cap.

## Log
- 2026-11-23: Created as part of M1.5 (Living Dungeon & Balance).
- 2026-11-23: Implemented 20-monster Danger 1–11 bestiary, 8 templates, template ramp, OOD `+2` spawns & Chronicle/Log highlight (`STATE_VERSION = 32`); `validate:content`, `check`, and 50-seed compare verified.
