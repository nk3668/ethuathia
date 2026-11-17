# Roguelike ideas survey

A short survey of mechanics from two long-running open-source roguelikes, Dungeon Crawl Stone
Soup and NetHack, rewritten in our own terms for an idle game. It feeds the depth items in the
backlog. Written for ETH-039.

## Clean-room rules for this document

Both source games are under licenses that don't fit our project (DCSS is GPL-2.0+, NetHack
has its own license), and `CLAUDE.md` §9 asks for clean-room work. So:

- **Only mechanics are described**, in our own words. No monster, item, species, background,
  god, place or spell names from either game appear here, and none should appear in our content.
- **No text or code** was copied or consulted for this document. It is written from general
  knowledge of how the games play.
- When an idea is adopted, its **content is invented fresh**: our own names, numbers, flavor
  text and Codex entries. "Same mechanic, renamed" is not enough; each entry below says how our
  version differs.
- Mechanics themselves (such as "unidentified potions have random labels each run") are common
  genre ideas and are fine to use.

Each entry gives the source idea, our version, how ours differs, and where it goes in the
backlog. Ideas with no matching item are marked **(no item yet)**.

---

## 1. Characters: species, classes and growth

**1.1 Species with a hard equipment restriction.**
*Source (DCSS):* some species can't wear certain armor slots at all and get a strong innate
ability to make up for it.
*Ours:* one or two races give up an equipment slot (for example, no helmet) in exchange for an
innate bundle, such as natural armor or a bite attack.
*Differs:* the restriction is shown on the Prepare screen and in the race tooltip, and the
baseline AI's auto-equip skips the blocked slot instead of trying and failing. It is a
tradeoff in the §4 sense, never a pure penalty.
*Backlog:* ETH-035 (aptitudes), ETH-043 (slots).

**1.2 Aptitudes as per-skill-group modifiers.**
*Source (DCSS):* each species learns each skill faster or slower by a fixed amount.
*Ours:* each race has a small aptitude table over a handful of groups (blades, blunt, bows,
heavy armor, spells), shown as plain words ("good", "poor").
*Differs:* far fewer groups, no hidden numbers, and aptitudes adjust a proficiency tier rather
than an experience rate.
*Backlog:* ETH-035.

**1.3 Proficiency that grows by use.**
*Source (both):* weapon and magic skills improve the more they are used; one game lets the
player choose which skills to advance.
*Ours:* an adventurer's proficiency with a weapon family rises one tier after enough kills with
it, and the tier is saved on the roster between runs.
*Differs:* no manual skill allocation (it is an idle game); growth is slow, capped at three
tiers, and logged when it happens.
*Backlog:* ETH-035, with persistence through ETH-068 (roster).

**1.4 Races that gain traits at set levels.**
*Source (DCSS):* some species gain innate traits as they reach certain experience levels.
*Ours:* each race gains one small trait at level 5 and one at level 10.
*Differs:* the traits are listed in the Codex from the start, so the player can plan around
them.
*Backlog:* ETH-034 (leveling).

**1.5 Heavy armor hurts spellcasting.**
*Source (DCSS):* armor weight raises spell failure chance, and the failure chance is shown.
*Ours:* armor weight lowers spell success. The success chance appears in the ability tooltip
and in the AI trace when a cast fails.
*Differs:* one simple formula, and the AI considers the success chance when it picks between a
spell and a weapon attack.
*Backlog:* ETH-033 (derived stats), ETH-037 (abilities), ETH-038 (class-aware AI).

**1.6 Level drain.**
*Source (both):* some undead attacks permanently remove experience levels.
*Ours:* a draining hit applies a timed "weakened" status that lowers effective level until
it wears off or the adventurer rests at an altar.
*Differs:* never permanent. Permanent loss on an idle character the player can't steer feels
unfair (principle 3).
*Backlog:* ETH-057 (timed statuses), ETH-042 (monster families).

## 2. Items and identification

**2.1 Random labels for unidentified consumables.**
*Source (both):* potions, scrolls and similar items look different in every game, and the
player learns which is which by using them.
*Ours:* each run seeds new labels for unidentified potions and scrolls. Using one identifies
its kind for the rest of the run.
*Differs:* Smithy upgrades make some kinds known at the start of every run, so knowledge is a
meta-progression reward. Labels are our own invented words.
*Backlog:* ETH-044.

**2.2 Altars reveal blessed or cursed state.**
*Source (NetHack):* dropping an item on an altar shows whether it is blessed or cursed.
*Ours:* an adventurer standing on an altar learns the curse state of everything they carry.
The baseline AI makes a short detour to an altar when it carries unknown gear.
*Differs:* automatic, with a log line per item, and no need to drop and pick up.
*Backlog:* ETH-044, deities epic (altars).

