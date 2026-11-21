// Keeps older team cards on the phone, so opening the Team tab only reads the
// last few days from the server. Past days do not change, so each one is read once.
import { del, get, set } from 'idb-keyval';
import type { Firestore } from 'firebase/firestore';
import { addDays } from './calc';
import type { TeamInfo } from './store';
import type { TeamCards } from './teamLogic';
import { HISTORY_DAYS, LIVE_DAYS, fetchCards } from './teamService';

interface Cache {
  v: 1;
  teamId: string;
  /** The newest day already fetched. */
  through: string;
  cards: TeamCards;
}

const keyFor = (teamId: string) => `balance-team-history-${teamId}`;

async function read(teamId: string): Promise<Cache | null> {
  try {
    const c = (await get(keyFor(teamId))) as Cache | undefined;
    return c && c.v === 1 && c.teamId === teamId ? c : null;
  } catch {
    return null;
  }
}

/** Cards older than the live window, newest days fetched as needed. */
export async function loadHistory(db: Firestore, team: TeamInfo, today: string): Promise<TeamCards> {
  const through = addDays(today, -LIVE_DAYS - 1);
  const oldest = addDays(today, -HISTORY_DAYS);
  const cache = await read(team.teamId);
  const after = cache && cache.through >= addDays(oldest, -1) ? cache.through : addDays(oldest, -1);
  const fresh = after < through ? await fetchCards(db, team, after, through) : {};
  const cards: TeamCards = {};
  for (const [day, byUid] of Object.entries({ ...(cache?.cards ?? {}), ...fresh })) {
    if (day >= oldest && day <= through) cards[day] = byUid;
  }
  try {
    await set(keyFor(team.teamId), { v: 1, teamId: team.teamId, through: after > through ? after : through, cards } satisfies Cache);
  } catch {
    // Storage blocked: the history is simply fetched again next time.
  }
  return cards;
}

export async function clearHistory(teamId: string): Promise<void> {
  try {
    await del(keyFor(teamId));
  } catch {
    // Nothing to clear.
  }
}
