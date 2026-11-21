import { describe, expect, it } from 'vitest';
import {
  acceptFix,
  activeMinutes,
  activityCredit,
  activityKcal,
  addDays,
  bmr,
  canLose,
  dailyTarget,
  formatClock,
  haversineM,
  isAdult,
  lastDays,
  macroTargets,
  netEnergy,
  paceSecPerKm,
  rangeStatus,
  scalePer100,
  trackDistanceM,
  weightAverage,
  type Profile,
} from './calc';

const man: Profile = { sex: 'male', age: 28, heightCm: 178, weightKg: 74, goal: 'lose', paceKgPerWeek: 0.25, creditPct: 50 };

describe('daily target', () => {
  it('uses Mifflin-St Jeor', () => {
    expect(bmr(man)).toBeCloseTo(1717.5, 1);
    expect(bmr({ ...man, sex: 'female' })).toBeCloseTo(1551.5, 1);
  });

  it('matches the prototype profile: 1,800 with a 1,620 to 1,980 range', () => {
    expect(dailyTarget(man)).toEqual({ target: 1800, low: 1620, high: 1980, floored: false });
  });

  it('never goes below the floor', () => {
    const small: Profile = { sex: 'female', age: 45, heightCm: 155, weightKg: 52, goal: 'lose', paceKgPerWeek: 0.5, creditPct: 50 };
    const t = dailyTarget(small);
    expect(t.target).toBe(1200);
    expect(t.low).toBe(1200);
    expect(t.floored).toBe(true);
  });

  it('does not create a deficit for someone underweight', () => {
    const thin: Profile = { ...man, weightKg: 55 };
    expect(canLose(thin)).toBe(false);
    expect(dailyTarget(thin).target).toBe(dailyTarget({ ...thin, goal: 'maintain' }).target);
  });

  it('adds energy for a gain goal', () => {
    expect(dailyTarget({ ...man, goal: 'gain' }).target).toBeGreaterThan(dailyTarget({ ...man, goal: 'maintain' }).target);
  });

  it('is for adults only', () => {
    expect(isAdult(17)).toBe(false);
    expect(isAdult(18)).toBe(true);
  });
});

describe('energy balance', () => {
  it('credits half of the burn by default', () => {
    expect(activityCredit(430, 50)).toBe(215);
    expect(netEnergy(1850, 430, 50)).toBe(1635);
  });

  it('classifies the day against the range', () => {
    const t = dailyTarget(man);
    expect(rangeStatus(900, t)).toBe('under');
    expect(rangeStatus(1635, t)).toBe('in');
    expect(rangeStatus(2100, t)).toBe('over');
  });

  it('sets macros from body weight and the budget', () => {
    expect(macroTargets(2015, 74)).toEqual({ protein: 133, carbs: 220, fat: 67 });
  });
});

describe('activity', () => {
  it('estimates a run from distance', () => {
    expect(activityKcal({ type: 'Run', effort: 'moderate', durationSec: 2196, distanceM: 6100, weightKg: 74 })).toBe(451);
  });

  it('falls back to MET without distance', () => {
    expect(activityKcal({ type: 'Other', effort: 'moderate', durationSec: 3600, weightKg: 70 })).toBe(280);
  });

  it('counts hard minutes double', () => {
    expect(activeMinutes({ durationSec: 1800, effort: 'moderate' })).toBe(30);
    expect(activeMinutes({ durationSec: 1800, effort: 'hard' })).toBe(60);
  });

  it('measures distance along a track', () => {
    const a = { lat: 30.0444, lon: 31.2357 };
    const b = { lat: 30.0534, lon: 31.2357 };
    expect(haversineM(a, b)).toBeGreaterThan(990);
    expect(haversineM(a, b)).toBeLessThan(1010);
    expect(trackDistanceM([a, b, a])).toBeCloseTo(2 * haversineM(a, b), 5);
  });

  it('drops poor or stationary GPS fixes', () => {
    const a = { lat: 30.0444, lon: 31.2357 };
    expect(acceptFix(undefined, a, 10)).toBe(true);
    expect(acceptFix(undefined, a, 80)).toBe(false);
    expect(acceptFix(a, { lat: 30.04441, lon: 31.2357 }, 10)).toBe(false);
    expect(acceptFix(a, { lat: 30.0446, lon: 31.2357 }, 10)).toBe(true);
  });

  it('computes pace', () => {
    expect(paceSecPerKm(2196, 6100)).toBeCloseTo(360, 0);
    expect(paceSecPerKm(10, 20)).toBeNull();
    expect(formatClock(2196)).toBe('36:36');
    expect(formatClock(3725)).toBe('1:02:05');
  });
});

describe('dates and weight', () => {
  it('walks across month ends', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(lastDays('2026-01-02', 3)).toEqual(['2025-12-31', '2026-01-01', '2026-01-02']);
  });

  it('averages the last 7 days only', () => {
    const entries = [
      { date: '2026-11-01', kg: 80 },
      { date: '2026-11-10', kg: 74 },
      { date: '2026-11-16', kg: 73 },
    ];
    expect(weightAverage(entries, '2026-11-16')).toBeCloseTo(73.5, 5);
    expect(weightAverage([], '2026-11-16')).toBeNull();
  });
});

describe('food', () => {
  it('scales per-100 g facts to a portion', () => {
    expect(scalePer100({ kcal: 539, protein: 6.3, carbs: 57.5, fat: 30.9 }, 30)).toEqual({ kcal: 162, protein: 1.9, carbs: 17.3, fat: 9.3 });
  });
});
