// Team operations on Firestore. Every value a team stores is encrypted on the
// phone first (see teamCrypto.ts). The database is passed in so these
// functions can be tested against the Firestore emulator.
import {
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  type Firestore,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { addDays } from './calc';
import type { TeamInfo } from './store';
import { newTeamId, newTeamKey, open, parseInvite, seal } from './teamCrypto';
import { MAX_TEAM, type DayCard, type Member, type TeamCards } from './teamLogic';

export type TeamErrorCode = 'invalid' | 'full' | 'offline' | 'removed' | 'already' | 'failed';

export class TeamError extends Error {
  constructor(
    public code: TeamErrorCode,
    message: string,
  ) {
    super(message);
  }
}

function fsCode(e: unknown): string {
  return typeof e === 'object' && e !== null && 'code' in e ? String((e as { code: unknown }).code) : '';
}

function failed(e: unknown): TeamError {
  if (e instanceof TeamError) return e;
  if (fsCode(e) === 'unavailable' || fsCode(e) === 'deadline-exceeded') return new TeamError('offline', 'Could not reach the team. Check your connection and try again.');
  return new TeamError('failed', 'Something went wrong. Please try again.');
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

export interface MemberProfile {
  name: string;
  joined: string;
  breakUntil?: string;
}

export interface Post {
  id: string;
  uid: string;
  name: string;
  text: string;
  at: number;
}

export interface TeamSnapshot {
  memberUids: string[];
  members: Member[];
  cards: TeamCards;
  posts: Post[];
  /** Uids that nudged me today. */
  nudgedBy: string[];
}

const teamRef = (db: Firestore, teamId: string) => doc(db, 'teams', teamId);

export async function writeProfile(db: Firestore, team: Pick<TeamInfo, 'teamId' | 'key'>, uid: string, profile: MemberProfile): Promise<void> {
  const clean: MemberProfile = { name: profile.name, joined: profile.joined };
  if (profile.breakUntil) clean.breakUntil = profile.breakUntil;
  try {
    await setDoc(doc(db, 'teams', team.teamId, 'members', uid), await seal(team.key, clean));
  } catch (e) {
    throw failed(e);
  }
}

export async function createTeam(db: Firestore, uid: string, name: string, today: string): Promise<TeamInfo> {
  const teamId = newTeamId();
  const key = newTeamKey();
  try {
    await setDoc(teamRef(db, teamId), { memberUids: [uid], joinHash: await sha256Hex(key), createdAt: Timestamp.now() });
  } catch (e) {
    throw failed(e);
  }
  await writeProfile(db, { teamId, key }, uid, { name, joined: today });
  return { teamId, key, myName: name };
}

/** Joins with a pasted invite. Also works again for someone who is already a member. */
export async function joinTeam(db: Firestore, uid: string, inviteText: string, name: string, today: string): Promise<TeamInfo> {
  const invite = parseInvite(inviteText);
  if (!invite) throw new TeamError('invalid', 'That invite code is not valid. Check that you copied all of it.');
  const info: TeamInfo = { teamId: invite.teamId, key: invite.key, myName: name };

  try {
    const existing = await getDoc(teamRef(db, invite.teamId));
    if (existing.exists() && (existing.data().memberUids as string[]).includes(uid)) {
      await writeProfile(db, info, uid, { name, joined: today });
      return info;
    }
  } catch (e) {
    if (fsCode(e) !== 'permission-denied') throw failed(e);
  }

  const hash = await sha256Hex(invite.key);
  let proofRefused = false;
  try {
    await setDoc(doc(db, 'teams', invite.teamId, 'joins', `${hash}_${uid}`), { uid });
  } catch (e) {
    if (fsCode(e) !== 'permission-denied') throw failed(e);
    proofRefused = true; // Wrong invite, no such team, or a proof from an earlier attempt.
  }
  try {
    await updateDoc(teamRef(db, invite.teamId), { memberUids: arrayUnion(uid) });
  } catch (e) {
    if (fsCode(e) !== 'permission-denied') throw failed(e);
    throw proofRefused
      ? new TeamError('invalid', 'That invite does not match a team. Ask for a new code.')
      : new TeamError('full', `This team already has ${MAX_TEAM} members.`);
  }
  await writeProfile(db, info, uid, { name, joined: today });
  return info;
}

async function currentMembers(db: Firestore, teamId: string): Promise<string[]> {
  const snap = await getDoc(teamRef(db, teamId));
  if (!snap.exists()) throw new TeamError('removed', 'This team no longer exists.');
  return snap.data().memberUids as string[];
}

/** Removes `target` (yourself to leave, or another member, for example a lost phone). */
export async function removeFromTeam(db: Firestore, teamId: string, target: string): Promise<void> {
  try {
    const members = await currentMembers(db, teamId);
    if (!members.includes(target)) return;
    await deleteDoc(doc(db, 'teams', teamId, 'members', target)).catch(() => undefined);
    await updateDoc(teamRef(db, teamId), { memberUids: members.filter((m) => m !== target) });
  } catch (e) {
    throw failed(e);
  }
}

export async function publishCard(db: Firestore, uid: string, team: TeamInfo, date: string, card: DayCard): Promise<void> {
  try {
    await setDoc(doc(db, 'teams', team.teamId, 'days', `${date}_${uid}`), { ...(await seal(team.key, card)), date, uid });
  } catch (e) {
    throw failed(e);
  }
}

export const MAX_POST = 280;

export async function sendPost(db: Firestore, uid: string, team: TeamInfo, text: string): Promise<void> {
  const body = text.trim().slice(0, MAX_POST);
  if (!body) return;
  try {
    const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    await setDoc(doc(db, 'teams', team.teamId, 'posts', id), { ...(await seal(team.key, { text: body })), uid, at: Timestamp.now() });
  } catch (e) {
    throw failed(e);
  }
}

export async function deletePost(db: Firestore, teamId: string, postId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'teams', teamId, 'posts', postId));
  } catch (e) {
    throw failed(e);
  }
}

