// Export and import of everything stored on the phone, as one JSON file.
import type { ActivityType, Effort, Goal, Profile, Sex } from './calc';
import { MEALS, type ActivityEntry, type AppState, type FoodEntry, type Reminders } from './store';

export class BackupError extends Error {}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const MAX_ENTRIES = 100000;
export const MAX_BACKUP_BYTES = 8 * 1024 * 1024;

function fail(what: string): never {
  throw new BackupError(`${what} is not valid in this file.`);
}

function obj(x: unknown, what: string): Record<string, unknown> {
  if (!x || typeof x !== 'object' || Array.isArray(x)) fail(what);
  return x as Record<string, unknown>;
}

function arr(x: unknown, what: string): unknown[] {
  if (!Array.isArray(x) || x.length > MAX_ENTRIES) fail(what);
  return x;
}

function num(x: unknown, what: string, min: number, max: number): number {
  if (typeof x !== 'number' || !Number.isFinite(x) || x < min || x > max) fail(what);
  return x;
}

function str(x: unknown, what: string, max = 200): string {
  if (typeof x !== 'string' || x.length > max) fail(what);
  return x;
}

function oneOf<T extends string | number>(x: unknown, allowed: readonly T[], what: string): T {
  if (!allowed.includes(x as T)) fail(what);
  return x as T;
}

function date(x: unknown, what: string): string {
  const s = str(x, what, 10);
  if (!DATE.test(s)) fail(what);
  return s;
}

function profile(x: unknown): Profile {
  const o = obj(x, 'The profile');
  return {
    sex: oneOf<Sex>(o.sex, ['female', 'male'], 'The profile sex'),
    age: num(o.age, 'The profile age', 18, 120),
    heightCm: num(o.heightCm, 'The profile height', 100, 250),
    weightKg: num(o.weightKg, 'The profile weight', 25, 400),
    goal: oneOf<Goal>(o.goal, ['lose', 'maintain', 'gain'], 'The profile goal'),
    paceKgPerWeek: oneOf(o.paceKgPerWeek, [0.25, 0.5], 'The profile pace'),
    creditPct: oneOf(o.creditPct, [0, 50, 100], 'The activity credit'),
  };
}

function food(x: unknown): FoodEntry {
  const o = obj(x, 'A food entry');
  const out: FoodEntry = {
    id: str(o.id, 'A food id', 80),
    date: date(o.date, 'A food date'),
    meal: oneOf(o.meal, MEALS, 'A food meal'),
    name: str(o.name, 'A food name'),
    amount: str(o.amount, 'A food amount', 100),
    kcal: num(o.kcal, 'A food energy value', 0, 20000),
    protein: num(o.protein, 'A food protein value', 0, 5000),
    carbs: num(o.carbs, 'A food carbs value', 0, 5000),
    fat: num(o.fat, 'A food fat value', 0, 5000),
  };
  if (o.barcode !== undefined) out.barcode = str(o.barcode, 'A food barcode', 20);
  return out;
}

function activity(x: unknown): ActivityEntry {
  const o = obj(x, 'An activity entry');
  const out: ActivityEntry = {
    id: str(o.id, 'An activity id', 80),
    date: date(o.date, 'An activity date'),
    type: oneOf<ActivityType>(o.type, ['Run', 'Walk', 'Ride', 'Other'], 'An activity type'),
    name: str(o.name, 'An activity name'),
    durationSec: num(o.durationSec, 'An activity duration', 0, 172800),
    effort: oneOf<Effort>(o.effort, ['light', 'moderate', 'hard'], 'An activity effort'),
    kcal: num(o.kcal, 'An activity energy value', 0, 50000),
  };
  if (o.distanceM !== undefined) out.distanceM = num(o.distanceM, 'An activity distance', 0, 1_000_000);
  if (o.track !== undefined) {
    out.track = arr(o.track, 'An activity route')
      .slice(0, 2000)
      .map((p) => {
        const pair = arr(p, 'A route point');
        return [num(pair[0], 'A route latitude', -90, 90), num(pair[1], 'A route longitude', -180, 180)] as [number, number];
      });
  }
  return out;
}

function reminders(x: unknown): Reminders {
  const o = obj(x, 'The reminders');
  const time = (v: unknown, what: string) => {
    const s = str(v, what, 5);
    if (!TIME.test(s)) fail(what);
    return s;
  };
  return { on: o.on === true, midday: time(o.midday, 'The lunch reminder time'), evening: time(o.evening, 'The evening reminder time') };
}

export function backupFileName(day: string): string {
  return `balance-backup-${day}.json`;
}

export function serializeBackup(state: AppState, now = new Date()): string {
  return JSON.stringify({ app: 'balance', format: 1, exportedAt: now.toISOString(), data: state }, null, 2);
}

/** Reads a backup file's text. Throws BackupError with a readable message when it is not usable. */
export function parseBackup(text: string): AppState {
  let root: unknown;
  try {
    root = JSON.parse(text);
  } catch {
    throw new BackupError('This file is not a Balance backup.');
  }
  const o = root && typeof root === 'object' ? (root as Record<string, unknown>) : null;
  if (!o || o.app !== 'balance') throw new BackupError('This file is not a Balance backup.');
  if (o.format !== 1) throw new BackupError('This backup was made by a newer version of Balance. Update the app and try again.');
  const d = obj(o.data, 'The data');
  const state: AppState = {
    v: 1,
    profile: d.profile === null || d.profile === undefined ? null : profile(d.profile),
    foods: arr(d.foods, 'The food list').map(food),
    activities: arr(d.activities, 'The activity list').map(activity),
    weights: arr(d.weights, 'The weight list').map((w) => {
      const e = obj(w, 'A weight entry');
      return { date: date(e.date, 'A weight date'), kg: num(e.kg, 'A weight value', 25, 400) };
    }),
  };
  if (d.reminders !== undefined) state.reminders = reminders(d.reminders);
  return state;
}

export function describeBackup(s: AppState): string {
  const days = new Set([...s.foods.map((f) => f.date), ...s.activities.map((a) => a.date), ...s.weights.map((w) => w.date)]);
  return `${s.foods.length} foods, ${s.activities.length} activities and ${s.weights.length} weights over ${days.size} days`;
}
