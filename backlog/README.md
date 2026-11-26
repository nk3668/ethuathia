# Ethuathia Backlog

Every planned piece of work is a markdown file in this folder. The game design itself
lives in [`../CLAUDE.md`](../CLAUDE.md). This backlog breaks that design into work items.

## Layout

```
backlog/
  README.md            this file
  INDEX.md             table of every item: the one place to scan status
  _templates/          item.md and epic.md: copy these to make new files
  <epic-slug>/         one folder per epic (a large feature area)
    _epic.md           the epic's goal, scope and list of its items
    ETH-012-some-task.md
  ETH-005-small-thing.md   small items with no epic sit at the root
```

- **Epics are grouped by feature area, not by milestone.** Examples: `sim-core/`, `adventurer-ai/`,
  `behavior-rules/`, `town/`, `lineage/`, `ui-shell/`. The milestone is a field on each item.
- **Splitting:** when an item turns out to be size L, or has more than about 5 acceptance
  criteria, split it into smaller items. If it doesn't already belong to an epic, make it an
  epic folder.
- **Finished items stay where they are** with `status: done`. Never move or delete them, so
  links stay valid. Mark abandoned items `status: dropped` instead of deleting them.

## IDs and filenames

- IDs are global and sequential: `ETH-001`, `ETH-002`, … Never reuse an ID, even a dropped one.
- Filename format: `ETH-###-kebab-slug.md`, e.g. `ETH-007-frontier-exploration.md`.
- The next free ID is the `Next ID` line at the top of [`INDEX.md`](INDEX.md). Increment it
  every time you create an item.

## Fields

| Field | Values |
|---|---|
| `type` | `feature` · `bug` · `chore` (tooling or refactoring) · `spike` (research or prototype) · `content` (data such as monsters and items) |
| `status` | `idea` · `ready` · `in-progress` · `blocked` · `pending-review` · `done` · `dropped` |
| `priority` | `P0` now · `P1` this milestone · `P2` soon · `P3` someday |
| `milestone` | `M0`, `M1`, `M1.5`, `M1.6`, `M2`, `M2.1`, `M2.2`, `M3`–`M8` (one theme each; M2.1 and M2.2 are the town-tree and minimal-Omen stages of M2; see the roadmap in `CLAUDE.md` §10) · `later` |
| `epic` | name of the epic's folder, or `none` |
| `size` | `S` under half a day · `M` 1–2 days · `L` too big: split it |
| `depends_on` | list of IDs, e.g. `[ETH-003, ETH-004]` |
| `assignee` | optional. `antigravity` marks an item Antigravity may pick up on its own; leave it out for the Claude orchestrator's queue |

**Status meanings:**
- `idea`: captured but not thought through yet.
- `ready`: acceptance criteria written and size S or M. Can be started.
- `blocked`: the Log must say what it is waiting on.
- `pending-review`: an Antigravity item whose PR is open and waiting for Claude's review. The
  reviewer sets it to `done` and ticks the epic when merging (Claude agents set `done` themselves).

## Workflow

1. **Choosing the next item:** pick the highest-priority `ready` item in the current milestone
   whose `depends_on` items are all `done`.
2. **Starting an item:** set `status: in-progress`, update `updated`, add a line to its Log,
   and update `INDEX.md`.
3. **Finishing an item:** tick every acceptance criterion, set `status: done`, add a Log line,
   update `INDEX.md`, and tick the item in its epic's list.
4. **Bugs and side tasks found during work** become new items with `status: idea`. Don't fix
   them on the side unless the fix is trivial.
5. **Keep `INDEX.md` in sync.** Every time an item is created or changes status, update its row
   in the same change.
6. **Save and state version bumps** (`SAVE_VERSION`, `STATE_VERSION`): an item bumps once and
   ships its migration. When two items in flight both bump, the one that merges first keeps its
   number; the other rebases onto `main`, takes the next number and keeps both migrations.

## Creating an item

1. Take the `Next ID` from `INDEX.md` and increment it there.
2. Copy `_templates/item.md` to `<epic-slug>/ETH-###-slug.md`, or to the root if it has no epic.
3. Fill in the frontmatter and the body sections.
4. Add a row to `INDEX.md`. If the item belongs to an epic, add it to that epic's `_epic.md`.

## Gates

Every PR must pass these before it is opened. They catch a broken game, not just a broken unit
(details in [`../docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md) §11).

1. **`npm run check`**: typecheck, lint and every test. The tests include:
   - **invariants and soak** (`test/sim/soak.test.ts`): 30 seeded runs with every state
     invariant checked after every step, a mid-run save and load that must carry on identically,
     and no throws or stuck storms. If your item adds state, register invariants for it with
     `registerInvariant` in its domain module;
   - **determinism** (`test/sim/determinism.test.ts`): extend its command script when you add
     commands;
   - **app boot** (`test/ui/appBoot.test.tsx`): the whole app plays 300 turns with no
     `console.error`.
2. **Sim compare, only when the change warrants it:** follow the table in
   [`../docs/DIFFICULTY_PHILOSOPHY.md` §9](../docs/DIFFICULTY_PHILOSOPHY.md#9-measuring-balance)
   ("When a change needs the harness" and "Seed tiers"). Sim changes run the T0 identity check
   (`npm run sim -- --seeds 20 --compare <base>`, 0 hash diffs, with new content off), and
   balance-affecting ones add a 20-seed smoke run with it on; put both in the PR body with the
   commit hash. UI-only, docs, backlog and test-only changes skip it. The larger suites (T1–T3)
   run only in the milestone's balance capstone, once the milestone's other items are done.
3. **Bigger soak** after changes to the step loop, AI or state shape:
   `npm run soak -- --seeds 200 --cap 2000` (about 5 minutes).
4. **UI changes:** run `npm run dev`, look at the change in the browser and check the console has
   no errors.
5. **Contract and property guards for critical services:** when adding or updating an AI rule over
   hidden state, a secret-bearing event/chronicle/log line, an `Effect` kind, a Codex content kind
   or entry, an `ItemPropertyKind`, or a `{ min?, max? }` config range, extend the corresponding
   guard required by [`../docs/ARCHITECTURE.md` §11.6](../docs/ARCHITECTURE.md#116-contract--property-guard-criteria-eth-131).
