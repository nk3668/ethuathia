# Ethuathia visual design

How the game looks. The game design is in [`../CLAUDE.md`](../CLAUDE.md) (§8 for UI
requirements) and the technical design is in [`ARCHITECTURE.md`](ARCHITECTURE.md).

**Direction: modern dark panels around a monospace glyph map.** The interface is calm and
dense, set in a sans-serif. Monospace is used only where alignment matters: the dungeon map
and the log. Panels stay quiet so the colored map is the most vivid thing on screen.

The hex values below are the ones in `src/ui/tokens.css`. `test/ui/tokens.test.ts` checks
that the two agree and that every text color has at least 4.5:1 contrast on the surfaces it is
used on (§2.6).

---

## 1. Principles

1. **The map is the picture.** Saturated color belongs to the dungeon. Panels use greys, with
   color only for meaning (HP, currencies, log categories) and one accent.
2. **Never color alone.** Every state that color signals also has an icon, a label or a
   border style.
3. **Everything explains itself.** Any number, glyph, icon or content name can be hovered.
4. **Dense but ordered.** Small type and tight spacing are fine; alignment and consistent
   spacing keep it readable.
5. **Quiet motion.** Short fades and one brief hit flash. All of it off under
   `prefers-reduced-motion`.

---

## 2. Tokens

Defined once as CSS custom properties in `src/ui/tokens.css`. Components never use raw values.

### 2.1 Surfaces and text

| Token | Value | Use |
|---|---|---|
| `--bg-app` | `#0e1116` | Window background, map background |
| `--bg-panel` | `#151a21` | Panels |
| `--bg-raised` | `#1c232c` | Cards, inputs, tree nodes |
| `--bg-hover` | `#242d38` | Hover and pressed states |
| `--border` | `#2a333f` | Panel and card borders |
| `--border-strong` | `#3a4656` | Hover borders, tooltip borders, dividers that need weight |
| `--text` | `#e3e8ee` | Primary text |
| `--text-muted` | `#97a3b3` | Labels, secondary text |
| `--text-faint` | `#7e8a99` | Disabled text, placeholders |
| `--accent` | `#e8a33d` | Selection, primary buttons, possession |
| `--on-accent` | `#1a1204` | Text on accent fills |

### 2.2 Meaning

| Token | Value | Use | Also shown as |
|---|---|---|---|
| `--hp` | `#e0726f` | Health | "HP" label, heart icon |
| `--mp` | `#5a96db` | Mana | "MP" label, drop icon |
| `--xp` | `#6fbf73` | Experience | "XP" label |
| `--renown` | `#e6c35c` | Renown | laurel icon |
| `--trophies` | `#d8d2c4` | Trophies | skull icon |
| `--favor` | `#a886e0` | Favor | flame icon |
| `--good` | `#6fbf73` | Positive change | `+` sign, up arrow |
| `--warn` | `#e0a84a` | Caution | triangle icon |
| `--danger` | `#e3706b` | Harm, death | cross icon |

### 2.3 Log categories

| Token | Color | Category | Prefix |
|---|---|---|---|
| `--log-combat` | `#e3706b` (same as `--danger`) | Combat | `⚔` |
| `--log-loot` | `#e6c35c` (same as `--renown`) | Loot | `◆` |
| `--log-discovery` | `#5cc2c7` | Discovery | `✦` |
| `--log-ai` | `#a886e0` (same as `--favor`) | AI | `➤` |
| `--log-system` | `--text-muted` | System | `·` |

### 2.4 Type

| Role | Font | Size / line | Tokens | Notes |
|---|---|---|---|---|
| UI text | Inter 400 | 13 / 18 | `--font-ui`, `--font-size-body`, `--line-height-body` | |
| Small labels | Inter | 11 / 14 | `--font-size-label`, `--line-height-label`, `--letter-spacing-label` | Uppercase, +4% letter spacing, `--text-muted` |
| Headings | Inter 600 | 15 / 20 | `--font-size-heading`, `--line-height-heading`, `--font-weight-heading` | Panel titles |
| Buttons, tabs | Inter 500 | 13 / 18 | `--font-weight-medium` | |
| Numbers | Inter, tabular figures | as context | `font-variant-numeric: tabular-nums` | Columns of numbers line up |
| Map and log | JetBrains Mono 400, 700 | map: fitted; log: 12 / 17 | `--font-mono`, `--font-size-log`, `--line-height-log` | 700 for bold glyphs such as stairs |

