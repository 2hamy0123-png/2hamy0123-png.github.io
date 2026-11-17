import { useEffect, useRef, useState } from 'react';
import { daySummary, type AppState } from './lib/store';

/**
 * Keeps this phone's card for today up to date on the team, even when the Team
 * tab is closed. Shares only whether anything was logged, whether the day is in
 * range, and active minutes. Renders nothing.
 */
export function TeamSync({ state, today }: { state: AppState; today: string }) {
  const team = state.team;
  const profile = state.profile;
  const day = team && profile ? daySummary(state, profile, today) : null;
  const logged = !!day && (day.foods.length > 0 || day.activities.length > 0);
  const inRange = logged && day?.status === 'in';
  const activeMin = day?.activeMin ?? 0;
  const last = useRef('');
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!team) {
      last.current = '';
      return;
    }
    const sig = `${team.teamId}|${today}|${logged}|${inRange}|${activeMin}`;
    if (sig === last.current) return;
    if (last.current === '' && !logged) return; // nothing to share yet
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const timer = setTimeout(async () => {
      try {
        const [{ getClient }, svc] = await Promise.all([import('./lib/firebase'), import('./lib/teamService')]);
        const client = await getClient();
        await svc.publishCard(client.db, client.uid, team, today, { logged, inRange, activeMin });
        if (!cancelled) last.current = sig;
      } catch {
        // Offline or not signed in yet: try again shortly.
        if (!cancelled) retryTimer = setTimeout(() => setRetry((n) => n + 1), 30000);
      }
    }, 1500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [team, today, logged, inRange, activeMin, retry]);

  return null;
}
