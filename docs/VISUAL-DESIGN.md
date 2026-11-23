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
`@fontsource/inter` and `@fontsource/jetbrains-mono` npm packages. `src/ui/fonts.css` has its
own `@font-face` rules that point at the packages' `.woff2` files for the **Latin** and **Latin
Extended** subsets only (Latin Extended covers accented names), and Vite copies just those 10
files into the build (about 240 kB). No `.woff` fallbacks ship, since the webview reads
`.woff2`. Characters outside those subsets (Greek, Cyrillic, symbols such as `⚔`) fall back
to the next font in the stack. Add a subset there if content starts using another script.
Both families are under the SIL Open Font License 1.1, and the build writes the two license
texts to `dist/licenses/`.

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
- Layout sizes (§3): `--topbar-height` 44px, `--party-width` 260px (`--party-width-compact`
  200px at narrow widths), `--side-width` 360px, `--drawer-width` 360px and `--log-max-height`
  60vh. The log's own height is not a token: the shell sets it from `uiStore` as an inline
  custom property.
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
│ │  Vanguard│ │       #..@.....+##########+...g...#           │ ╭────────────────╮ │
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

As built (ETH-012), in `src/ui/shell/`:

- `AppShell` is a two-row grid (top bar, then `main`), and `main` is the grid with the `party`,
  `map`, `tabs` and `log` areas. The narrow breakpoint is `NARROW_QUERY` (`max-width: 999px`) in
  `useMediaQuery.ts`; the shell sets `data-layout="wide" | "narrow"` from it and the stylesheets
  follow that attribute, so the breakpoint is defined once.
- The log strip's top edge is a `role="separator"` handle: drag it, or use the arrow keys
  (Shift for bigger steps), Page Up / Page Down and Home / End. The height runs from 80px to
  600px (never more than 60% of the window) and is remembered in `localStorage` along with the
  open tab. These are per-machine conveniences, not part of the save.
- The drawer is a modal dialog: everything behind it is `inert`, Escape, the backdrop and its
  Close button close it, focus starts on Close and returns to the top-bar button.
- Party cards: the name is a toggle button (`aria-pressed`) that selects the adventurer. A dead
  member's card has a dashed border and reads "✝ Dead".
- The Party heading has a `group` named "Cycle adventurers" with two small ghost buttons, `‹`
  (Previous adventurer) and `›` (Next adventurer), shown once the party has members (ETH-020).
  They select the previous or next living member, wrapping and skipping the dead, so the
  selected card and the map's follow camera move with them. Their keys, `[` and `]`, come from
  the keymap and are in their tooltips and `aria-keyshortcuts`. ETH-090 adds `Q` / `E`, which
  are diagonals instead while an adventurer is possessed. `Tab` is not used for this: it
  stays the key that moves focus (§7).
- The map area's `map-canvas` and `map-controls` slots hold the map and its camera toggle
  (ETH-013, §4). The top bar's speed control filled its slot in ETH-014 (§3.1).

### 3.1 Top bar

Currencies on the left, each an icon and a `NumberText` whose tooltip shows this run's earnings
and the Omen multiplier.

