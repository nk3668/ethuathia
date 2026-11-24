import { useShallow } from 'zustand/react/shallow';
import { ATTRIBUTE_IDS, attributeDef, attributeDefId, CLASSES, EQUIP_SLOT_INFO, gearSlots, ITEM_CATEGORY_INFO, ITEMS, STATUSES } from '../../content';
import type { AttributeId } from '../../content';
import { isAvailable } from '../../meta';
import { STAT_IDS, STAT_INFO } from '../../sim';
import type { ActionRequest, EntityId, InventoryView, LevelView, MemberStatsView } from '../../sim';
import { Explain } from '../codex/Explain';
import { attributeEffectText, growthLine, xpSourcesText } from '../codex/attributeText';
import { keyHint } from '../input/keymap';
import { runKeyAction, togglePossession } from '../input/useKeymap';
import { Bar, Button, Card, Panel, Tooltip } from '../kit';
import { useProfileStore } from '../stores/profileStore';
import { useSimStore } from '../stores/simStore';
import { useUiStore } from '../stores/uiStore';
import styles from './PartyColumn.module.css';
import { contentName, ruleLabel } from './text';

/** A number as a signed contribution: "+6", "−1", "+0.5". */
function signed(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return `${rounded < 0 ? '−' : '+'}${Math.abs(rounded)}`;
}

export interface PartyColumnProps {
  /** One line per member (number, name, HP) instead of the full card. */
  compact: boolean;
}

/**
 * The party column (docs/VISUAL-DESIGN.md §3.2). Party cards get their full content (level,
 * status badges, intent links) in M1.
 */
