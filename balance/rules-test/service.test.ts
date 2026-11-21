import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, getDocs } from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { TeamInfo } from '../src/lib/store';
import { addDays } from '../src/lib/calc';
import {
  HISTORY_DAYS,
  LIVE_DAYS,
  TeamError,
  createTeam,
  deletePost,
  fetchCards,
  leaveTeam,
  joinTeam,
  publishCard,
  removeFromTeam,
  sendNudge,
  sendPost,
  subscribeTeam,
  writeProfile,
  type TeamSnapshot,
} from '../src/lib/teamService';
import { makeInvite, newTeamKey } from '../src/lib/teamCrypto';
import { dayState, streak, weeklyGoal } from '../src/lib/teamLogic';

const TODAY = '2026-11-17'; // a Tuesday

let env: RulesTestEnvironment;
beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-balance',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  });
});
afterAll(() => env.cleanup());
beforeEach(() => env.clearFirestore());

const as = (uid: string) => env.authenticatedContext(uid).firestore();

function until(uid: string, team: TeamInfo, pred: (s: TeamSnapshot) => boolean, ms = 8000): Promise<TeamSnapshot> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      stop();
      reject(new Error('timed out waiting for the team snapshot'));
    }, ms);
    const stop = subscribeTeam(
      as(uid),
      uid,
      team,
      TODAY,
      (s) => {
        if (!pred(s)) return;
        clearTimeout(timer);
        stop();
        resolve(s);
      },
      (e) => {
        clearTimeout(timer);
        stop();
        reject(e);
      },
    );
  });
}

async function expectCode(p: Promise<unknown>, code: string) {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(TeamError);
  expect((err as TeamError).code).toBe(code);
}

/** A team led by u1 with Sara, plus a joiner function. */
async function startTeam() {
  const team = await createTeam(as('u1'), 'u1', 'Sara', TODAY);
  const invite = makeInvite(team);
  const join = (uid: string, name: string) => joinTeam(as(uid), uid, invite, name, TODAY);
  return { team, invite, join };
}