**2.3 Shop prices as a hint.**
*Source (NetHack):* the price a shopkeeper asks reveals which group an unknown item belongs
to.
*Ours:* a merchant's price shows an item's tier (common, fine, rare) before it is identified.
*Differs:* the tier is shown as a label, not left for the player to work out from numbers.
*Backlog:* ETH-049 (merchants).

**2.4 Charged wands that recharge.**
*Source (both):* wands have limited charges; DCSS replaced some with tools that recharge as
the player gains experience.
*Ours:* a wand-like base item with a few charges that refills one charge per floor descended.
*Differs:* no recharge-and-explode risk; the charge count is always visible.
*Backlog:* ETH-043 (base item types). **(no item yet** for the recharge rule itself).

**2.5 Elemental damage destroys carried items.**
*Source (NetHack):* fire can burn scrolls, cold can shatter potions.
*Ours:* a rare chance that a strong elemental hit destroys one carried consumable, with a log
line naming it.
*Differs:* only consumables, never equipped gear, and an Omen could raise the chance.
*Backlog:* **(no item yet)**; would build on ETH-057 effects.

**2.6 Tiered resistances.**
*Source (DCSS):* resistances stack in up to three levels, each reducing damage further.
*Ours:* resistances from 0 to 3 pips, shown on the party card and in tooltips.
*Differs:* each pip is a flat, documented percentage, and the source of each pip is listed
through the modifier breakdown.
*Backlog:* ETH-057 (stats with sources), ETH-045 (affixes).

## 3. Monsters

**3.1 Thieves that grab an item and run.**
*Source (NetHack):* some monsters steal an item and teleport away.
*Ours:* a "thief" monster role takes one non-equipped item and flees toward the stairs. Killing
it drops the item.
*Differs:* never steals equipped gear, the stolen item is named in the log, and a rule
condition ("thief in view") lets the player prioritize it.
*Backlog:* ETH-040 (monster roles).

**3.2 Monsters that use items.**
*Source (NetHack):* monsters pick up and use potions, wands and armor.
*Ours:* a "scavenger" family drinks healing potions it finds on the floor, including ones the
party dropped.
*Differs:* limited to one item kind per family so behavior stays readable.
*Backlog:* ETH-040, ETH-042. **(no item yet** if it grows past a single role behavior).

**3.3 Visible threat level.**
*Source (DCSS):* the interface tags each monster with how dangerous it is relative to the
player.
*Ours:* each monster tooltip shows a threat label (trivial, even, dangerous, deadly) relative
to the selected adventurer. The same comparison drives the "enemy stronger than me" rule
condition.
*Differs:* label plus text, never color alone, and the rule condition shares the formula so
what the player sees is what the AI uses.
*Backlog:* ETH-065 (tooltips), ETH-040, behavior-rules epic.

**3.4 Sleeping monsters and stealth.**
*Source (DCSS):* many monsters start asleep and the player's stealth decides whether they wake.
*Ours:* monsters can start asleep. A stealth value derived from agility sets the chance to pass
without waking them, and a rule action "sneak past sleeping" lets the player avoid fights.
*Differs:* the wake-up chance is shown in the tooltip, and the baseline AI attacks sleeping
monsters only when they are weaker.
*Backlog:* ETH-033, ETH-040. **(no item yet** for sleep and stealth).

**3.5 Uniques with a depth range.**
*Source (both):* hand-made unique monsters appear in a set range of depths, once per game.
*Ours:* uniques (ETH-041) have a depth range. A unique that kills an adventurer **remembers it**:
it can come back in later runs carrying that adventurer's heirloom, and killing it returns the
heirloom.
*Differs:* the grudge links uniques to lineage, which neither source does.
*Backlog:* ETH-041, ETH-026 (slay contract), ETH-069 (heirlooms).

**3.6 Out-of-depth warnings.**
*Source (both):* sometimes a monster from much deeper appears early.
*Ours:* elites and out-of-depth monsters get a log highlight and a map marker when first seen.
*Differs:* always announced, so a death to one has a clear cause (principle 2).
*Backlog:* ETH-052 (elites), ETH-047 (highlights).

## 4. Dungeon

