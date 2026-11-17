import { useShallow } from 'zustand/react/shallow';
import type { EntityId } from '../../sim';
import { Bar, Card, Panel } from '../kit';
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
    <Panel title="Party" className={styles.column}>
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
