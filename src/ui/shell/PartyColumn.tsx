import { useShallow } from 'zustand/react/shallow';
import { STATUSES } from '../../content';
import type { EntityId } from '../../sim';
import { keyHint } from '../input/keymap';
import { runKeyAction } from '../input/useKeymap';
import { Bar, Button, Card, Panel, Tooltip } from '../kit';
import { useSimStore } from '../stores/simStore';
import { useUiStore } from '../stores/uiStore';
import styles from './PartyColumn.module.css';
import { contentName, ruleLabel } from './text';

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
        kind: `${contentName(m.raceId)} ${contentName(m.classId)}`,
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
      <div className={styles.header}>{nameButton}</div>
      <p className={styles.kind}>{member.kind}</p>
      {hp}
      {member.maxMp > 0 && (
        <Bar label="MP" tone="mp" value={member.mp} max={member.maxMp} ariaLabel={`${member.name}'s MP`} />
      )}
      {member.alive && <StatusBadges id={id} />}
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