No fonts load from the network; both families ship in the app bundle. They come from the
`@fontsource/inter` and `@fontsource/jetbrains-mono` npm packages (imported in
`src/ui/fonts.css`), which Vite copies into the build. Both are under the SIL Open Font
License 1.1, and the build writes the two license texts to `dist/licenses/`.

### 2.5 Shape and spacing

- Spacing scale on a 4px grid: 4, 8, 12, 16, 24 (`--space-1` to `--space-5`).
- Radius: 8px for cards and panels (`--radius-card`), 6px for buttons and chips
  (`--radius-control`), 999px for pills (`--radius-pill`).
- Borders: 1px (`--border-width`) `--border`. No drop shadows except on tooltips and modals
  (`--shadow-overlay`).
- Focus: 2px `--accent` outline with 2px offset (`--focus-width`, `--focus-offset`), on every
  interactive element. Set once in `base.css` with `:focus-visible`.
- Component sizes: `--control-height` 28px (buttons, tabs), `--bar-height` 6px,
  `--tooltip-max-width` 280px.
- Motion: `--duration-fast` 120ms for fades and bar changes. It is 0 under
  `prefers-reduced-motion`, where `base.css` also turns off every transition and animation.

### 2.6 Contrast

Every text color has at least 4.5:1 contrast on each surface it is used on: `--text`,
`--text-muted`, `--accent`, the meaning colors and the log colors on all four `--bg-*`
surfaces; `--text-faint` on `--bg-app`, `--bg-panel` and `--bg-raised` (disabled controls never
show the hover fill); and `--on-accent` on `--accent`.

ETH-011 raised four starting values to meet this: `--text-faint` (`#64707f` → `#7e8a99`),
`--hp` (`#d9534f` → `#e0726f`), `--mp` (`#4f8fd9` → `#5a96db`) and `--danger` with the combat
log color (`#e0625c` → `#e3706b`). Each kept its hue and only gained lightness.

### 2.7 Kit

The first kit components (`src/ui/kit/`, see `ARCHITECTURE.md` §8.1) and how each shows its
state without relying on color:

| Component | States | Second signal |
|---|---|---|
| `Button` | primary, secondary, ghost, disabled, pressed (toggle) | pressed: accent fill and `aria-pressed`; disabled: faint text, `not-allowed` cursor |
| `Tabs` | selected, disabled | selected: accent underline, heavier text, `aria-selected` |
| `Card` | default, selected | selected border is twice as thick |
| `Panel` | with or without a title and actions | |
| `Tooltip` | opens on hover (250ms delay) and on focus; Escape closes it | linked with `aria-describedby` |
| `Bar` | any value from empty to full | visible label ("HP") and `value / max` text; `role="meter"` |

In dev mode, `?kit` on the dev server URL opens a gallery of every component and state.

---

## 3. In-run layout

```
┌───────────────────────────────────────────────────────────────────────────────────┐
│ ♛ 12.4k   ☠ 3.1k   ♨ 40      Floor 7 / 20 · Turn 4,812        ⏸  1×  2×  4×  8×  » │  44px
├──────────────┬───────────────────────────────────────────────┬────────────────────┤
│ PARTY        │                                               │ Rules  Town  Codex │
│ ╭──────────╮ │       ##########          #########           │ Graveyard  Stats ⚙ │
│ │1 Mira    │ │       #........#          #.......#           │ ────────────────── │
│ │  Valkyrie│ │       #..@.....+##########+...g...#           │ ╭────────────────╮ │
│ │HP ▓▓▓▓░ 41│ │       #........#          #.......#           │ │⠿ HP < 30%      │ │
│ │MP ▓▓░░░ 12│ │       ####+#####          #####.###           │ │  → quaff heal  │ │
│ │➤ exploring│ │          #.#                  #.#             │ │  ● 14      [on]│ │
│ │  rule #3 │ │          #.############........#             │ ╰────────────────╯ │
│ ╰──────────╯ │          #.....>.....                         │ ╭────────────────╮ │
│ ╭──────────╮ │          ##############                       │ │⠿ enemy adjacent│ │
│ │2 Oren    │ │                                               │ │  → attack weak │ │
│ │ ...      │ │                                               │ ╰────────────────╯ │
│ ╰──────────╯ │                              [follow] [floor] │                    │
├──────────────┴───────────────────────────────────────────────┴────────────────────┤
│ [All] [⚔ Combat] [◆ Loot] [✦ Discovery] [➤ AI]                                    │
│ ➤ Mira quaffs a healing potion (rule #1: HP 24% < 30%)                            │  ~160px
│ ⚔ Mira hits the goblin for 7                                                      │
└───────────────────────────────────────────────────────────────────────────────────┘
     ~260px                      flexible                          ~360px
```

