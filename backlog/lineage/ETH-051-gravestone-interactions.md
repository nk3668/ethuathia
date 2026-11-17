---
id: ETH-051
title: Gravestone interactions: minor loot, a patron boon and an epitaph
type: feature
status: idea
priority: P2
milestone: M5
epic: lineage
size: M
depends_on: [ETH-069, ETH-070]
created: 2026-11-17
updated: 2026-11-17
---

## Summary
Finding a past adventurer's grave lets the party read the epitaph, take minor loot or equipment from that adventurer's run, and receive a boon from that adventurer's patron deity.

## Why
Makes past runs matter in new ones. See `CLAUDE.md` §7.

## Acceptance criteria
- [ ] Interacting with a grave logs its epitaph
- [ ] A grave holds minor loot drawn from the fallen adventurer's last run, besides the heirloom
- [ ] If the fallen adventurer had a patron, the party gets a short boon from that deity, with a log line and status tooltip
- [ ] A rule condition `standing on grave` and action `pay respects`

## Notes
- Depends on gravestones and heirlooms (M5) and deities (M6), which don't have items yet.

## Log
- 2026-11-17: Created from a design discussion on quests, depth and extra features.
- 2026-11-17: Wired `depends_on` to the foundation items added in the fan-out plan.
