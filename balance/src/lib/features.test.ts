import { describe, expect, it } from 'vitest';
import { BackupError, backupFileName, describeBackup, parseBackup, serializeBackup } from './backup';
import { COMMON_FOODS, normalize, searchFoods } from './foods';
import { parseSearch } from './off';
import { allReminderIds, planReminders } from './reminders';
import { EMPTY_STATE, type AppState } from './store';

const sample: AppState = {
  v: 1,
  profile: { sex: 'male', age: 28, heightCm: 178, weightKg: 74, goal: 'lose', paceKgPerWeek: 0.25, creditPct: 50 },
  foods: [{ id: 'f1', date: '2026-11-16', meal: 'Lunch', name: 'Koshari', amount: '1 plate', kcal: 525, protein: 16, carbs: 91, fat: 10.5 }],
  activities: [
    { id: 'a1', date: '2026-11-16', type: 'Run', name: 'Morning run', durationSec: 2196, distanceM: 6100, effort: 'moderate', kcal: 451, track: [[30.04, 31.23], [30.05, 31.24]] },
  ],
  weights: [{ date: '2026-11-16', kg: 73.6 }],
  reminders: { on: true, midday: '13:30', evening: '20:30' },
};

describe('backup', () => {
  it('round-trips everything', () => {
    const text = serializeBackup(sample, new Date('2026-11-17T10:00:00Z'));
    expect(parseBackup(text)).toEqual(sample);
    expect(backupFileName('2026-11-17')).toBe('balance-backup-2026-11-17.json');
  });

  it('accepts an empty profile for a fresh phone', () => {
    expect(parseBackup(serializeBackup(EMPTY_STATE)).profile).toBeNull();
  });

  it('rejects files that are not backups', () => {
    expect(() => parseBackup('not json')).toThrow(BackupError);
    expect(() => parseBackup('{"app":"other"}')).toThrow('not a Balance backup');
    expect(() => parseBackup(JSON.stringify({ app: 'balance', format: 2, data: {} }))).toThrow('newer version');
  });

  it('rejects damaged data instead of loading it', () => {
    const bad = JSON.parse(serializeBackup(sample));
    bad.data.foods[0].kcal = -5;
    expect(() => parseBackup(JSON.stringify(bad))).toThrow('energy value');
    const badDate = JSON.parse(serializeBackup(sample));
    badDate.data.activities[0].date = 'yesterday';
    expect(() => parseBackup(JSON.stringify(badDate))).toThrow('date');
    const minor = JSON.parse(serializeBackup(sample));
    minor.data.profile.age = 15;
    expect(() => parseBackup(JSON.stringify(minor))).toThrow('age');
  });

  it('drops unknown fields', () => {
    const extra = JSON.parse(serializeBackup(sample));
    extra.data.foods[0].evil = '<script>';
    expect(parseBackup(JSON.stringify(extra)).foods[0]).not.toHaveProperty('evil');
  });

  it('describes what a file holds', () => {
    expect(describeBackup(sample)).toBe('1 foods, 1 activities and 1 weights over 1 days');
  });
});

describe('common foods', () => {
  it('finds foods by English or Arabic name', () => {
    expect(searchFoods('kosh')[0].name).toBe('Koshari');
    expect(searchFoods('كشري')[0].name).toBe('Koshari');
    expect(searchFoods('فول')[0].name).toBe('Ful medames');
    expect(searchFoods('rice').length).toBeGreaterThanOrEqual(2);
    expect(searchFoods('zzzz')).toEqual([]);
    expect(searchFoods('   ')).toEqual([]);
  });

  it('treats Arabic letter variants as the same', () => {
    expect(normalize('أرز')).toBe(normalize('ارز'));
    expect(searchFoods('رز').some((x) => x.name === 'White rice, cooked')).toBe(true);
  });

  it('has energy values that agree with their macros', () => {
    for (const food of COMMON_FOODS) {
      const { kcal, protein, carbs, fat } = food.per100;
      const fromMacros = 4 * protein + 4 * carbs + 9 * fat;
      const tolerance = Math.max(0.15 * kcal, 8);
      expect(Math.abs(fromMacros - kcal), `${food.name}: ${kcal} kcal vs ${fromMacros} from macros`).toBeLessThanOrEqual(tolerance);
      expect(food.servingG).toBeGreaterThan(0);
    }
  });

  it('has no duplicate names', () => {
    const names = COMMON_FOODS.map((x) => x.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('name search results', () => {
  it('keeps only complete, named products', () => {
    const body = {
      products: [
        { code: '111', product_name: 'Oat drink', brands: 'Brand', nutriments: { 'energy-kcal_100g': 46, proteins_100g: 1, carbohydrates_100g: 7, fat_100g: 1.5 } },
        { code: '222', product_name: 'No energy', nutriments: {} },
        { code: '333', nutriments: { 'energy-kcal_100g': 100 } },
        { code: '444', product_name: 'In kJ only', nutriments: { energy_100g: 418.4 } },
      ],
    };
    const out = parseSearch(body);
    expect(out.map((p) => p.name)).toEqual(['Oat drink', 'In kJ only']);
    expect(out[1].per100.kcal).toBe(100);
    expect(parseSearch(null)).toEqual([]);
    expect(parseSearch({ products: 'x' })).toEqual([]);
  });
});

describe('reminders', () => {
  const plan = { on: true, midday: '13:30', evening: '20:30', skipMidday: false, skipEvening: false };

  it('plans two reminders a day for a week from the next future time', () => {
    const now = new Date(2026, 10, 17, 9, 0);
    const list = planReminders(plan, now);
    expect(list).toHaveLength(14);
    expect(list[0].at).toEqual(new Date(2026, 10, 17, 13, 30));
    expect(new Set(list.map((r) => r.id)).size).toBe(14);
    expect(list.every((r) => allReminderIds().includes(r.id))).toBe(true);
  });

  it('skips times that have passed', () => {
    const now = new Date(2026, 10, 17, 14, 0);
    const list = planReminders(plan, now);
    expect(list).toHaveLength(13);
    expect(list[0].at).toEqual(new Date(2026, 10, 17, 20, 30));
  });

  it('skips today only when the meal is already logged', () => {
    const now = new Date(2026, 10, 17, 9, 0);
    const list = planReminders({ ...plan, skipMidday: true, skipEvening: true }, now);
    expect(list).toHaveLength(12);
    expect(list[0].at).toEqual(new Date(2026, 10, 18, 13, 30));
  });

  it('plans nothing when off or when a time is invalid', () => {
    const now = new Date(2026, 10, 17, 9, 0);
    expect(planReminders({ ...plan, on: false }, now)).toEqual([]);
    expect(planReminders({ ...plan, midday: 'noon' }, now)).toHaveLength(7);
  });
});
