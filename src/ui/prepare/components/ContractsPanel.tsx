/**
 * The contracts panel (CLAUDE.md §2, step 7; ETH-024): the contracts as checkboxes, one per
 * contract slot. Victory needs every chosen one complete and the party back out. A run always
 * takes at least one, so the last one can't be cleared.
 */
import { CONTRACTS } from '../../../content';
import { chosenContracts, contractSlots, isAvailable } from '../../../meta';
import { Explain } from '../../codex/Explain';
import { rewardText } from '../../shell/logText/quests';
import styles from '../panels.module.css';
import type { PreparePanelProps } from '../types';

export function ContractsPanel({ profile, choices, update }: PreparePanelProps) {
  const slots = contractSlots(profile);
  const chosen = chosenContracts(profile, choices.contracts).map((d) => d.id);
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
        const open = isAvailable(profile, c.id);
        const on = chosen.includes(c.id);
        const locked = !open || (on && chosen.length === 1) || (!on && full && slots > 1);
        return (
          <label key={c.id} className={styles.choice} data-disabled={open ? undefined : 'true'}>
            <input type="checkbox" name="prepare-contracts" value={c.id} checked={on} disabled={locked} onChange={(e) => toggle(c.id, e.currentTarget.checked)} />
            <span className={styles.choiceText}>
              <span className={styles.choiceName}>
                {!open && <span aria-hidden="true">🔒 </span>}
                <Explain id={c.id} />
              </span>
              <span className={styles.note}>
                Pays {rewardText(c.reward)}
                {!open && ' · locked: unlocked by an upgrade'}
              </span>
            </span>
          </label>
        );
      })}
      <span className={styles.note}>Victory needs every contract complete, then the walk back out.</span>
    </fieldset>
  );
}
