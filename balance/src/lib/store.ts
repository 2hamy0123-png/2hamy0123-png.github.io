import { get, set } from 'idb-keyval';
import {
  activeMinutes,
  activityCredit,
  dailyTarget,
  macroTargets,
  netEnergy,
  rangeStatus,
  type ActivityType,
  type DailyTarget,
  type Effort,
  type MacroTargets,
  type Profile,
  type RangeStatus,
  type WeightEntry,
} from './calc';

export type Meal = 'Breakfast' | 'Lunch' | 'Dinner' | 'Snack';
export const MEALS: Meal[] = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];

export interface FoodEntry {
  id: string;
  date: string;
  meal: Meal;
  name: string;
  amount: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  barcode?: string;
}

export interface ActivityEntry {
  id: string;
  date: string;
  type: ActivityType;
  name: string;
  durationSec: number;
  distanceM?: number;
  effort: Effort;
  kcal: number;
  track?: [number, number][];
}

export interface AppState {
  v: 1;
  profile: Profile | null;
  foods: FoodEntry[];
  activities: ActivityEntry[];
  weights: WeightEntry[];
}

export const EMPTY_STATE: AppState = { v: 1, profile: null, foods: [], activities: [], weights: [] };

const KEY = 'balance-state-v1';

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function isState(x: unknown): x is AppState {
  return !!x && typeof x === 'object' && (x as AppState).v === 1 && Array.isArray((x as AppState).foods);
}

/** Loads saved data. Falls back to localStorage where IndexedDB is unavailable. */
export async function loadState(): Promise<AppState> {
  try {
    const saved = await get(KEY);
    if (isState(saved)) return saved;
  } catch {
    // IndexedDB can be blocked (private mode); try localStorage below.
  }
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (isState(parsed)) return parsed;
    }
  } catch {
    // Nothing saved or storage blocked: start empty.
  }
  return EMPTY_STATE;
}

export async function saveState(state: AppState): Promise<void> {
  try {
    await set(KEY, state);
    return;
  } catch {
    // Fall through to localStorage.
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Storage is unavailable; the session still works in memory.
  }
}

export interface DaySummary {
  foods: FoodEntry[];
  activities: ActivityEntry[];
  eaten: number;
  protein: number;
  carbs: number;
  fat: number;
  burned: number;
  credit: number;
  net: number;
  activeMin: number;
  target: DailyTarget;
  status: RangeStatus;
  macros: MacroTargets;
}

export function daySummary(state: AppState, profile: Profile, date: string): DaySummary {
  const foods = state.foods.filter((f) => f.date === date);
  const activities = state.activities.filter((a) => a.date === date);
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  const eaten = Math.round(sum(foods.map((f) => f.kcal)));
  const burned = Math.round(sum(activities.map((a) => a.kcal)));
  const credit = activityCredit(burned, profile.creditPct);
  const net = netEnergy(eaten, burned, profile.creditPct);
  const target = dailyTarget(profile);
  return {
    foods,
    activities,
    eaten,
    protein: Math.round(sum(foods.map((f) => f.protein))),
    carbs: Math.round(sum(foods.map((f) => f.carbs))),
    fat: Math.round(sum(foods.map((f) => f.fat))),
    burned,
    credit,
    net,
    activeMin: sum(activities.map(activeMinutes)),
    target,
    status: rangeStatus(net, target),
    macros: macroTargets(target.target + credit, profile.weightKg),
  };
}

export function mealForHour(hour: number): Meal {
  if (hour < 11) return 'Breakfast';
  if (hour < 16) return 'Lunch';
  if (hour < 21) return 'Dinner';
  return 'Snack';
}

export function partOfDay(hour: number): string {
  if (hour < 12) return 'Morning';
  if (hour < 17) return 'Afternoon';
  return 'Evening';
}
