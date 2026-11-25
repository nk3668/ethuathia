/**
 * The party panel (CLAUDE.md §2, step 1): one row per party slot the Guild Hall allows, each
 * with a class and a race to recruit, or "Random". Slots the party can't use yet are listed
 * locked, with what opens them.
 */
import { CAPACITY_INFO, gearSlots, isStampId, ITEMS, STAMP_IDS, STAMPS } from '../../../content';
import type { ClassDef, StampId } from '../../../content';
import { availableClasses, availableRaces, MAX_PARTY_SIZE, ownsStamps, partySize, RANDOM_PICK, upgradeStartConfig, withOptIns } from '../../../meta';
import type { RecruitPick } from '../../../meta';
import { kitIdsFor } from '../../../sim';
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
  const start = upgradeStartConfig(withOptIns(profile, choices.optIns));
  const kitText = (cls: ClassDef | undefined, stamp: StampId | undefined): string | undefined => {
    if (cls?.kit === undefined) return undefined;
    if (!start.kitTier && !start.kitEnchant && start.trinket !== true && !stamps) return undefined;
    const ids = kitIdsFor(cls.id, { tier: start.kitTier, trinket: start.trinket });
    const weaponIdx = ids.findIndex((id) => ITEMS.has(id) && gearSlots(ITEMS.get(id)).includes('mainHand'));
    const defenseIdx = ids.findIndex((id) => ITEMS.has(id) && ITEMS.get(id).category === 'armor');
    return ids
      .map((id, idx) => {
        const name = ITEMS.has(id) ? ITEMS.get(id).name : id;
        const plus = (idx === weaponIdx && start.kitEnchant?.includes('weapon') === true) || (idx === defenseIdx && start.kitEnchant?.includes('defense') === true);
        const marked = stamps && stamp !== undefined && ((idx === weaponIdx && STAMPS[stamp].piece === 'weapon') || (idx === defenseIdx && STAMPS[stamp].piece === 'defense'));
        return `${name}${plus ? ' +1' : ''}${marked ? ` (${stamp})` : ''}`;
      })
      .join(', ');
  };

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
                  <span aria-hidden="true">🔒 </span>Locked: raise the {CAPACITY_INFO.partySize.name.toLowerCase()} in Town
                </span>
              </li>
            );
          }
          const pick = slots[i] ?? RANDOM_PICK;
          const selectedClass = pick.classId === null ? undefined : classes.find((c) => c.id === pick.classId);
          const selectedRace = pick.raceId === null ? undefined : races.find((r) => r.id === pick.raceId);
          const effectiveStamp = isStampId(pick.stamp) ? pick.stamp : selectedClass?.stamp;
          const preview = slotAttributePreview(selectedClass, selectedRace, kitText(selectedClass, effectiveStamp));
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
                {stamps && effectiveStamp !== undefined && (
                  <>
                    {' · '}
                    <Explain id={STAMPS[effectiveStamp].enchantment} reveal />
                  </>
                )}
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

