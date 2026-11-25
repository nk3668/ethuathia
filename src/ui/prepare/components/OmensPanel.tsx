/**
 * The Omens panel (ETH-185): one card per unlocked Omen with a rank selector (Off, then each
 * rank), and the total reward multiplier with a tooltip that itemizes it. Every Omen starts off;
 * nothing here is on until the player picks a rank.
 */
import { omenRank, rankNumeral } from '../../../content';
import { activeOmens, availableOmens, multiplierText, OMEN_MULTIPLIER_TEXT, omenBreakdown, omenMultiplier } from '../../../meta';
import { Explain } from '../../codex/Explain';
import { Tooltip } from '../../kit';
import styles from '../panels.module.css';
import type { PreparePanelProps } from '../types';

export function OmensPanel({ profile, choices, update }: PreparePanelProps) {
  const omens = availableOmens(profile);
  const active = activeOmens(profile, choices.omens);
  const lines = omenBreakdown(active);
  const setRank = (id: string, rank: number) => {
    const ranks = Object.fromEntries(Object.entries(choices.omens.ranks).filter(([key]) => key !== id));
    update('omens', { ranks: rank > 0 ? { ...ranks, [id]: rank } : ranks });
  };
  return (
    <div className={styles.choices}>
      <p className={styles.multiplier} data-testid="omen-multiplier">
        <Tooltip
          content={
            <>
              <strong>Reward multiplier</strong>
              <br />
              {lines.length === 0 ? 'No Omens on: ×1.00.' : `1.00 base${lines.map((l) => ` + ${l.bonus.toFixed(2)} ${l.name} ${rankNumeral(l.rank)}`).join('')} = ${multiplierText(omenMultiplier(active))}.`}
              <br />
              {OMEN_MULTIPLIER_TEXT}
            </>
          }
        >
          Reward multiplier
        </Tooltip>
        {': '}
        {multiplierText(omenMultiplier(active))}
      </p>
      {omens.map((def) => {
        const rank = active.find((o) => o.id === def.id)?.rank ?? 0;
        return (
          <fieldset key={def.id} className={styles.omen} data-on={rank > 0} data-testid={`omen-${def.id}`}>
            <legend className={styles.choiceName}>
              <Explain id={def.id} reveal />
            </legend>
            <span className={styles.note}>{rank > 0 ? (omenRank(def, rank)?.text ?? '') : 'Off. Pick a rank to take the risk and the reward.'}</span>
            <div className={styles.rankRow}>
              {[0, ...def.ranks.map((_, i) => i + 1)].map((r) => {
                const info = r === 0 ? undefined : omenRank(def, r);
                return (
                  <Tooltip key={r} content={info === undefined ? 'Off: this Omen changes nothing.' : `${info.text} Rewards +${Math.round(info.reward * 100)}%.`}>
                    <label className={styles.rankOption}>
                      <input type="radio" name={`prepare-omen-${def.id}`} value={r} checked={rank === r} onChange={() => setRank(def.id, r)} />
                      {r === 0 ? 'Off' : rankNumeral(r)}
                    </label>
                  </Tooltip>
                );
              })}
            </div>
          </fieldset>
        );
      })}
    </div>
  );
}