**4.1 Hand-made map pieces inside generated floors.**
*Source (DCSS):* designers write map fragments that the generator places into random levels.
*Ours:* a gen step that stamps hand-authored rooms (a shrine, a treasure closet behind a secret
door) into a floor, written as text with the same format as `parseFloorText`.
*Differs:* a small, original set, validated at load like all content.
*Backlog:* dungeon-gen epic (ETH-006 pipeline). **(no item yet)**.

**4.2 Themed side branches.**
*Source (DCSS):* side branches have their own monster sets and a prize at the bottom.
*Ours:* route forks (M6) lead to a themed stretch of floors with one family of monsters and a
better loot table at its end.
*Differs:* the fork choice comes from rules or a pre-set route preference, and the reward is
listed on the fork tooltip.
*Backlog:* dungeon-gen epic (route forks), ETH-042 (floor themes).

**4.3 Fountains with mixed effects.**
*Source (NetHack):* drinking from a fountain can do several good or bad things.
*Ours:* fountains with a small, documented effect table (heal, short buff, minor curse, summon
a weak monster).
*Differs:* the table and odds are in the Codex, and drinking is a rule action, so the player
chooses whether adventurers gamble.
*Backlog:* **(no item yet)**. Referenced by the *Dry Wells* Omen and the fountain bounty (ETH-029).

**4.4 The pursued return trip.**
*Source (both):* after grabbing the main prize the player must climb back out while the dungeon
gets more hostile.
*Ours:* already the return trip with light respawns (ETH-025).
*Differs:* the extra danger is mild by default, and an Omen can raise it for more reward.
*Backlog:* ETH-024, ETH-025, ETH-067.

## 5. Gods and altars

**5.1 Abilities unlocked by devotion.**
*Source (DCSS):* gods grant active abilities as the player's standing rises.
*Ours:* during a run, honoring the patron fills a devotion meter, and thresholds unlock one or
two patron abilities usable by rules.
*Differs:* the meter resets each run; the lasting reward is Favor and the devotion tree.
*Backlog:* ETH-070, deities epic.

**5.2 Prayer that works when in real trouble.**
*Source (NetHack):* praying helps when the character is in danger and enough time has passed,
and angers the god otherwise.
*Ours:* a "pray" rule action that heals or cures when HP is low, with a visible cooldown.
*Differs:* the cooldown and the trouble condition are shown in the tooltip; praying outside
trouble just fails with a log line, no hidden anger meter.
*Backlog:* ETH-070, behavior-rules epic.

**5.3 Donating gold at an altar.**
*Source (NetHack):* giving gold to a priest can grant a lasting armor bonus.
*Ours:* donating in-run gold at an altar of the patron gives a buff for the rest of the run.
*Differs:* the price and buff are shown up front; the gold spent is run gold (ETH-061).
*Backlog:* deities epic, ETH-061.

## 6. Meta and readability

**6.1 Character dump at the end.**
*Source (DCSS):* a text file at the end of each game lists the character, the dungeon and the
last messages.
*Ours:* the run summary and run history keep the same kind of record, plus the AI trace for
the last few decisions before each death.
*Differs:* stored only in the local save (offline only); export goes through the save export.
*Backlog:* ETH-062, ETH-048.

**6.2 Auto-explore that stops on danger.**
*Source (DCSS):* automatic exploration and travel stop when a monster comes into view.
*Ours:* already the baseline AI (ETH-009). The new part is that the stop reason goes in the
trace ("enemy seen, exploration paused").
*Backlog:* ETH-009, ETH-047.

**6.3 Voluntary challenges.**
*Source (NetHack):* players track self-imposed restrictions such as never wearing armor.
*Ours:* conducts (ETH-067) that pay Favor.
*Differs:* tracked automatically and rewarded, and some deities require them.
*Backlog:* ETH-067.

**6.4 Ghosts of past characters.**
*Source (both):* a dead character can leave a ghost and their belongings for a later game.
*Ours:* gravestones and heirlooms (ETH-069) from our own roster only, local save only.
*Differs:* the ghost can be an ally with Ossuary upgrades, and the party can pay respects.
*Backlog:* ETH-069, ETH-051.

---

## Not adopted

These are deliberately left out:

- **Hunger and eating corpses.** We have no hunger (§5.3), and the baseline never picks up
  corpses. Any "gain a resistance by eating" idea becomes a food buff item (ETH-054) instead.
- **Hidden luck values.** A hidden stat that quietly changes outcomes breaks the "readable"
  principle.
- **Item mixing and dipping systems.** Too many hidden interactions for an idle game to show
  clearly.
- **Permanent stat loss** from traps or monsters. Use timed statuses instead (see 1.6).
- **Instant-death traps and attacks with no warning.** Every death needs a clear cause.
