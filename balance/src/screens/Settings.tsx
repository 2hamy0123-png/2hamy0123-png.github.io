import { useRef, useState } from 'react';
import { MAX_BACKUP_BYTES, BackupError, backupFileName, describeBackup, parseBackup, serializeBackup } from '../lib/backup';
import { dateKey } from '../lib/calc';
import { isNative, requestReminderPermission, shareBackup } from '../lib/native';
import { DEFAULT_REMINDERS, type AppState, type Reminders } from '../lib/store';
import { Icon, Segmented } from '../ui';

interface Props {
  state: AppState;
  /** On the first-run screen only restoring makes sense. */
  restoreOnly?: boolean;
  onReminders: (r: Reminders) => void;
  onRestore: (s: AppState) => void;
}

export function Settings({ state, restoreOnly, onReminders, onRestore }: Props) {
  const [message, setMessage] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const reminders = state.reminders ?? DEFAULT_REMINDERS;
  const native = isNative();

  const setOn = async (on: boolean) => {
    if (on && !(await requestReminderPermission())) {
      setMessage({ tone: 'bad', text: 'Notifications are blocked. Allow them for Balance in your phone settings to get reminders.' });
      return;
    }
    setMessage(null);
    onReminders({ ...reminders, on });
  };

  const exportData = async () => {
    try {
      await shareBackup(serializeBackup(state), backupFileName(dateKey(new Date())));
      setMessage({ tone: 'ok', text: 'Backup ready. Keep the file somewhere safe, like Drive or email to yourself.' });
    } catch (e) {
      // Closing the share sheet is not a failure worth reporting.
      if (e instanceof Error && /cancel/i.test(e.message)) return;
      setMessage({ tone: 'bad', text: 'Could not create the backup file.' });
    }
  };

  const importData = async (file: File | undefined) => {
    if (!file) return;
    try {
      if (file.size > MAX_BACKUP_BYTES) throw new BackupError('This file is too large to be a Balance backup.');
      const restored = parseBackup(await file.text());
      const have = state.foods.length + state.activities.length + state.weights.length > 0;
      const ok = window.confirm(
        `Restore ${describeBackup(restored)}?${have ? '\n\nThis replaces everything now on this phone.' : ''}`,
      );
      if (!ok) return;
      onRestore(restored);
    } catch (e) {
      setMessage({ tone: 'bad', text: e instanceof BackupError ? e.message : 'Could not read that file.' });
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <>
      {!restoreOnly ? (
        <section className="card stack" aria-label="Reminders" style={{ gap: 12 }}>
          <div className="toggle-row">
            <h2 style={{ fontSize: 16, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon name="bell" size={18} />
              Reminders
            </h2>
          </div>
          {native ? (
            <>
              <Segmented
                label="Remind me to log meals"
                value={reminders.on ? 'on' : 'off'}
                onChange={(v) => void setOn(v === 'on')}
                options={[
                  { value: 'off', label: 'Off' },
                  { value: 'on', label: 'On' },
                ]}
              />
              {reminders.on ? (
                <div className="grid-2">
                  <div className="field">
                    <label htmlFor="remind-midday" className="field-label">
                      Lunch
                    </label>
                    <input
                      id="remind-midday"
                      className="time-input"
                      type="time"
                      value={reminders.midday}
                      onChange={(e) => e.target.value && onReminders({ ...reminders, midday: e.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="remind-evening" className="field-label">
                      Day end
                    </label>
                    <input
                      id="remind-evening"
                      className="time-input"
                      type="time"
                      value={reminders.evening}
                      onChange={(e) => e.target.value && onReminders({ ...reminders, evening: e.target.value })}
                    />
                  </div>
                </div>
              ) : null}
              <p className="tiny muted">A reminder is skipped on days you already logged that meal.</p>
            </>
          ) : (
            <p className="small muted">Reminders work in the Android app.</p>
          )}
        </section>
      ) : null}

      <section className="card stack" aria-label="Your data" style={{ gap: 12 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600 }}>Your data</h2>
        <p className="small muted">
          Everything is stored on this phone only. Save a backup file so you can restore it on a new phone or after a reset.
        </p>
        <div className="row">
          {!restoreOnly ? (
            <button type="button" className="btn btn-outline grow" onClick={() => void exportData()}>
              <Icon name="download" size={18} />
              <span>Back up</span>
            </button>
          ) : null}
          <button type="button" className="btn btn-outline grow" onClick={() => fileRef.current?.click()}>
            <span>Restore from file</span>
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json,text/plain"
          hidden
          aria-label="Backup file"
          onChange={(e) => void importData(e.target.files?.[0])}
        />
        {message ? (
          <p className={message.tone === 'bad' ? 'notice' : 'small muted'} role={message.tone === 'bad' ? 'alert' : 'status'}>
            {message.text}
          </p>
        ) : null}
      </section>
    </>
  );
}
