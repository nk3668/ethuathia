import { useId, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { downloadTextFile, readTextFile } from '../../platform';
import { Button } from '../kit';
import { useProfileStore } from '../stores/profileStore';
import styles from './SaveOptions.module.css';

const TIME_FORMAT = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' });

/**
 * The Save section of the Options tab: save status, save now, export to text or a file, import
 * with validation, and a hard reset behind a confirmation. Everything stays on this machine.
 */
export function SaveOptions() {
  const status = useProfileStore((s) => s.status);
  const error = useProfileStore((s) => s.error);
  const notes = useProfileStore((s) => s.notes);
  const lastSavedAt = useProfileStore((s) => s.lastSavedAt);
  const storeLabel = useProfileStore((s) => s.storeLabel);
  const save = useProfileStore((s) => s.save);
  const exportSave = useProfileStore((s) => s.exportSave);
  const importSave = useProfileStore((s) => s.importSave);
  const hardReset = useProfileStore((s) => s.hardReset);

  const [text, setText] = useState('');
  const [message, setMessage] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const textId = useId();

  const runImport = async (source: string) => {
    const result = await importSave(source);
    setMessage(result.ok ? { tone: 'good', text: 'Save imported.' } : { tone: 'bad', text: `Import failed: ${result.error}` });
  };

  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) await runImport(await readTextFile(file));
  };

  return (
    <section className={styles.section} aria-labelledby={`${textId}-heading`}>
      <h3 id={`${textId}-heading`} className={styles.heading}>
        Save
      </h3>
      <p className={styles.status} role="status">
        {statusLine(status, lastSavedAt, storeLabel)}
      </p>
      {error !== null && (
        <p className={styles.bad} role="alert">
          <span aria-hidden="true">⚠ </span>
          {error}
        </p>
      )}
      {notes.length > 0 && (
        <ul className={styles.notes}>
          {notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      )}

      <div className={styles.row}>
        <Button disabled={status !== 'ready'} onClick={() => void save(true)}>
          Save now
        </Button>
        <Button onClick={() => setText(exportSave())}>Export as text</Button>
        <Button onClick={() => downloadTextFile(`ethuathia-save-${fileStamp(new Date())}.json`, exportSave())}>
          Export to file
        </Button>
      </div>

      <label htmlFor={textId} className={styles.label}>
        Save text
      </label>
      <textarea
        id={textId}
        className={styles.text}
        rows={4}
        spellCheck={false}
        value={text}
        placeholder="Exported save text appears here. Paste a save here to import it."
        onChange={(e) => setText(e.target.value)}
      />
      <div className={styles.row}>
        <Button disabled={text.trim() === ''} onClick={() => void runImport(text)}>
          Import text
        </Button>
        <Button onClick={() => fileRef.current?.click()}>Import from file</Button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json,text/plain"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => void onFile(e)}
        />
      </div>
      {message && (
        <p className={message.tone === 'good' ? styles.good : styles.bad} role="status">
          <span aria-hidden="true">{message.tone === 'good' ? '✓ ' : '⚠ '}</span>
          {message.text}
        </p>
      )}

      <div className={styles.row}>
        {confirmingReset ? (
          <>
            <span className={styles.bad}>Erase all progress? This can't be undone.</span>
            <Button
              className={styles.danger}
              onClick={() => {
                setConfirmingReset(false);
                void hardReset().then(() => setMessage({ tone: 'good', text: 'Progress erased. A new profile has started.' }));
              }}
            >
              Erase everything
            </Button>
            <Button variant="ghost" onClick={() => setConfirmingReset(false)}>
              Cancel
            </Button>
          </>
        ) : (
          <Button className={styles.danger} onClick={() => setConfirmingReset(true)}>
            Hard reset…
          </Button>
        )}
      </div>
    </section>
  );
}

function statusLine(status: string, lastSavedAt: number | null, storeLabel: string | null): string {
  const where = storeLabel === null ? '' : ` Saves go to ${storeLabel}.`;
  switch (status) {
    case 'loading':
      return 'Loading your save…';
    case 'failed':
      return `Autosave is off until the save is fixed: import a save or reset.${where}`;
    case 'ready':
      return `${lastSavedAt === null ? 'Not saved yet.' : `Last saved ${TIME_FORMAT.format(lastSavedAt)}.`} Autosaves regularly and on close.${where}`;
    default:
      return 'Saving is not set up.';
  }
}

/** `2026-11-17-1405`, for export file names. */
function fileStamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
}