- CSS grid with named areas: `topbar`, `party`, `map`, `tabs`, `log`.
- The log strip can be dragged taller; its height is remembered.
- **Tablet width (under about 1000px):** the tab panel becomes a slide-over drawer opened from
  a button in the top bar, and party cards shrink to one line each (number, name, HP bar).

### 3.1 Top bar

Currencies on the left, each an icon and a `NumberText` whose tooltip shows this run's earnings
and the Omen multiplier. Run position in the centre. Pause and speed on the right as a
segmented control; the active speed is filled with `--accent` and also marked `aria-pressed`.

### 3.2 Party card

```
╭───────────────────────────╮
│ 1  Mira            Lv 6   │   number badge in the member's map hue
│    Dwarf Valkyrie         │   muted; each word is an Explain link
│ HP ▓▓▓▓▓▓▓░░░   41 / 58   │
│ MP ▓▓▓░░░░░░░   12 / 40   │
│ [poisoned 4] [blessed]    │   status badges, turns remaining
│ ➤ exploring · rule #3     │   intent; clicking opens that rule
╰───────────────────────────╯
```

The selected card has an accent border. A possessed adventurer's card shows a filled accent
header reading "Possessed", so the state is clear without relying on the border color.

### 3.3 Log

Monospace, newest at the bottom, prefix icon and color by category. Entity and item names in a
line are `Explain` links. AI lines always end with the rule and the reason in parentheses.

---

## 4. The map

### 4.1 Glyphs

| Thing | Glyph | Color |
|---|---|---|
| Adventurer | `@` | Party hue by slot: `#f2c14e`, `#5cc2c7`, `#e07fb0`, `#8fd16a` |
| Monster | letter by family (`g` goblin-kind, `r` rodent, `Z` undead…) | Hue by family; brighter means more dangerous |
| Wall | `#` | `#b9c2ce` |
| Floor | `.` | `#6f7a89` |
| Door | `+` closed, `'` open | `#c08a4a` |
| Stairs | `<` up, `>` down | `#ffffff`, bold |
| Altar | `_` | Patron's color, or grey when unaligned |
| Grave | `†` | `#a886e0` |
| Fountain | `{` | `#4f8fd9` |
| Item | by category (`!` potion, `?` scroll, `)` weapon, `[` armor, `$` coin) | By category |

The glyph and color for each content entry live on its definition, so the Codex shows exactly
what the map shows.

### 4.2 Visibility

- **In view:** full color.
- **Remembered:** the same glyph at about 40% brightness and desaturated. Monsters are not
  remembered.
- **Unknown:** `--bg-app`.

### 4.3 Overlays

- **Selected adventurer:** a thin accent ring around the cell, and a dotted line to their
  current goal tile.
- **Possessed adventurer:** a solid accent cell frame instead of the ring.
- **Party members** carry a small slot number at the cell's corner so they can be told apart
  without color.
- **Hover:** cell outline and a tooltip listing what is on the tile.
- **Hit flash:** the cell flashes `--danger` for 120ms. Off under reduced motion; the log line
  carries the information either way.

### 4.4 Camera

Two modes, toggled at the map's corner: **follow** the selected adventurer at a fixed cell
size, or **fit** the whole floor to the map area. The canvas is scaled for the display's pixel
ratio so glyphs stay sharp.

---