As built (ETH-023): the list is named "Currencies". Each shows the banked total and, while a run
goes on, this run's at-risk earnings beside it in `--text-muted` with a `+` (`♛ 156 +111`), so it
never rests on color; screen readers hear ", at risk: +111". It disappears once the run ends (the
profile has banked it). The tooltip reads "Renown: 156 banked, +111 at risk", the currency's
blurb, then what banked and at-risk mean, including that a wipe loses 25% (rounded in the
player's disfavor). Run position in the centre. Pause and speed on the right as a
segmented control; the active speed is filled with `--accent` and also marked `aria-pressed`.

As built (ETH-014): `SpeedControls`, a `group` named "Sim speed" of kit `Button`s with shared
borders and rounded ends: Pause (two drawn bars rather than a ⏸ character, which some systems
render as a color emoji, plus a screen-reader label), `1×`, `2×`, `4×`, `8×` and `Max`. While
paused only Pause is pressed; pressing it again resumes at the last speed. Each button's
tooltip says what it does (turns a second at each speed) and its key from the keymap, which is
also in `aria-keyshortcuts`.

Sim errors (ETH-021): when the host stops the run on an error, Pause shows pressed and every
speed button is marked `aria-disabled` (kit `Button` styles it like `disabled`, but a pressed
toggle keeps its fill). `aria-disabled` rather than `disabled` keeps the tooltips reachable;
they say "The run stopped on an error and can’t be resumed." A `SimErrorBanner` (`role="alert"`)
lies across the top of the map: a `--danger` border, a cross icon, a heading, a plain-language
sentence, the error text in mono and a **Start a new run** button (ETH-064: a fresh run from the
remembered Prepare choices).

### 3.2 Party card

```
╭───────────────────────────╮
│ 1  Mira            Lv 6   │   number badge in the member's map hue
│    Human Vanguard         │   muted; each word is an Explain link
│ HP ▓▓▓▓▓▓▓░░░   41 / 58   │
│ MP ▓▓▓░░░░░░░   12 / 40   │
│ XP ▓▓▓▓▓▓▓▓░░   26 / 30   │   progress through this level, --xp
│ BRN 12 FIN 10 WIT 5 GRT 14│   attributes, mono, abbr muted
│ [poisoned 4] [blessed]    │   status badges, turns remaining
│ ➤ exploring · rule #3     │   intent; clicking opens that rule
╰───────────────────────────╯
```

Attributes (ETH-033) are four mono chips, abbreviation muted and value in text color. Each
chip's tooltip gives the name and value, the description, where the value comes from ("From:
Vanguard 11, Human +1."), what it adds to each stat ("Adds: Max HP +6, Damage +1, Carry +24.")
and, muted, the per-point rule. Compact cards and dead members leave them out.

Level (ETH-034): "Lv 6" in muted mono at the right of the header; its tooltip gives total XP,
the XP for the next level, where XP comes from and the class's level-up rolls ("BRN 0–2 ·
WIT 1 (25%)"). The XP bar (`--xp`) shows progress within the current level ("26 / 30");
levels have no cap (ETH-110).
Compact cards and dead members leave the bar out. A level-up is a log highlight.

Status badges (ETH-057) show the status's glyph in its color, its name and the turns left in
mono, e.g. `» Hasted 12`. A harmful status has a dashed `--danger` outline, and its tooltip
says "(harmful)" in words, with the description and turns left. Dead members show no badges,
and compact cards leave them out.

The selected card has an accent border. A possessed adventurer's card shows a filled accent
header reading "Possessed", so the state is clear without relying on the border color.

As built (ETH-066): the banner is `◉ Possessed · your move` (in `--on-accent` on `--accent`)
while the run waits for a command, and the intent line reads "Waiting for your command ·
player"; the player's commands show as "Your command: attack north · player". Living members'
full cards have a small ghost Possess / Release toggle (`aria-pressed`, key `P` in its tooltip
with the movement keys). While possessed, the pack's worn gear has Take off buttons, wearable
items Equip and usable ones Use, each with a tooltip saying it spends the turn. The top bar shows
a primary button `◉ Mira · your move` left of the speed control while someone is possessed; it
releases them.

### 3.3 Log

Monospace, newest at the bottom, prefix icon and color by category. Entity and item names in a
line are `Explain` links. AI lines always end with the rule and the reason in parentheses.

Until M1 adds filters and links, the log (ETH-012) is plain text: a turn column, the category
prefix and a sentence. It leaves out moves and waits, which the map shows, and shows an AI
decision only when an adventurer's goal changes (a different rule or rule action from its
previous `ruleFired`), since the engine traces every decision. It follows new lines while
scrolled to the bottom and stays put when the player scrolls up.

**Repeats (ETH-073).** While an adventurer keeps making exactly the same decision (same rule,
rule action and detail, e.g. waiting on the bottom floor) and no other line has been shown since,
the decision's line ends with a muted `×N` count. Its tooltip (also read out to screen readers)
gives the turn range: "Repeated 12 times, turns 40 to 51." Any other line, including another
adventurer's, or a different decision by the same adventurer ends the count. Folding happens
before filtering, so the filters see the same lines.

