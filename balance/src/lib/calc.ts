// Pure calculation rules for Balance. Everything here is unit-tested.

export type Sex = 'female' | 'male';
export type Goal = 'lose' | 'maintain' | 'gain';
export type Effort = 'light' | 'moderate' | 'hard';
export type ActivityType = 'Run' | 'Walk' | 'Ride' | 'Other';

export interface Profile {
  sex: Sex;
  age: number;
  heightCm: number;
  weightKg: number;
  goal: Goal;
  paceKgPerWeek: number; // 0.25 or 0.5
  creditPct: number; // share of burned kcal added back to the budget
}

export const MIN_AGE = 18;
export const KCAL_PER_KG = 7700;
export const FLOOR_KCAL: Record<Sex, number> = { female: 1200, male: 1500 };
export const WEEKLY_ACTIVE_MIN = 150;

/** Mifflin-St Jeor resting energy, kcal per day. */
export function bmr(p: Pick<Profile, 'sex' | 'age' | 'heightCm' | 'weightKg'>): number {
  const base = 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.age;
  return p.sex === 'male' ? base + 5 : base - 161;
}

export function bmi(p: Pick<Profile, 'heightCm' | 'weightKg'>): number {
  const m = p.heightCm / 100;
  return p.weightKg / (m * m);
}

/** Losing weight is not offered to people who are already underweight. */
export function canLose(p: Pick<Profile, 'heightCm' | 'weightKg'>): boolean {
  return bmi(p) >= 18.5;
}

export function isAdult(age: number): boolean {
  return age >= MIN_AGE;
}

export interface DailyTarget {
  target: number;
  low: number;
  high: number;
  floored: boolean;
}

/**
 * Daily target before activity. Baseline is resting energy times 1.2
 * (sedentary), so logged activity is never counted twice.
 */
export function dailyTarget(p: Profile): DailyTarget {
  const maintenance = bmr(p) * 1.2;
  const goal: Goal = p.goal === 'lose' && !canLose(p) ? 'maintain' : p.goal;
  const delta = (p.paceKgPerWeek * KCAL_PER_KG) / 7;
  const raw = goal === 'lose' ? maintenance - delta : goal === 'gain' ? maintenance + delta : maintenance;
  const floor = FLOOR_KCAL[p.sex];
  const rounded = Math.round(raw / 50) * 50;
  const target = Math.max(rounded, floor);
  return {
    target,
    low: Math.max(Math.round((target * 0.9) / 10) * 10, floor),
    high: Math.round((target * 1.1) / 10) * 10,
    floored: rounded < floor,
  };
}

/** The part of burned energy that is added back to the day. */
export function activityCredit(burnedKcal: number, creditPct: number): number {
  return Math.round((burnedKcal * creditPct) / 100);
}

export function netEnergy(eatenKcal: number, burnedKcal: number, creditPct: number): number {
  return Math.round(eatenKcal) - activityCredit(burnedKcal, creditPct);
}

export type RangeStatus = 'under' | 'in' | 'over';

export function rangeStatus(net: number, t: Pick<DailyTarget, 'low' | 'high'>): RangeStatus {
  if (net < t.low) return 'under';
  if (net > t.high) return 'over';
  return 'in';
}

export interface MacroTargets {
  protein: number;
  carbs: number;
  fat: number;
}

/** Protein from body weight (1.8 g/kg), fat 30% of the budget, carbs the rest. */
export function macroTargets(budgetKcal: number, weightKg: number): MacroTargets {
  const protein = Math.round(1.8 * weightKg);
  const fat = Math.round((0.3 * budgetKcal) / 9);
  const carbs = Math.max(0, Math.round((budgetKcal - protein * 4 - fat * 9) / 4));
  return { protein, carbs, fat };
}

const MET: Record<ActivityType, Record<Effort, number>> = {
  Run: { light: 7, moderate: 9.8, hard: 11.5 },
  Walk: { light: 2.8, moderate: 3.5, hard: 4.3 },
  Ride: { light: 4, moderate: 6.8, hard: 10 },
  Other: { light: 3, moderate: 5, hard: 8 },
};

/**
 * Estimated energy burned above rest, in kcal. With a measured distance,
 * running and walking use the per-kilometre rule; otherwise a MET table.
 * This is an estimate and the app always labels it as one.
 */
export function activityKcal(a: {
  type: ActivityType;
  effort: Effort;
  durationSec: number;
  distanceM?: number;
  weightKg: number;
}): number {
  const hours = a.durationSec / 3600;
  const km = (a.distanceM ?? 0) / 1000;
  if (km > 0 && a.type === 'Run') return Math.round(1.0 * a.weightKg * km);
  if (km > 0 && a.type === 'Walk') return Math.round(0.5 * a.weightKg * km);
  if (km > 0 && a.type === 'Ride' && hours > 0) {
    const kmh = km / hours;
    const met = kmh < 16 ? 4 : kmh < 19 ? 6.8 : kmh < 22 ? 8 : 10;
    return Math.round((met - 1) * a.weightKg * hours);
  }
  return Math.round((MET[a.type][a.effort] - 1) * a.weightKg * hours);
}

/** Hard minutes count double, as in the WHO activity guideline. */
export function activeMinutes(a: { durationSec: number; effort: Effort }): number {
  const minutes = Math.round(a.durationSec / 60);
  return a.effort === 'hard' ? minutes * 2 : minutes;
}

export interface LatLon {
  lat: number;
  lon: number;
}

export function haversineM(a: LatLon, b: LatLon): number {
  const R = 6371000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function trackDistanceM(points: LatLon[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += haversineM(points[i - 1], points[i]);
  return total;
}

/**
 * Decides whether a new GPS fix joins the track: poor fixes are dropped and
 * tiny moves are ignored so standing still does not add distance.
 */
export function acceptFix(last: LatLon | undefined, next: LatLon, accuracyM: number): boolean {
  if (accuracyM > 30) return false;
  if (!last) return true;
  return haversineM(last, next) >= Math.max(5, accuracyM / 2);
}

export function paceSecPerKm(durationSec: number, distanceM: number): number | null {
  if (distanceM < 50) return null;
  return durationSec / (distanceM / 1000);
}

// ---- dates and formatting ----

export function dateKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function addDays(key: string, n: number): string {
  const [y, m, d] = key.split('-').map(Number);
  return dateKey(new Date(y, m - 1, d + n));
}

/** The `days` date keys ending at `endKey`, oldest first. */
export function lastDays(endKey: string, days: number): string[] {
  const out: string[] = [];
  for (let i = days - 1; i >= 0; i--) out.push(addDays(endKey, -i));
  return out;
}

export interface WeightEntry {
  date: string;
  kg: number;
}

/** Mean of the readings in the 7 days ending at `endKey`; null without any. */
export function weightAverage(entries: WeightEntry[], endKey: string, days = 7): number | null {
  const keys = new Set(lastDays(endKey, days));
  const xs = entries.filter((e) => keys.has(e.date)).map((e) => e.kg);
  if (xs.length === 0) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function formatClock(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

export function formatKcal(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

/** Scales per-100 g nutrition facts to a portion in grams. */
export function scalePer100(
  per100: { kcal: number; protein: number; carbs: number; fat: number },
  grams: number,
): { kcal: number; protein: number; carbs: number; fat: number } {
  const f = grams / 100;
  const r1 = (x: number) => Math.round(x * f * 10) / 10;
  return { kcal: Math.round(per100.kcal * f), protein: r1(per100.protein), carbs: r1(per100.carbs), fat: r1(per100.fat) };
}
