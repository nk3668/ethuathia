---
id: ETH-197
title: The Library building and its building quest
type: feature
status: ready
priority: P1
milestone: M3
epic: town-meta
size: S
depends_on: [ETH-093, ETH-170]
assignee: antigravity
created: 2026-11-25
updated: 2026-11-25
---

## Summary
Add the Library as a town building, opened by its own building quest, **The Lost Folio**: recover a tome from floor 4 and walk back out. It is the next building in the chain after the Smithy (`CLAUDE.md` §4). Also add the Library's Tier II quest, **The Sealed Index** (recover a second tome from floor 6). This item adds the building and both quests only. The tree itself is ETH-163.

## Why
Neither the Library nor its quest exists yet: `src/content/buildingQuests.ts` says the quests of later buildings "come with those buildings". The Library is where tactics are unlocked (ETH-163).

## Decisions (Nate, 2026-11-25)
- `CLAUDE.md`'s example quest, "recover a tome from a named foe", needs named foes (ETH-041, M5), which don't exist yet. The stand-in is to **recover a tome from floor 4 or deeper**, using the existing `recover` objective. The Old Delve is always at least 6 floors deep, so floors 4 and 6 always exist.
- Library quests pay **Renown**, the Library's currency (`src/meta/currencies.ts` already says Renown is spent there).

## Spec
Follow the Smithy's pattern exactly: `src/content/buildingQuests.ts` (`ITEM_GUILD_ANVIL`, `CONTRACT_COLD_ANVIL`, `CONTRACT_STAR_IRON`) and `src/content/town/smithy.ts` (`BUILDING_SMITHY` with `unlock` and a tier unlock).

1. **Quest items** in `buildingQuests.ts`, placed only by their quest and never by loot. Both use tags `['relic', 'contract']`, category `relic` and value 0, and they are never dropped. Write original descriptions and hints in the house style.
   - `item.lost_folio` "Lost folio": a tome on the fourth floor. Weight about 4.
   - `item.sealed_index` "Sealed index": a chained, sealed catalogue on the sixth floor. Weight about 5.
   - Pick a book-like glyph that no other item uses, and check `docs/VISUAL-DESIGN.md` for glyph rules.
2. **Contracts** in `buildingQuests.ts`, tagged `['contract', 'building']`:
   - `contract.lost_folio` "The Lost Folio": `objective: { kind: 'recover', item: 'item.lost_folio', depth: 4 }`, `reward: { renown: 120 }`, `opens: 'building.library'`. Leave out `offerAt`, so it uses `BUILDING_QUEST_SHARE` (0.3 of the open buildings' nodes). Give it an `openedText`, e.g. "you brought the folio home".
   - `contract.sealed_index` "The Sealed Index": `objective: { kind: 'recover', item: 'item.sealed_index', depth: 6 }`, `reward: { renown: 300 }`, `opens: { building: 'building.library', fromTier: 4 }`. Leave out `offerAt` (the tier share is `TIER_QUEST_SHARE`). The rewards are placeholders that the ETH-165 capstone tunes.
3. **Building** `src/content/town/library.ts`:
   - `BUILDING_LIBRARY` (`building.library`) with `unlock` on `contract.lost_folio` (`objectiveDone`, `exited: true`) and a tier-4 unlock on `contract.sealed_index`, as in the Smithy. Add one export line in `src/content/town/index.ts` after the Smithy.
   - The building has **no nodes yet**; ETH-163 adds them. Make sure everything that walks a building's nodes handles an empty tree: Town UI, share math, Codex, validation and the content reachability check (ETH-143).
   - The tier quest must not be offered while the tree is empty. An empty tree should not count as "50% bought".
   - When the Library is open with an empty tree, the Town panel shows a short line such as "The shelves are still being sorted. New tactics arrive here soon." Keep it in content so ETH-163 can drop it.
4. **The starter tactics work before the Library opens.** Nothing in this item may gate an existing behavior on the Library. Note this in the Log.
5. **Text:** Codex entries for the building, both contracts and both items, using hints for undiscovered items. Add tooltips, plus log lines when the quest is offered, completed and the building opens. Reuse the Smithy's mechanisms; don't add new event kinds unless needed.
6. **Saves:** no `SAVE_VERSION` or `STATE_VERSION` bump is expected. If you find you need one, follow `backlog/README.md` Workflow 6 and say so in the PR.

## Acceptance criteria
- [ ] The Lost Folio is offered once 30% of the open buildings' nodes are bought. Taking it places the folio on floor 4. Walking out with it opens the Library and pays 120 Renown.
- [ ] The Library appears in the Town, locked until then, with its unlock shown in the tooltip, and shows the empty-tree line once open.
- [ ] The Sealed Index uses the ETH-170 tier mechanism, opens the Library's rows 4 to 6, and is not offered while the tree has no nodes. Test it with a fixture tree that has nodes.
- [ ] Only one building quest per run still holds (Lost Folio vs Star-Iron vs Long Muster).
- [ ] Tests:
  - content validation of the new defs
  - quest offer gating at the 30% share
  - folio placement on floor 4 for a fixed seed
  - the Library opens after a winning exit
  - the empty tree doesn't offer the tier quest
- [ ] The reachability check (ETH-143) passes with the two new items.
- [ ] Codex, tooltip and log text, original wording (clean-room, `CLAUDE.md` §9). `docs/ARCHITECTURE.md` is updated if the list of buildings is documented there.
- [ ] Sim: T0 identity with the new content unowned and not offered (0 hash diffs expected), plus a 20-seed smoke run. `npm run check` passes.

## Notes
- Gemini (Antigravity) implements; Claude reviews the PR. Branch `eth-197-library-quest` from `main`, with one PR. Two Claude agents are working on ETH-189 (flee code) and ETH-192 (ability tags) at the same time; this item shouldn't touch `src/sim/ai/`.
- The Library's tree, including its fourth party berth and its tactic unlocks, is ETH-163.

## Log
- 2026-11-25: Created from the tactics design (Nate, 2026-11-25).
- 2026-11-25: Nate picked the stand-in quest (recover a tome from floor 4) and assigned the item to Gemini (Antigravity). Spec written; now `ready`.