/** One nudge per person per day; a second one is refused by the rules. */
export async function sendNudge(db: Firestore, uid: string, teamId: string, to: string, date: string): Promise<void> {
  try {
    await setDoc(doc(db, 'teams', teamId, 'nudges', `${date}_${uid}_${to}`), { date, from: uid, to });
  } catch (e) {
    if (fsCode(e) === 'permission-denied') throw new TeamError('already', 'You already nudged them today.');
    throw failed(e);
  }
}

/** Days of cards kept live (this week plus today). Older days come from fetchCards and a local cache. */
export const LIVE_DAYS = 7;
/** How far back the team history (and so the longest streak shown) reaches. */
export const HISTORY_DAYS = 120;
export const POST_LIMIT = 20;

interface Sealed {
  iv: string;
  ct: string;
}

/**
 * Reads the cards dated after `after` up to and including `through`, once.
 * Used for days older than the live window, which no longer change.
 */
export async function fetchCards(db: Firestore, team: TeamInfo, after: string, through: string): Promise<TeamCards> {
  if (after >= through) return {};
  try {
    const snap = await getDocs(query(collection(db, 'teams', team.teamId, 'days'), where('date', '>', after), where('date', '<=', through)));
    const out: TeamCards = {};
    for (const o of await openAll<DayCard>(team.key, snap.docs)) {
      (out[String(o.data.date)] ??= {})[String(o.data.uid)] = o.value;
    }
    return out;
  } catch (e) {
    throw failed(e);
  }
}

/** Leaves a team: deletes your own messages first, then removes you. */
export async function leaveTeam(db: Firestore, uid: string, teamId: string): Promise<void> {
  try {
    const mine = await getDocs(query(collection(db, 'teams', teamId, 'posts'), where('uid', '==', uid)));
    await Promise.all(mine.docs.map((d) => deleteDoc(d.ref)));
  } catch (e) {
    throw failed(e);
  }
  await removeFromTeam(db, teamId, uid);
}

interface Opened<T> {
  id: string;
  data: Record<string, unknown>;
  value: T;
}

