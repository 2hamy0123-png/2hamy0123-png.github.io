// Plans which reminder notifications to schedule. Pure, so it is unit-tested.

export interface ReminderPlanInput {
  on: boolean;
  midday: string;
  evening: string;
  /** Lunch is already logged today, so today's lunch reminder is skipped. */
  skipMidday: boolean;
  /** Dinner is already logged today, so today's evening reminder is skipped. */
  skipEvening: boolean;
}

export interface PlannedReminder {
  id: number;
  at: Date;
  title: string;
  body: string;
}

export const REMINDER_DAYS = 7;
export const REMINDER_ID_BASE = 1000;

/** Every id this app may use, so old reminders can be cleared before new ones are set. */
export function allReminderIds(): number[] {
  const ids: number[] = [];
  for (let d = 0; d < REMINDER_DAYS; d++) for (let slot = 0; slot < 2; slot++) ids.push(REMINDER_ID_BASE + d * 10 + slot);
  return ids;
}

function at(day: Date, offset: number, hhmm: string): Date | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hhmm);
  if (!m) return null;
  return new Date(day.getFullYear(), day.getMonth(), day.getDate() + offset, Number(m[1]), Number(m[2]), 0, 0);
}

export function planReminders(plan: ReminderPlanInput, now: Date): PlannedReminder[] {
  if (!plan.on) return [];
  const out: PlannedReminder[] = [];
  for (let d = 0; d < REMINDER_DAYS; d++) {
    const slots: { slot: number; time: string; skip: boolean; title: string; body: string }[] = [
      { slot: 0, time: plan.midday, skip: plan.skipMidday, title: 'Lunch time', body: 'Log your lunch to keep your day on track.' },
      { slot: 1, time: plan.evening, skip: plan.skipEvening, title: 'Close out your day', body: 'Log your dinner and any activity so your streak stays safe.' },
    ];
    for (const s of slots) {
      const when = at(now, d, s.time);
      if (!when || when.getTime() <= now.getTime()) continue;
      if (d === 0 && s.skip) continue;
      out.push({ id: REMINDER_ID_BASE + d * 10 + s.slot, at: when, title: s.title, body: s.body });
    }
  }
  return out;
}
