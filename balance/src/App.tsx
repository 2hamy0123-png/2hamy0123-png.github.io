import { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { addDays, dateKey, type Profile } from './lib/calc';
import { syncReminders } from './lib/native';
import { DEFAULT_REMINDERS, daySummary, loadState, newId, saveState, type AppState, type FoodEntry, type Reminders, type TeamInfo } from './lib/store';
import { Activity, type NewActivity } from './screens/Activity';
import { Food, type NewFood } from './screens/Food';
import { Progress } from './screens/Progress';
import { Settings } from './screens/Settings';
import { Setup } from './screens/Setup';
import { TeamSync } from './TeamSync';
import { Today } from './screens/Today';
import { Welcome } from './screens/Welcome';
import { Icon } from './ui';

const Team = lazy(() => import('./screens/Team').then((m) => ({ default: m.Team })));

type Tab = 'today' | 'food' | 'activity' | 'team' | 'progress';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'today', label: 'Today', icon: 'home' },
  { id: 'food', label: 'Food', icon: 'food' },
  { id: 'activity', label: 'Activity', icon: 'activity' },
  { id: 'team', label: 'Team', icon: 'team' },
  { id: 'progress', label: 'Progress', icon: 'progress' },
];

export function App() {
  const [state, setState] = useState<AppState | null>(null);
  const [tab, setTab] = useState<Tab>('today');
  const [editingProfile, setEditingProfile] = useState(false);
  const [welcomed, setWelcomed] = useState(false);
  const [intent, setIntent] = useState<null | 'scan' | 'start'>(null);
  const [today, setToday] = useState(() => dateKey(new Date()));

  useEffect(() => {
    void loadState().then(setState);
  }, []);

  useEffect(() => {
    if (state) void saveState(state);
  }, [state]);

  // Keep scheduled reminders in step with the settings and with what is logged today.
  const reminders = state?.reminders ?? DEFAULT_REMINDERS;
  const lunchLogged = !!state?.foods.some((f) => f.date === today && f.meal === 'Lunch');
  const dinnerLogged = !!state?.foods.some((f) => f.date === today && f.meal === 'Dinner');
  const hasProfile = !!state?.profile;
  useEffect(() => {
    if (!hasProfile) return;
    void syncReminders({ on: reminders.on, midday: reminders.midday, evening: reminders.evening, skipMidday: lunchLogged, skipEvening: dinnerLogged });
  }, [hasProfile, reminders.on, reminders.midday, reminders.evening, lunchLogged, dinnerLogged, today]);

  // Roll over to the new day when the app is left open past midnight.
  useEffect(() => {
    const refresh = () => setToday(dateKey(new Date()));
    const timer = setInterval(refresh, 60000);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);

  const update = useCallback((fn: (s: AppState) => AppState) => {
    setState((prev) => (prev ? fn(prev) : prev));
  }, []);

  const clearIntent = useCallback(() => setIntent(null), []);

  if (!state) return <div className="app" aria-busy="true" />;

  const withWeight = (s: AppState, kg: number): AppState => ({
    ...s,
    weights: [...s.weights.filter((w) => w.date !== today), { date: today, kg }].sort((a, b) => a.date.localeCompare(b.date)),
  });

  const saveProfile = (p: Profile) => {
    update((s) => {
      const weightChanged = !s.profile || s.profile.weightKg !== p.weightKg;
      const next = { ...s, profile: p };
      return weightChanged ? withWeight(next, p.weightKg) : next;
    });
    setEditingProfile(false);
  };

  if (!state.profile && !welcomed) {
    return (
      <div className="app">
        <Welcome onStart={() => setWelcomed(true)} />
      </div>
    );
  }

  const profile = state.profile;
  if (!profile || editingProfile) {
    return (
      <div className="app">
        <Setup
          initial={profile}
          onSave={saveProfile}
          onCancel={profile ? () => setEditingProfile(false) : undefined}
          extra={
            <Settings
              state={state}
              restoreOnly={!profile}
              onReminders={(r: Reminders) => update((s) => ({ ...s, reminders: r }))}
              onRestore={(restored) => {
                setState(restored);
                setEditingProfile(false);
                setTab('today');
              }}
            />
          }
        />
      </div>
    );
  }

  // Foods eaten before (newest first, one per name) and yesterday's log, for quick adding.
  const recent: FoodEntry[] = [];
  const seen = new Set<string>();
  for (let i = state.foods.length - 1; i >= 0 && recent.length < 12; i--) {
    const key = state.foods[i].name.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    recent.push(state.foods[i]);
  }
  const yesterday = state.foods.filter((f) => f.date === addDays(today, -1));

  const day = daySummary(state, profile, today);
  const addFood = (f: NewFood) => update((s) => ({ ...s, foods: [...s.foods, { ...f, id: newId(), date: today }] }));
  const removeFood = (id: string) => update((s) => ({ ...s, foods: s.foods.filter((f) => f.id !== id) }));
  const addActivity = (a: NewActivity) => update((s) => ({ ...s, activities: [...s.activities, { ...a, id: newId(), date: today }] }));
  const removeActivity = (id: string) => update((s) => ({ ...s, activities: s.activities.filter((a) => a.id !== id) }));
  const setTeam = (t: TeamInfo | null) =>
    update((s) => {
      const { team: _old, ...rest } = s;
      return t ? { ...rest, team: t } : rest;
    });
  const logWeight = (kg: number) => update((s) => withWeight({ ...s, profile: s.profile ? { ...s.profile, weightKg: kg } : s.profile }, kg));

  return (
    <div className="app">
      {tab === 'today' ? (
        <Today
          day={day}
          profile={profile}
          onScan={() => {
            setIntent('scan');
            setTab('food');
          }}
          onStart={() => {
            setIntent('start');
            setTab('activity');
          }}
          onProfile={() => setEditingProfile(true)}
        />
      ) : null}
      {tab === 'food' ? (
        <Food day={day} recent={recent} yesterday={yesterday} openScan={intent === 'scan'} onOpenScanHandled={clearIntent} onAdd={addFood} onRemove={removeFood} />
      ) : null}
      {tab === 'activity' ? (
        <Activity
          day={day}
          weightKg={profile.weightKg}
          openStart={intent === 'start'}
          onOpenStartHandled={clearIntent}
          onAdd={addActivity}
          onRemove={removeActivity}
        />
      ) : null}
      {tab === 'team' ? (
        <Suspense fallback={<main className="screen" aria-busy="true" />}>
          <Team team={state.team} today={today} onTeam={setTeam} />
        </Suspense>
      ) : null}
      <TeamSync state={state} today={today} />
      {tab === 'progress' ? <Progress state={state} profile={profile} today={today} onLogWeight={logWeight} /> : null}

      <nav className="nav" aria-label="Main">
        {TABS.map((t) => (
          <button key={t.id} type="button" aria-current={tab === t.id ? 'page' : undefined} onClick={() => setTab(t.id)}>
            <Icon name={t.icon} stroke={tab === t.id ? 2 : 1.8} />
            <span>{t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