describe('team service', () => {
  it('creates a team, lets another person join, and shares decrypted data', async () => {
    const { team, join } = await startTeam();
    const omar = await join('u2', 'Omar');
    expect(omar.teamId).toBe(team.teamId);

    await publishCard(as('u1'), 'u1', team, TODAY, { logged: true, inRange: true, activeMin: 30 });
    await publishCard(as('u2'), 'u2', omar, TODAY, { logged: true, inRange: false, activeMin: 45 });
    await sendPost(as('u2'), 'u2', omar, 'Great run! 💪 كمّل');

    const snap = await until('u1', team, (s) => s.members.length === 2 && s.posts.length === 1 && Object.keys(s.cards[TODAY] ?? {}).length === 2);
    expect(snap.members.map((m) => m.name).sort()).toEqual(['Omar', 'Sara']);
    expect(snap.cards[TODAY]?.u2).toEqual({ logged: true, inRange: false, activeMin: 45 });
    expect(snap.posts[0]).toMatchObject({ uid: 'u2', name: 'Omar', text: 'Great run! 💪 كمّل' });

    // The rules logic works on real data: goal, day state and streak.
    expect(weeklyGoal(snap.cards, snap.members, TODAY)).toEqual({ done: 75, goal: 300, daysLeft: 5 });
    expect(dayState(snap.cards, snap.members, TODAY, TODAY).state).toBe('complete');
    expect(streak(snap.cards, snap.members, TODAY)).toBe(1);
  });

  it('stores only ciphertext on the server', async () => {
    const { team, join } = await startTeam();
    const omar = await join('u2', 'Omar');
    await publishCard(as('u2'), 'u2', omar, TODAY, { logged: true, inRange: true, activeMin: 777 });
    await sendPost(as('u2'), 'u2', omar, 'secret plan');
    const dump: string[] = [];
    await env.withSecurityRulesDisabled(async (ctx) => {
      for (const sub of ['members', 'days', 'posts']) {
        const snap = await getDocs(collection(ctx.firestore(), 'teams', team.teamId, sub));
        snap.forEach((d) => dump.push(JSON.stringify(d.data())));
      }
    });
    const all = dump.join('\n');
    expect(dump.length).toBeGreaterThanOrEqual(4);
    for (const secret of ['Sara', 'Omar', 'secret plan', '777', team.key]) expect(all).not.toContain(secret);
  });

  it('refuses a wrong key, a missing team and a malformed code', async () => {
    const { team } = await startTeam();
    await expectCode(joinTeam(as('u3'), 'u3', makeInvite({ teamId: team.teamId, key: newTeamKey() }), 'X', TODAY), 'invalid');
    await expectCode(joinTeam(as('u3'), 'u3', makeInvite({ teamId: 'abcdefghjkmn', key: newTeamKey() }), 'X', TODAY), 'invalid');
    await expectCode(joinTeam(as('u3'), 'u3', 'not an invite', 'X', TODAY), 'invalid');
  });

  it('stops at five members', async () => {
    const { join } = await startTeam();
    for (const [uid, name] of [['u2', 'B'], ['u3', 'C'], ['u4', 'D'], ['u5', 'E']]) await join(uid, name);
    await expectCode(join('u6', 'F'), 'full');
  });

  it('lets a member rejoin with the same invite without taking a second place', async () => {
    const { team, join } = await startTeam();
    await join('u2', 'Omar');
    await join('u2', 'Omar again');
    const snap = await until('u1', team, (s) => s.members.find((m) => m.uid === 'u2')?.name === 'Omar again');
    expect(snap.memberUids).toEqual(['u1', 'u2']);
  });

  it('allows one nudge per person per day and shows it to the receiver', async () => {
    const { team, join } = await startTeam();
    const omar = await join('u2', 'Omar');
    await sendNudge(as('u1'), 'u1', team.teamId, 'u2', TODAY);
    await expectCode(sendNudge(as('u1'), 'u1', team.teamId, 'u2', TODAY), 'already');
    const snap = await until('u2', omar, (s) => s.nudgedBy.length === 1);
    expect(snap.nudgedBy).toEqual(['u1']);
  });

  it('shares a break so the streak is not broken', async () => {
    const { team, join } = await startTeam();
    const omar = await join('u2', 'Omar');
    await writeProfile(as('u2'), omar, 'u2', { name: 'Omar', joined: '2026-11-15', breakUntil: '2026-11-18' });
    await writeProfile(as('u1'), team, 'u1', { name: 'Sara', joined: '2026-11-15' });
    await publishCard(as('u1'), 'u1', team, TODAY, { logged: true, inRange: true, activeMin: 0 });
    const snap = await until('u1', team, (s) => s.members.some((m) => m.breakUntil === '2026-11-18') && !!s.cards[TODAY]?.u1);
    expect(dayState(snap.cards, snap.members, TODAY, TODAY).state).toBe('complete');
  });

  it('deletes only your own posts', async () => {
    const { team, join } = await startTeam();
    const omar = await join('u2', 'Omar');
    await sendPost(as('u2'), 'u2', omar, 'hello');
    const snap = await until('u1', team, (s) => s.posts.length === 1);
    await expect(deletePost(as('u1'), team.teamId, snap.posts[0].id)).rejects.toBeInstanceOf(TeamError);
    await deletePost(as('u2'), team.teamId, snap.posts[0].id);
    await until('u1', team, (s) => s.posts.length === 0);
  });

  it('removes people who leave or are removed, and tells them', async () => {
    const { team, join } = await startTeam();
    const omar = await join('u2', 'Omar');
    await join('u3', 'Lina');
    await removeFromTeam(as('u2'), team.teamId, 'u2'); // leave
    await removeFromTeam(as('u1'), team.teamId, 'u3'); // remove another
    const snap = await until('u1', team, (s) => s.memberUids.length === 1);
    expect(snap.memberUids).toEqual(['u1']);
    await expect(until('u2', omar, () => false)).rejects.toMatchObject({ code: 'removed' });
  });

  it('keeps only the last week live and reads older days once', async () => {
    const { team, join } = await startTeam();
    await join('u2', 'Omar');
    const old = addDays(TODAY, -20);
    const recent = addDays(TODAY, -2);
    await publishCard(as('u1'), 'u1', team, old, { logged: true, inRange: true, activeMin: 10 });
    await publishCard(as('u1'), 'u1', team, recent, { logged: true, inRange: false, activeMin: 20 });
    const live = await until('u1', team, (s) => !!s.cards[recent]?.u1);
    expect(live.cards[old]).toBeUndefined();

    const history = await fetchCards(as('u2'), team, addDays(TODAY, -HISTORY_DAYS - 1), addDays(TODAY, -LIVE_DAYS - 1));
    expect(history[old]?.u1).toEqual({ logged: true, inRange: true, activeMin: 10 });
    expect(history[recent]).toBeUndefined();
    expect(await fetchCards(as('u2'), team, addDays(TODAY, -5), addDays(TODAY, -6))).toEqual({});
    await expect(fetchCards(as('stranger'), team, addDays(TODAY, -HISTORY_DAYS), TODAY)).rejects.toBeInstanceOf(TeamError);
  });

  it('deletes your messages when you leave, and only yours', async () => {
    const { team, join } = await startTeam();
    const omar = await join('u2', 'Omar');
    await sendPost(as('u2'), 'u2', omar, 'bye for now');
    await sendPost(as('u1'), 'u1', team, 'stays here');
    await until('u1', team, (s) => s.posts.length === 2);
    await leaveTeam(as('u2'), 'u2', team.teamId);
    const snap = await until('u1', team, (s) => s.memberUids.length === 1 && s.posts.length === 1);
    expect(snap.posts[0].text).toBe('stays here');
  });

  it('keeps outsiders out of the data', async () => {
    const { team } = await startTeam();
    await expect(until('stranger', team, () => false)).rejects.toMatchObject({ code: 'removed' });
  });
});