## 5. Tab panels

### 5.1 Rules editor

```
Rules for  [ Mira ▾ ]      Preset [ Cautious ▾ ]  [Save as…]        3 / 5 slots
╭──────────────────────────────────────────────────╮
│ ⠿  1   [ HP below 30% ▾ ]  →  [ quaff best healing ▾ ]   ● 14   [on] │
╰──────────────────────────────────────────────────╯
╭──────────────────────────────────────────────────╮
│ ⠿  2   [ enemy adjacent ▾ ] →  [ attack weakest ▾ ]      ○ 212  [on] │
╰──────────────────────────────────────────────────╯
[ + Add rule ]
─ Baseline (always active) ─────────────────────────
   flee when HP is very low · fight adjacent · explore · leave floor
```

- Each rule is a card: drag handle, order number, condition chip, arrow, action chip,
  last-fired dot (filled if it fired in the last few turns) with a hit count, and a toggle.
- Chips open a dropdown built from the condition and action registries; parameters such as
  the percentage are edited inline.
- Locked conditions and actions appear in the dropdown greyed, with a padlock and the Library
  node that unlocks them.
- Baseline rules are listed below, muted and not editable, so the player can see what happens
  when none of their rules fire.

### 5.2 Town

```
[Guild Hall] [Library] [Smithy] [Temple 🔒] …             ♛ 12.4k  ☠ 3.1k

   Tier 1        ( ✓ Second slot )
                        │
   Tier 2     ( Stout recruits )──or──( Scout training )      pick one
                        │
   Tier 3        ┆ 🔒 Third slot ┆
```

- One tab per building; locked buildings show their unlock milestone.
- Nodes are rounded chips on tier rows, joined by lines.
- Node states:

| State | Border | Icon | Fill |
|---|---|---|---|
| Owned | solid `--good` | check | raised |
| Available | solid `--accent` | none | raised |
| Too expensive | solid `--border` | none; cost shown in `--danger` | raised |
| Locked | dashed `--border` | padlock | panel |
| Excluded by a pick-one choice | solid `--border` | none; name struck through | panel |

- Hovering a node shows cost, effect, prerequisites and, for pick-one tiers, the respec fee.

### 5.3 Codex

A two-pane view: category list and search on the left, entry on the right. An entry shows the
glyph at large size in its map color, the description, a stat table, and where it has been
seen. Undiscovered entries appear as `???` with a hint.

### 5.4 Graveyard

A list of gravestone cards: name, class and race, level, floor and cause of death, the epitaph
in italics, and the heirloom left behind.

---

## 6. Full-screen views and modals

### 6.1 Prepare

```
╭ Party ──────────╮ ╭ Loadout & rules ────╮ ╭ Risk ──────────────────╮
│ 1 Mira     Lv 6 │ │ Kit: Iron set       │ │ Patron: none ▾         │
│ 2 Oren     Lv 3 │ │ Trait: Stout        │ │ Omens                  │
│ 3 (random)      │ │ Rules: Cautious ▾   │ │  Gloom       ○ ● ○  II │
│ 4 🔒            │ │                     │ │  Ravenous    ● ○ ○  I  │
╰─────────────────╯ ╰─────────────────────╯ │ Reward  ×1.45          │
                                            ╰────────────────────────╯
                                                        [ Descend ]
```

Three columns matching the order of decisions. The reward multiplier updates as Omens are
toggled, and its tooltip lists each Omen's contribution.

### 6.2 Run summary

A centred modal: outcome heading (Victory, Retreat or Wipe, each with its own icon), one row
per adventurer with fate and cause of death, conducts kept, a currency table (base, multiplier,
total), heirlooms dropped, and an epitaph. Buttons: **Continue** and **Review log**.

### 6.3 While you were away

A centred modal: time away, runs completed, currency earned, notable events (deaths, new Codex
entries), and a line stating whether the result was simulated or estimated.

---

## 7. Accessibility

- All controls reachable by keyboard, with visible focus.
- Color is never the only signal (see the tables above for the second signal in each case).
- Tooltips open on focus as well as hover.
- Motion is disabled under `prefers-reduced-motion`.
- Map cell size and log font size are adjustable in Options.