async function openAll<T>(key: string, docs: QueryDocumentSnapshot[]): Promise<Opened<T>[]> {
  const results = await Promise.all(
    docs.map(async (d): Promise<Opened<T> | null> => {
      const data = d.data();
      const value = await open<T>(key, { iv: String(data.iv), ct: String(data.ct) } satisfies Sealed);
      return value === null ? null : { id: d.id, data, value: value as T };
    }),
  );
  return results.filter((x): x is Opened<T> => x !== null);
}

/**
 * Listens to the whole team. Calls `onSnap` with a decrypted snapshot whenever
 * anything changes, and `onError` once if access is lost. Returns a function
 * that stops listening.
 */
export function subscribeTeam(
  db: Firestore,
  uid: string,
  team: TeamInfo,
  today: string,
  onSnap: (s: TeamSnapshot) => void,
  onError: (e: TeamError) => void,
): () => void {
  let alive = true;
  let memberUids: string[] | null = null;
  let profiles = new Map<string, MemberProfile>();
  let cards: TeamCards = {};
  let posts: Post[] = [];
  let nudgedBy: string[] = [];
  const seq = { members: 0, days: 0, posts: 0 };

  const emit = () => {
    if (!alive || memberUids === null) return;
    const members: Member[] = memberUids.map((u) => {
      const p = profiles.get(u);
      return p ? { uid: u, name: p.name, joined: p.joined, breakUntil: p.breakUntil } : { uid: u, name: 'New member', joined: today };
    });
    const names = new Map(members.map((m) => [m.uid, m.name]));
    onSnap({
      memberUids,
      members,
      cards,
      posts: posts.map((p) => ({ ...p, name: names.get(p.uid) ?? 'Former member' })),
      nudgedBy,
    });
  };

  let errored = false;
  const fail = (e: unknown) => {
    if (!alive || errored) return;
    errored = true;
    onError(fsCode(e) === 'permission-denied' ? new TeamError('removed', 'You are not a member of this team on this phone.') : failed(e));
  };

  const base = ['teams', team.teamId] as const;
  const stops = [
    onSnapshot(
      teamRef(db, team.teamId),
      (snap) => {
        if (!snap.exists()) return fail({ code: 'permission-denied' });
        memberUids = snap.data().memberUids as string[];
        emit();
      },
      fail,
    ),
    onSnapshot(
      collection(db, ...base, 'members'),
      async (snap) => {
        const n = ++seq.members;
        const opened = await openAll<MemberProfile>(team.key, snap.docs);
        if (n !== seq.members) return;
        profiles = new Map(opened.map((o) => [o.id, o.value]));
        emit();
      },
      fail,
    ),
    onSnapshot(
      query(collection(db, ...base, 'days'), where('date', '>=', addDays(today, -LIVE_DAYS))),
      async (snap) => {
        const n = ++seq.days;
        const opened = await openAll<DayCard>(team.key, snap.docs);
        if (n !== seq.days) return;
        const next: TeamCards = {};
        for (const o of opened) {
          const date = String(o.data.date);
          const owner = String(o.data.uid);
          (next[date] ??= {})[owner] = o.value;
        }
        cards = next;
        emit();
      },
      fail,
    ),
    onSnapshot(
      query(collection(db, ...base, 'posts'), orderBy('at', 'desc'), limit(POST_LIMIT)),
      async (snap) => {
        const n = ++seq.posts;
        const opened = await openAll<{ text: string }>(team.key, snap.docs);
        if (n !== seq.posts) return;
        posts = opened.map((o) => ({ id: o.id, uid: String(o.data.uid), name: '', text: String(o.value.text ?? ''), at: (o.data.at as Timestamp).toMillis() }));
        emit();
      },
      fail,
    ),
    onSnapshot(
      query(collection(db, ...base, 'nudges'), where('date', '==', today)),
      (snap) => {
        nudgedBy = snap.docs.filter((d) => d.data().to === uid).map((d) => String(d.data().from));
        emit();
      },
      fail,
    ),
  ];

  return () => {
    alive = false;
    stops.forEach((stop) => stop());
  };
}
