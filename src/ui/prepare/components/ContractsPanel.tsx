/**
 * The contracts panel (CLAUDE.md §2, step 7; ETH-024): the contracts as checkboxes, one per
 * contract slot. Victory needs every chosen one complete and the party back out. A run always
 * takes at least one, so the last one can't be cleared.
 */
import { CONTRACTS } from '../../../content';
import { buildingQuestRefusal, capacity, chosenContracts, contractSlots, isAvailable, questOffer, withOptIns } from '../../../meta';
import { applyRewardMultiplier } from '../../../sim';
import { Explain } from '../../codex/Explain';
import { rewardText } from '../../shell/logText/quests';
import styles from '../panels.module.css';
import type { PreparePanelProps } from '../types';

function contractPay(base: Readonly<Record<string, number>>, bonus: number): Record<string, number> {
  if (bonus <= 0) return { ...base };
  return Object.fromEntries(Object.entries(base).map(([k, n]) => [k, applyRewardMultiplier(n, 1 + bonus / 100)]));
}

export function ContractsPanel({ profile, choices, update }: PreparePanelProps) {
  const slots = contractSlots(profile);
  const chosenDefs = chosenContracts(profile, choices.contracts);
  const chosen = chosenDefs.map((d) => d.id);
  const bonus = capacity(withOptIns(profile, choices.optIns), 'contractRewardBonus', 0);
  const full = chosen.length >= slots;
  const toggle = (id: string, on: boolean) => {
    if (on) {
      // With one slot, picking another contract swaps it in.
      const kept = slots === 1 ? [] : chosen;
      update('contracts', { contractIds: [...kept, id] });
    } else if (chosen.length > 1) {
      update('contracts', { contractIds: chosen.filter((c) => c !== id) });
    }
  };
  return (
    <fieldset className={styles.choices}>
      <legend className={styles.label}>
        Contracts · {chosen.length} of {slots} {slots === 1 ? 'slot' : 'slots'}
      </legend>
      {CONTRACTS.all().map((c) => {
        const offer = questOffer(profile, c);
        // A building quest whose building is open is done and gone from the list (ETH-093).
        if (offer.state === 'done' || offer.state === 'hidden') return null;
        const open = isAvailable(profile, c.id) && offer.state === 'offered';
        const on = chosen.includes(c.id);
        // With one slot a pick swaps the old one out, so only a second slot can clash.
        const refusal = on || slots === 1 || !open ? null : buildingQuestRefusal(chosenDefs, c);
        const locked = !open || refusal !== null || (on && chosen.length === 1) || (!on && full && slots > 1);
        return (
          <label key={c.id} className={styles.choice} data-disabled={open ? undefined : 'true'}>
            <input type="checkbox" name="prepare-contracts" value={c.id} checked={on} disabled={locked} onChange={(e) => toggle(c.id, e.currentTarget.checked)} />
            <span className={styles.choiceText}>
              <span className={styles.choiceName}>
                {!open && <span aria-hidden="true">🔒 </span>}
                <Explain id={c.id} />
              </span>
              <span className={styles.note}>
                Pays {rewardText(contractPay(c.reward, bonus))}
                {bonus > 0 && ` (+${bonus}% Guild)`}
                {offer.state === 'locked' ? ` · not offered yet: ${offer.need}` : !open && ' · locked: unlocked by an upgrade'}
                {refusal !== null && ` · ${refusal}`}
              </span>
            </span>
          </label>
        );
      })}
      <span className={styles.note}>Victory needs every contract complete, then the walk back out.</span>
    </fieldset>
  );
}
