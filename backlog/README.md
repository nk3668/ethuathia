# Ethania Backlog

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
| `status` | `idea` · `ready` · `in-progress` · `blocked` · `done` · `dropped` |
| `priority` | `P0` now · `P1` this milestone · `P2` soon · `P3` someday |
| `milestone` | `M0`–`M6` (see the roadmap in `CLAUDE.md` §10) · `later` |
| `epic` | name of the epic's folder, or `none` |
| `size` | `S` under half a day · `M` 1–2 days · `L` too big: split it |
| `depends_on` | list of IDs, e.g. `[ETH-003, ETH-004]` |

**Status meanings:**
- `idea`: captured but not thought through yet.
- `ready`: acceptance criteria written and size S or M. Can be started.
- `blocked`: the Log must say what it is waiting on.

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

## Creating an item

1. Take the `Next ID` from `INDEX.md` and increment it there.
2. Copy `_templates/item.md` to `<epic-slug>/ETH-###-slug.md`, or to the root if it has no epic.
3. Fill in the frontmatter and the body sections.
4. Add a row to `INDEX.md`. If the item belongs to an epic, add it to that epic's `_epic.md`.
