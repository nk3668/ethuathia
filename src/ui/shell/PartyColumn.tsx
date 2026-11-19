import { useShallow } from 'zustand/react/shallow';
import { ATTRIBUTE_IDS, attributeDef, attributeDefId, CLASSES, EQUIP_SLOT_INFO, STATUSES } from '../../content';
import type { AttributeId } from '../../content';
import { STAT_IDS, STAT_INFO } from '../../sim';
import type { EntityId, InventoryView, LevelView, MemberStatsView } from '../../sim';
import { Explain } from '../codex/Explain';
import { attributeEffectText, growthLine, xpSourcesText } from '../codex/attributeText';
import { keyHint } from '../input/keymap';
import { runKeyAction } from '../input/useKeymap';
import { Bar, Button, Card, Panel, Tooltip } from '../kit';
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
 * Selects the previous or next living adventurer, the same as its key in the keymap (`[` / `]`).
 * The map's follow camera and the selected card move with the selection.
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
      for (const part of view.stats[stat].parts) {
        if (part.source.id === source && part.op === 'add') adds.push(`${STAT_INFO[stat].label} ${signed(part.value)}`);
      }
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

/**
 * The selected member's pack (ETH-061): weight carried against the Carry stat, the party's gold,
 * then one line per stack with an `Explain` tooltip. The selector returns one string, so the list
 * only re-renders when the pack or the gold changes.
 */
function Pack({ id }: { id: EntityId }) {
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
            <li key={worn.slot}>
              <span className={styles.packSlot}>{EQUIP_SLOT_INFO[worn.slot].label}: </span>
              <Explain id={worn.def}>{contentName(worn.def)}</Explain>
            </li>
          ))}
        </ul>
      )}
      {pack.items.length === 0 ? (
        <p className={styles.packEmpty}>Nothing carried.</p>
      ) : (
        <ul className={styles.packList}>
          {pack.items.map((item, i) => (
            <li key={`${item.def}-${i}`}>
              <Explain id={item.def}>{contentName(item.def)}</Explain>
              {item.qty > 1 && <span className={styles.packQty}> ×{item.qty}</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function PartyCard({ id, slot, compact }: PartyCardProps) {
  const member = useMember(id);
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
    <Card selected={selected} className={styles.card} data-dead={!member.alive || undefined}>
      <div className={styles.header}>
        {nameButton}
        <LevelBadge id={id} classId={member.classId} />
      </div>
      <p className={styles.kind}>
        <Explain id={member.raceId}>{contentName(member.raceId)}</Explain> <Explain id={member.classId}>{contentName(member.classId)}</Explain>
      </p>
      {hp}
      {member.maxMp > 0 && (
        <Bar label="MP" tone="mp" value={member.mp} max={member.maxMp} ariaLabel={`${member.name}'s MP`} />
      )}
      {member.alive && <XpBar id={id} name={member.name} />}
      {member.alive && <AttributeChips id={id} />}
      {member.alive && <StatusBadges id={id} />}
      {member.alive && selected && <Pack id={id} />}
      {member.alive ? (
        <p className={styles.intent}>
          <span aria-hidden="true">➤ </span>
          {member.intent === null ? (
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
