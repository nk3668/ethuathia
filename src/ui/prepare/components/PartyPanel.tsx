/**
 * The party panel (CLAUDE.md §2, step 1): one row per party slot the Guild Hall allows, each
 * with a class and a race to recruit, or "Random". Slots the party can't use yet are listed
 * locked, with what opens them.
 */
import { CAPACITY_INFO, isStampId, STAMP_IDS, STAMPS } from '../../../content';
import { availableClasses, availableRaces, MAX_PARTY_SIZE, ownsStamps, partySize, RANDOM_PICK } from '../../../meta';
import type { RecruitPick } from '../../../meta';
import { Explain } from '../../codex/Explain';
import styles from '../panels.module.css';
import type { PreparePanelProps } from '../types';
import { classOptionLabel, raceOptionLabel, slotAttributePreview } from './attributePreview';

const RANDOM = '';

export function PartyPanel({ profile, choices, update }: PreparePanelProps) {
  const size = partySize(profile);
  const classes = availableClasses(profile);
  const races = availableRaces(profile);
  const slots = choices.party.slots;
  const stamps = ownsStamps(profile);

  const setSlot = (i: number, pick: RecruitPick) => {
    const next = Array.from({ length: Math.max(slots.length, i + 1) }, (_, j) => slots[j] ?? RANDOM_PICK);
    next[i] = pick;
    update('party', { slots: next });
  };

  return (
    <>
      <p className={styles.note}>
        {size === 1 ? 'One adventurer descends.' : `${size} adventurers descend together.`} Anything left on Random is a
        new recruit with a random name.
      </p>
      <ol className={styles.slots}>
        {Array.from({ length: MAX_PARTY_SIZE }, (_, i) => {
          if (i >= size) {
            return (
              <li key={i} className={styles.slot} data-locked="true">
                <span className={styles.slotNumber}>{i + 1}</span>
                <span className={styles.locked}>
                  <span aria-hidden="true">🔒 </span>Locked: raise the {CAPACITY_INFO.partySize.name.toLowerCase()} in the Guild Hall
                </span>
              </li>
            );
          }
          const pick = slots[i] ?? RANDOM_PICK;
          const selectedClass = pick.classId === null ? undefined : classes.find((c) => c.id === pick.classId);
          const selectedRace = pick.raceId === null ? undefined : races.find((r) => r.id === pick.raceId);
          const preview = slotAttributePreview(selectedClass, selectedRace);
          return (
            <li key={i} className={styles.slot}>
              <span className={styles.slotNumber}>{i + 1}</span>
              <label className={styles.field}>
                <span className={styles.label}>Class</span>
                <select
                  name={`slot-${i}-class`}
                  value={selectedClass?.id ?? RANDOM}
                  onChange={(e) => setSlot(i, { ...pick, classId: e.currentTarget.value === RANDOM ? null : e.currentTarget.value })}
                >
                  <option value={RANDOM}>Random</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {classOptionLabel(c)}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.field}>
                <span className={styles.label}>Race</span>
                <select
                  name={`slot-${i}-race`}
                  value={selectedRace?.id ?? RANDOM}
                  onChange={(e) => setSlot(i, { ...pick, raceId: e.currentTarget.value === RANDOM ? null : e.currentTarget.value })}
                >
                  <option value={RANDOM}>Random</option>
                  {races.map((r) => (
                    <option key={r.id} value={r.id}>
                      {raceOptionLabel(r)}
                    </option>
                  ))}
                </select>
              </label>
              {stamps && (
                <label className={styles.field}>
                  <span className={styles.label}>Forge Stamp</span>
                  <select
                    name={`slot-${i}-stamp`}
                    value={pick.stamp ?? RANDOM}
                    title="A stamp worked into this adventurer's starting kit. Keen goes on the main-hand item, Warding and Nimble on the first armor piece."
                    onChange={(e) => setSlot(i, { ...pick, stamp: isStampId(e.currentTarget.value) ? e.currentTarget.value : null })}
                  >
                    <option value={RANDOM}>
                      {selectedClass?.stamp === undefined ? 'Class default' : `Class default (${STAMPS[selectedClass.stamp].name})`}
                    </option>
                    {STAMP_IDS.map((s) => (
                      <option key={s} value={s}>
                        {STAMPS[s].name}: {STAMPS[s].text}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <span className={styles.summary}>
                {selectedClass !== undefined ? <Explain id={selectedClass.id} reveal /> : 'any class'}
                {' · '}
                {selectedRace !== undefined ? <Explain id={selectedRace.id} reveal /> : 'any race'}
              </span>
              <span className={styles.preview} data-random={preview.resolved ? undefined : 'true'}>
                {preview.text}
              </span>
            </li>
          );
        })}
      </ol>
    </>
  );
}

