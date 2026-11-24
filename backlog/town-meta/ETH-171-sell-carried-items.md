---
id: ETH-171
title: Items carried out of the dungeon sell for Trophies
type: feature
status: idea
priority: P2
milestone: M2
epic: town-meta
size: S
depends_on: [ETH-083, ETH-061, ETH-118]
created: 2026-11-24
updated: 2026-11-24
---

## Summary
Gear does not carry over between runs. When the party leaves the dungeon (victory or retreat), every item it carries is sold for Trophies at its value.

## Why
Nate (2026-11-24): run gear is lost and the Smithy is the gear progression, but every haul should still feel rewarding. See `CLAUDE.md` §3.

## Acceptance criteria
- [ ] On victory and retreat, carried and equipped items convert to Trophies by item value at a rate set in content
- [ ] The run summary shows an "Items sold" line; on a wipe nothing is sold
- [ ] Conversion follows the same Omen-multiplier rule as gold (ETH-083)
- [ ] Heirlooms (M7) will be the exception; leave a hook, not the feature
- [ ] Tests for victory, retreat and wipe

## Log
- 2026-11-24: Created from the progression discussion with Nate.