**Highlights (ETH-047).** The log header has an `All` / `★ Highlights` filter. A highlight line
shows a `★` before its sentence, and the sentence is an accent-colored button: clicking it
centers the map on where it happened (follow mode) and frames that tile with the focus marker
(§4.3) until the player selects an adventurer, changes the camera mode or presses Escape on the
map. Options has an **Auto-pause** list with one checkbox per highlight kind, all off by
default. When one fires, the run pauses, the map centers on it, the focus marker pulses on the
tile, and the log header says "Auto-paused: (kind)". Resuming the run clears the notice and the
marker.

Since ETH-120 the Highlights filter lists the run chronicle, so a moment from turn 5 is still
there at turn 5,000. Its lines are worded from the moment, in the past tense ("Mira reached
level 3 on floor 2."), with the turn on the left as usual. A moment with no one place (the
wipe's loss) keeps the `★` and the accent color but is plain text, not a button.

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
| Fountain | `{` | `#4f8fd9`; `#5b6573` once it has run dry |
| Item | by category: `!` potion, `?` scroll, `%` food, `)` weapon, `[` armor, `=` ring, `"` amulet, `$` gold (bold), `,` junk, `&` relic (bold) | Per item: Mending draught `#e3706b`, Quickstep tonic `#8fd16a`, Scroll of renewal `#d9c58a`, Scroll of identify `#9ec5e6`, Scroll of uncursing `#e8e0c5`, Trail biscuit `#c9a36b`, Iron hatchet `#b8c4cf`, Quilted jerkin `#9c8f7a`, Skinning knife `#c9d1d9`, Oak cudgel `#a07850`, Ashwood staff `#d8c9a3`, Arming sword `#e6edf3` (bold), Flanged mace `#9aa7b3` (bold), Riveted mail `#b8c4cf` (bold), Round shield `#c08a52`, Iron cap `#8f9ba6`, Grip gloves `#a8865e`, Soft boots `#7d6a55`, Copper band `#c87f4a`, Garnet signet `#c2414b`, Owl-eye ring `#d9a441`, Knotwork pendant `#b08d57`, Hearthstone amulet `#e08a5a` (bold), gold `#f2c14e`, Bent nail `#8a8f96`, Ember Reliquary `#ffb347`. Items are drawn over features and under actors; remembered items are dimmed like terrain |

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
- **Map focus:** four thick accent corner brackets framing a tile the player asked to see (a
  clicked highlight) or that the run auto-paused on. The bracket shape is used by nothing else,
  so it reads without its color. While auto-paused the brackets pulse in from one cell out to
  just around the tile (1.2s period); under `prefers-reduced-motion` they stay still, one cell
  out.
- **Hit flash:** the cell flashes `--danger` for 120ms. Off under reduced motion; the log line
  carries the information either way.

### 4.4 Camera

Two modes, toggled at the map's corner: **follow** the selected adventurer at a fixed cell
size, or **fit** the whole floor to the map area. The canvas is scaled for the display's pixel
ratio so glyphs stay sharp.

### 4.5 As built (ETH-013)

- **Cells:** 0.6 as wide as they are high (JetBrains Mono's advance width), with the glyph at
  90% of the cell height, centered. Follow mode uses 20 CSS px rows (12 px wide); fit mode uses
  the largest whole size that shows the floor. Sizes are whole device pixels at any pixel ratio.
- **Follow** scrolls only when the adventurer comes within a quarter of the view from an edge,
  so the map doesn't shift on every step, and never past the floor's edges. With nobody
  selected it follows the first living party member. There is no scroll animation, so there is
  nothing to turn off under reduced motion.
- **Remembered** glyphs keep 30% of their saturation and are drawn 40% of the way from
  `--bg-app` to that color. The tooltip says "Remembered, not in view" or "In view", so fog never
  rests on brightness alone.
- **Glyph table:** terrain and features take their glyph and color from their content
  definitions (ETH-015, `findGlyph`); a test checks them against the §4.1 table. Party members
  use their slot hue. Monsters without a family glyph yet use the first letter of their name in
  `#e3706b`; anything unknown is a `?`.
- **Party badges:** the slot number in bold at the cell's bottom-right, outlined in the
  background color, in cells at least 14 device px high.
- **Overlays:** the selection ring is a 1-device-px `--accent` square inside the cell, with a
  dotted `--accent` line (`2·line` dash, `3·line` gap) from the selected adventurer's center to
  their `intent.goal` tile when moving or targeting on the shown floor; the possession frame
  (ETH-019) replaces the ring with a solid `2·line` `--accent` square inset inside the cell (no
  goal line while possessed); the hover outline is 1-device-px `--text`, dashed and inset when
  it shares a selected or possessed cell; and a hit flash (ETH-019) tints the cell with a 45%
  `--danger` wash for 120ms (`HIT_FLASH_MS`), skipped under `prefers-reduced-motion`.
- **Tooltip:** what is on the tile (adventurers as "Mira (party 1)", then the feature, then the
  terrain), then a muted fog line; unknown tiles say "Unexplored". It is styled like the kit
  `Tooltip` and placed beside the tile.
- **Input:** clicking an adventurer selects it. The map is focusable: arrow keys move an inspect
  cursor (starting on the followed adventurer) that shows the same outline and tooltip, Enter
  selects the adventurer under it and Escape clears it.
- **Controls:** "Follow" and "Whole floor" toggle buttons (`aria-pressed`) at the bottom-right;
  the choice is remembered on the machine.

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

As built (ETH-063, `src/ui/town/`): the Town side tab has the banked Renown and Trophies at the
top right and one kit `Tabs` entry per building. A tree is a grid with a tier label column
(I, II, …), rows of fixed height and SVG lines from each prerequisite to the nodes that need it:
dashed `--border-strong` until the prerequisite is owned, then solid `--good`. Neighbouring
nodes of a pick-one group have an italic "or" between them. Node names wrap to two lines (the
tooltip has the full text), each node's status is also in screen-reader text, and the cost line
marks unaffordable parts in `--danger`. Clicking a node selects it (doubled accent border) and
opens a detail card below the graph with the description, the same facts as the tooltip, the
reason it can't be bought, **Buy for …** and, in a pick-one tier, **Respec** with what it gives
up, refunds and keeps as the fee.

Locked buildings (ETH-074): the tab reads "Smithy 🔒" (screen-reader text "(locked)") and its
tooltip ends "Locked: Reach floor 3.". The tab stays selectable; its panel is a dashed
`--border-strong` card: "🔒 Smithy is locked", the description, "Unlocks when you: **Reach
floor 3**" and the progress ("Deepest so far: floor 2"). An opened building's tab tooltip adds
"Opened after run N". The run summary gains an **Unlocked** section ("🔓 Smithy opens in town:
you reached floor 3.") when the run opened something.

### 5.3 Codex

A two-pane view: category list and search on the left, entry on the right. An entry shows the
glyph at large size in its map color, the description, a stat table, and where it has been
seen. Undiscovered entries appear as `???` with a hint.

**As built (ETH-065, ETH-091, ETH-092).** The Codex side tab shows overall discovery progress (`known /
total entries discovered`) and an **Open Codex** button that launches the wide two-pane Codex
modal (`role="dialog"`, `aria-modal="true"`, backdrop and Escape/Close dismissal with focus
returned to the trigger). The left pane holds the search box, section toggle buttons (`All`, then
one per kind, `aria-pressed`), and a section per kind with a `known / total` count and selectable
entry rows (`aria-current="true"` on the active row; `ArrowUp`, `ArrowDown`, `Home` and `End`
step through rows across sections). The right pane (`Codex entry`) is a field-journal entry page:
a large `44×44` glyph box in the entry's map color, the entry title, kind/group and discovery
marks (`Seen · Slain · Used`), the lore description, an encounter record (`Slain`,
`Adventurers lost` and `Knowledge` tier progress for combat entries), and the stat table. At
tablet width (`NARROW_QUERY`, under 1000px) the view collapses to one pane at a time: selecting an
entry opens its page with a **← Back to list** button that returns to the list and restores focus
to that entry. Undiscovered entries show their map glyph, `???` and their riddle-like `def.hint`
in the list, on their entry page and in `Explain` tooltips (without their full description or
stats). A monster that has only been seen (`0` kills) counts as discovered so its name appears in
the list and page heading, while its page still shows its riddle hint and no stat fields until the
first kill. Monster entries then reveal more as the player slays more of them (`profile.codex.kills`
plus current-run kills): basic stats (`Role`, `HP`, `Damage`, `Speed`, `Found on`) at 1 kill, full
stats and behavior at 10 kills, and full lore (`def.description`) plus `Drops` at 50 kills. Search
matches only discovered entries. `Explain` links are underlined with a dotted `--text-faint` line,
the same as the kit tooltip trigger.

### 5.4 Graveyard

A list of gravestone cards: name, class and race, level, floor and cause of death, the epitaph
in italics, and the heirloom left behind.

### 5.5 Stats

As built (ETH-048, `src/ui/stats/`): **Lifetime** totals as a three-column grid of small cards
(runs, victories, retreats, wipes, deepest floor, turns; each value has a tooltip, outcome
labels carry their icon), then **Run history**, newest first. Each past run is one button row:
a 3px left border in the outcome's color plus its icon, "Run N · Outcome", floor and turns on
the right, the party (✝ after those who fell) and the banked Renown and Trophies. Clicking a row
reopens that run's summary (§6.2); closing it returns focus to the row. With more runs finished
than kept, a note says how many are kept.

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

As built (ETH-064, `ui/prepare/`): the app opens on it, and it fills the party, map and log
areas while the top bar and side tabs stay. A heading "Prepare the next run" and a one-line
lead, then the columns (small uppercase labels **Party**, **Loadout & rules**, **Where & how
hard**; a column with no panels is left out), each a stack of kit `Panel`s, and **Descend**
(primary, focused) at the bottom right. Party: one raised row per open slot with Class and Race
selects ("Random" first) and a line naming the picks with `Explain` links; slots past the party
size are dashed, faint rows with a padlock and "Locked: raise the party size in the Guild Hall".
From the town: each owned upgrade that strengthens the party, with its effect. Dungeon: a radio
list; the chosen variant has a 2px accent border as well as the checked radio, and a locked one
is dashed and faint with a padlock. If a run can't start, an alert with a cross icon and a
`--danger` border says why above the columns.

### 6.2 Run summary

A centred modal: outcome heading (Victory, Retreat or Wipe, each with its own icon), one row
per adventurer with fate and cause of death, conducts kept, a currency table (base, multiplier,
total), heirlooms dropped, and an epitaph. Buttons: **Continue** (to the town and Prepare
screen) and **Review log**, plus an **Auto-restart** toggle (off by default, mirrored in
Options). While it is on, the modal shows a countdown to the next run and the countdown can be
cancelled.

As built (ETH-062, `ui/shell/RunSummary.tsx`): a `role="dialog"` over a dimmed backdrop, with a
3px top border in the outcome's color and the outcome icon (★ Victory, ⇡ Retreat, ✝ Wipe) next
to the heading, so the outcome never rests on color. Then the cause, "Floor N reached · T turns",
the party with each member's fate, the contracts, **Moments** (ETH-120: the run's five most
notable chronicle moments in turn order, each "Turn N" in faint tabular figures then its
sentence; a past run shows the five its record kept), a currency table (Earned, Lost in the wipe, Banked; the Omen
multiplier column arrives with ETH-067, between Earned and Lost, so it reads base → ×Omen → −25%)
with a muted line under it saying how the outcome treated the earnings (ETH-023), "Met this run" (the Codex discoveries), a placeholder epitaph in
italics, the Auto-restart checkbox with "Next run in N s" and Cancel while counting down, and
the buttons **Review log** (ghost; closes it, Escape too), **Rematch** (secondary, ETH-084;
replays the previous run's seed with your current upgrades and rules, with a tooltip
explaining that the layout repeats while outcomes may differ), **Start next run** (secondary; the
same choices again at once with a fresh seed) and **Continue** (primary, focused; to the Prepare
screen, ETH-064). With the modal closed, a banner at the bottom of the map says the run is over
and offers **Show summary**, **Rematch**, **Start next run** and **Continue**.
A past run reopened from the Stats tab (ETH-048) uses the same modal titled "Run N · Outcome",
without the auto-restart toggle, and with one primary **Close** button.

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