export function PartyColumn({ compact }: PartyColumnProps) {
  const ids = useSimStore(useShallow((s) => s.snapshot?.party.map((m) => m.id) ?? []));
  return (
    <Panel
      title="Party"
      className={styles.column}
      actions={
        ids.length > 0 ? (
          <div role="group" aria-label="Cycle adventurers" className={styles.cycle}>
            <CycleButton step={-1} />
            <CycleButton step={1} />
          </div>
        ) : undefined
      }
    >
      {ids.length === 0 ? (
        <p className={styles.empty}>No adventurers yet.</p>
      ) : (
        <ol className={styles.list}>
          {ids.map((id, slot) => (
            <li key={id}>
              <PartyCard id={id} slot={slot + 1} compact={compact} />
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

const CYCLE_TEXT = {
  [-1]: { glyph: '‹', label: 'Previous adventurer' },
  [1]: { glyph: '›', label: 'Next adventurer' },
} as const;

/**
 * Selects the previous or next living adventurer, the same as its keys in the keymap (`Q`/`[` and
 * `E`/`]`). The map's follow camera and the selected card move with the selection.
 */
function CycleButton({ step }: { step: 1 | -1 }) {
  const { glyph, label } = CYCLE_TEXT[step];
  const keys = keyHint({ type: 'cycleSelection', step });
  return (
    <Tooltip
      placement="bottom"
      content={
        <>
          <strong>{label}</strong>
          <br />
          Select and follow the {step === 1 ? 'next' : 'previous'} living adventurer.
          {keys.hint && (
            <>
              <br />
              {keys.hint}
            </>
          )}
        </>
      }
    >
      <Button
        variant="ghost"
        className={styles.cycleButton}
        onClick={() => runKeyAction({ type: 'cycleSelection', step })}
        aria-keyshortcuts={keys.keys || undefined}
      >
        <span aria-hidden="true">{glyph}</span>
        <span className="sr-only">{label}</span>
      </Button>
    </Tooltip>
  );
}

interface PartyCardProps {
  id: EntityId;
  /** 1-based party slot, shown as the number badge. */
  slot: number;
  compact: boolean;
}

/** The fields a card shows, all primitives, so a card only re-renders when one changes. */
function useMember(id: EntityId) {
  return useSimStore(
    useShallow((s) => {
      const m = s.snapshot?.party.find((member) => member.id === id);
      if (!m) return null;
      return {
        name: m.name,
        raceId: m.raceId,
        classId: m.classId,
        alive: m.alive,
        hp: m.hp,
        maxHp: m.maxHp,
        mp: m.mp,
        maxMp: m.maxMp,
        intent: m.intent?.detail ?? null,
        rule: m.intent ? ruleLabel(m.intent.rule) : null,
        possessed: m.possessed,
        awaitingInput: m.awaitingInput,
      };
    }),
  );
}

/**
 * A member's timed statuses as badges with turns remaining (docs/VISUAL-DESIGN.md §3.2). The
 * selector returns one string, so the badges only re-render when a status or its turns change.
 */
function StatusBadges({ id }: { id: EntityId }) {
  const key = useSimStore((s) =>
    (s.snapshot?.domains.stats.members[id]?.statuses ?? []).map((st) => `${st.status} ${st.remaining} ${st.potency}`).join('|'),
  );
  if (key === '') return null;
  return (
    <ul className={styles.statuses} aria-label="Statuses">
      {key.split('|').map((entry, i) => {
        const [statusId = '', remaining = '0', potency = '1'] = entry.split(' ');
        const def = STATUSES.has(statusId) ? STATUSES.get(statusId) : undefined;
        const name = def?.name ?? contentName(statusId);
        const turns = Number(remaining);
        return (
          <li key={`${statusId}-${i}`}>
            <Tooltip
              content={
                <>
                  <strong>{name}</strong>
                  {potency !== '1' && <> ×{potency}</>}
                  {def?.harmful ? ' (harmful)' : ' (helpful)'}
                  <br />
                  {def?.description}
                  <br />
                  {turns} turn{turns === 1 ? '' : 's'} left.
                </>
              }
            >
              <span className={styles.status} data-harmful={def?.harmful || undefined} tabIndex={0}>
                <span aria-hidden="true" style={def ? { color: def.glyph.color } : undefined}>
                  {def?.glyph.ch ?? '•'}
                </span>{' '}
                {name} <span className={styles.statusTurns}>{turns}</span>
              </span>
            </Tooltip>
          </li>
        );
      })}
    </ul>
  );
}

/** One attribute as the card shows it, with what it is made of and what it adds, for the tooltip. */
interface AttributeChip {
  attribute: AttributeId;
  value: number;
  /** Class, race and own points: "Vanguard 11". */
  from: string[];
  /** Stats it adds to: "Max HP +6". */
  adds: string[];
}

function attributeChips(view: MemberStatsView | undefined): AttributeChip[] {
  if (view === undefined) return [];
  return ATTRIBUTE_IDS.map((attribute) => {
    const result = view.attributes[attribute];
    const source = attributeDefId(attribute);
    const adds: string[] = [];
    for (const stat of STAT_IDS) {
      // Summed per stat: a wielded weapon's scaling (ETH-082) credits its attribute's damage to it
      // and takes the unarmed attribute's back off, which nets to nothing on that chip.
      let total = 0;
      for (const part of view.stats[stat].parts) {
        if (part.source.id === source && part.op === 'add') total += part.value;
      }
      // Fractional formulas (ETH-177) leave float dust where the two scaling parts cancel.
      if (Math.round(total * 100) !== 0) adds.push(`${STAT_INFO[stat].label} ${signed(total)}${STAT_INFO[stat].percent === true ? '%' : ''}`);
    }
    return {
      attribute,
      value: result.value,
      from: result.parts.map((p, i) => `${p.source.label} ${i === 0 ? p.value : signed(p.value)}`),
      adds,
    };
  });
}

/**
 * A member's four attributes as compact chips ("BRN 12"), each with a tooltip saying where its
 * value comes from (class, race, training) and what it adds to each stat (ETH-033). The selector
 * returns one string, so the chips only re-render when a value or contribution changes.
 */
function AttributeChips({ id }: { id: EntityId }) {
  const key = useSimStore((s) => JSON.stringify(attributeChips(s.snapshot?.domains.stats.members[id])));
  const chips = JSON.parse(key) as AttributeChip[];
  if (chips.length === 0) return null;
  return (
    <ul className={styles.attributes} aria-label="Attributes">
      {chips.map((chip) => {
        const def = attributeDef(chip.attribute);
        return (
          <li key={chip.attribute}>
            <Tooltip
              content={
                <>
                  <strong>
                    {def.name} {chip.value}
                  </strong>
                  <br />
                  {def.description}
                  {chip.from.length > 0 && (
                    <>
                      <br />
                      From: {chip.from.join(', ')}.
                    </>
                  )}
                  <br />
                  {chip.adds.length > 0 ? <>Adds: {chip.adds.join(', ')}.</> : <>Adds nothing at this value.</>}
                  <br />
                  <span className={styles.attributeRule}>{attributeEffectText(chip.attribute)}.</span>
                </>
              }
            >
              <span className={styles.attribute} tabIndex={0} aria-label={`${def.name} ${chip.value}`}>
                <span className={styles.attributeAbbr}>{def.abbr}</span> {chip.value}
              </span>
            </Tooltip>
          </li>
        );
      })}
    </ul>
  );
}

/** A member's level view, or `null` before the snapshot has one. Parsed from a selector string. */
function useLevel(id: EntityId): LevelView | null {
  const key = useSimStore((s) => {
    const level = s.snapshot?.domains.stats.members[id]?.level;
    return level === undefined ? '' : JSON.stringify(level);
  });
  return key === '' ? null : (JSON.parse(key) as LevelView);
}

/** "Lv 3", with a tooltip on XP and how levels grow the class's attributes (ETH-034). */
function LevelBadge({ id, classId }: { id: EntityId; classId: string }) {
  const level = useLevel(id);
  if (level === null) return null;
  const growth = CLASSES.has(classId) ? growthLine(CLASSES.get(classId).growth) : null;
  return (
    <Tooltip
      placement="bottom"
      content={
        <>
          <strong>Level {level.level}</strong>
          <br />
          {level.xp} XP; level {level.level + 1} at {level.nextXp} XP.
          <br />
          {xpSourcesText()}
          {growth !== null && (
            <>
              <br />
              Each level rolls: {growth}.
            </>
          )}
        </>
      }
    >
      <span className={styles.level} tabIndex={0} aria-label={`Level ${level.level}`}>
        Lv {level.level}
      </span>
    </Tooltip>
  );
}

/** Progress through the current level as an XP bar (ETH-034). Levels have no cap (ETH-110). */
function XpBar({ id, name }: { id: EntityId; name: string }) {
  const level = useLevel(id);
  if (level === null) return null;
  return (
    <Bar
      label="XP"
      tone="xp"
      value={level.xp - level.levelXp}
      max={level.nextXp - level.levelXp}
      ariaLabel={`${name}'s XP toward the next level`}
    />
  );
}

/** True if the item def `def` can be worn (ETH-043). */
function wearable(def: string): boolean {
  return ITEMS.has(def) && gearSlots(ITEMS.get(def)).length > 0;
}

/** Sends `action` as the possessed adventurer's next move (ETH-066). */
function act(action: ActionRequest): void {
  runKeyAction({ type: 'act', action });
}

/** Joins an item's state note (ETH-044) and weapon scaling note (ETH-082) for `Explain`. */
function itemNote(stateNote?: string, scaling?: string, locked?: string): string | undefined {
  const parts = [stateNote, scaling, locked].filter((s): s is string => s !== undefined && s !== '');
  return parts.length === 0 ? undefined : parts.join(' ');
}

/** A small pack button for a possessed adventurer's item actions, with a tooltip saying what it does (or why it is disabled). */
function PackAction({
  label,
  hint,
  disabledReason,
  onClick,
}: {
  label: string;
  hint: string;
  disabledReason?: string;
  onClick(): void;
}) {
  if (disabledReason !== undefined) {
    return (
      <Button variant="ghost" className={styles.packAction} disabledReason={disabledReason} onClick={onClick}>
        {label}
      </Button>
    );
  }
  return (
    <Tooltip content={hint}>
      <Button variant="ghost" className={styles.packAction} onClick={onClick}>
        {label}
      </Button>
    </Tooltip>
  );
}

/**
 * The selected member's pack (ETH-061): weight carried against the Carry stat, the party's gold,
 * then one line per stack with an `Explain` tooltip. The selector returns one string, so the list
 * only re-renders when the pack or the gold changes. While the member is possessed (ETH-066),
 * gear gets Equip and Take off buttons and usable items a Use button, each spending its turn.
 */
function Pack({ id, possessed }: { id: EntityId; possessed: boolean }) {
  const key = useSimStore((s) => {
    const items = s.snapshot?.domains.items;
    const pack = items?.members[id];
    return pack === undefined ? '' : JSON.stringify({ gold: items?.gold ?? 0, ...pack });
  });
  if (key === '') return null;
  const pack = JSON.parse(key) as InventoryView & { gold: number };
  const over = pack.weight > pack.carry;
  return (
    <section className={styles.pack} aria-label="Pack">
      <p className={styles.packHeader}>
        <Tooltip content="Weight carried, and the Carry stat. Over it, the least valuable things get dropped.">
          <span tabIndex={0} data-over={over || undefined}>
            Pack {pack.weight}/{pack.carry}
            {over && ' (overloaded)'}
          </span>
        </Tooltip>
        <Tooltip content="The party's gold this run, for merchants.">
          <span tabIndex={0}>
            <span aria-hidden="true">$ </span>
            {pack.gold} gold
          </span>
        </Tooltip>
      </p>
      {pack.equipped.length > 0 && (
        <ul className={styles.packList} aria-label="Worn">
          {pack.equipped.map((worn) => (
            <li key={worn.slot} className={styles.packRow}>
              <span>
                <span className={styles.packSlot}>{EQUIP_SLOT_INFO[worn.slot].label}: </span>
                <Explain id={worn.def} name={worn.name} note={itemNote(worn.stateNote, worn.scaling, worn.locked)} />
                {worn.locked !== undefined && <span className={styles.packSlot}> (slot locked: cursed)</span>}
              </span>
              {possessed && (
                <PackAction
                  label={worn.cursed === true ? 'Cursed' : 'Take off'}
                  disabledReason={
                    worn.cursed === true
                      ? (worn.locked ?? `${worn.name} is cursed and cannot be removed until uncursed.`)
                      : undefined
                  }
                  hint={`Take off ${worn.name} and put it in the pack. Spends the turn.`}
                  onClick={() => act({ id: 'unequip', slot: worn.slot })}
                />
              )}
            </li>
          ))}
        </ul>
      )}
      {pack.items.length === 0 ? (
        <p className={styles.packEmpty}>Nothing carried.</p>
      ) : (
        <ul className={styles.packList}>
          {pack.items.map((item, i) => {
            const categoryLabel = ITEMS.has(item.def) ? ITEM_CATEGORY_INFO[ITEMS.get(item.def).category].label : 'Item';
            return (
              <li key={`${item.def}-${i}`} className={styles.packRow}>
                <span>
                  <Explain
                    id={item.def}
                    name={item.name}
                    note={itemNote(item.stateNote, item.scaling)}
                    unidentified={item.typeUnknown === true ? { name: item.name, category: categoryLabel } : undefined}
                  />
                  {item.qty > 1 && <span className={styles.packQty}> ×{item.qty}</span>}
                </span>
                {possessed && wearable(item.def) && (
                  <PackAction
                    label="Equip"
                    hint={`Put on ${item.name}; whatever was worn there goes into the pack. Spends the turn.`}
                    onClick={() => act({ id: 'equip', index: i })}
                  />
                )}
                {possessed && item.usable && (
                  <PackAction
                    label="Use"
                    hint={`Use one ${item.name}. Spends the turn.`}
                    onClick={() => act({ id: 'use', index: i })}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/**
 * Possess or release this adventurer (ETH-066), the same as `P` with it selected or a
 * double-click on it on the map.
 */
function PossessButton({ id, name, possessed }: { id: EntityId; name: string; possessed: boolean }) {
  const keys = keyHint({ type: 'togglePossession' });
  return (
    <Tooltip
      content={
        <>
          <strong>{possessed ? `Release ${name}` : `Possess ${name}`}</strong>
          <br />
          {possessed
            ? 'Hand them back to the AI, which decides their next turn.'
            : 'Play them yourself: the run waits for your command at each of their turns. Move or attack with WASD (Q/E/Z/C diagonals), the arrows or the numpad; G picks up, > and < take the stairs, F drinks from a fountain underfoot, . or X waits.'}
          {keys.hint && (
            <>
              <br />
              {keys.hint}
            </>
          )}
        </>
      }
    >
      <Button
        variant="ghost"
        className={styles.possess}
        pressed={possessed}
        aria-keyshortcuts={keys.keys || undefined}
        onClick={() => {
          useUiStore.getState().select(id);
          togglePossession();
        }}
      >
        {possessed ? 'Release' : 'Possess'}
      </Button>
    </Tooltip>
  );
}

function PartyCard({ id, slot, compact }: PartyCardProps) {
  const member = useMember(id);
  // A class or race the guild hasn't bought yet came as a teaser recruit (ETH-036).
  const untrained = useProfileStore((s) => member !== null && !(isAvailable(s.profile, member.classId) && isAvailable(s.profile, member.raceId)));
  const selected = useUiStore((s) => s.selected === id);
  const select = useUiStore((s) => s.select);
  if (!member) return null;

  const nameButton = (
    <button
      type="button"
      className={styles.name}
      aria-pressed={selected}
      onClick={() => select(selected ? null : id)}
    >
      <span className={styles.slot} aria-hidden="true">
        {slot}
      </span>
      {member.name}
    </button>
  );
  const hp = (
    <Bar
      label="HP"
      tone="hp"
      value={member.hp}
      max={member.maxHp}
      showValue={!compact}
      ariaLabel={`${member.name}'s HP`}
      className={compact ? styles.compactBar : undefined}
    />
  );

  if (compact) {
    return (
      <Card selected={selected} className={styles.compact} data-dead={!member.alive || undefined}>
        {nameButton}
        {member.alive ? hp : <span className={styles.dead}>✝ Dead</span>}
      </Card>
    );
  }

  return (
    <Card
      selected={selected}
      className={styles.card}
      data-dead={!member.alive || undefined}
      data-possessed={(member.alive && member.possessed) || undefined}
    >
      {member.alive && member.possessed && (
        <p className={styles.possessedBanner}>
          <span aria-hidden="true">◉ </span>Possessed{member.awaitingInput && ' · your move'}
        </p>
      )}
      <div className={styles.header}>
        {nameButton}
        <LevelBadge id={id} classId={member.classId} />
      </div>
      <p className={styles.kind}>
        <Explain id={member.raceId}>{contentName(member.raceId)}</Explain> <Explain id={member.classId}>{contentName(member.classId)}</Explain>
      </p>
      {untrained && (
        <Tooltip content="A teaser recruit: a class or race a run has revealed but the town hasn't bought yet. It plays normally and earns Mastery for its class.">
          <p className={styles.untrained} tabIndex={0}>
            Not yet trained by the guild
          </p>
        </Tooltip>
      )}
      {hp}
      {member.maxMp > 0 && (
        <Bar label="MP" tone="mp" value={member.mp} max={member.maxMp} ariaLabel={`${member.name}'s MP`} />
      )}
      {member.alive && <XpBar id={id} name={member.name} />}
      {member.alive && <AttributeChips id={id} />}
      {member.alive && <StatusBadges id={id} />}
      {member.alive && selected && <Pack id={id} possessed={member.possessed} />}
      {member.alive && <PossessButton id={id} name={member.name} possessed={member.possessed} />}
      {member.alive ? (
        <p className={styles.intent}>
          <span aria-hidden="true">➤ </span>
          {member.awaitingInput ? (
            <>
              Waiting for your command
              <span className={styles.rule}> · player</span>
            </>
          ) : member.intent === null ? (
            'Getting ready'
          ) : (
            <>
              {member.intent}
              <span className={styles.rule}> · {member.rule}</span>
            </>
          )}
        </p>
      ) : (
        <p className={styles.dead}>✝ Dead</p>
      )}
    </Card>
  );
}
