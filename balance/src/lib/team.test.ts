import { describe, expect, it } from 'vitest';
import { fromB64Url, makeInvite, newTeamId, newTeamKey, open, parseInvite, seal, toB64Url } from './teamCrypto';
import { breakEnd, canJoin, canNudge, cleanName, dayState, onBreak, streak, weekStart, weeklyGoal, type Member, type TeamCards } from './teamLogic';

describe('team crypto', () => {
  it('round-trips bytes through base64url', () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 251, 252, 253, 254, 255]);
    expect(fromB64Url(toB64Url(bytes))).toEqual(bytes);
    expect(toB64Url(bytes)).not.toMatch(/[+/=]/);
  });

  it('seals and opens a value with the same key', async () => {
    const key = newTeamKey();
    const sealed = await seal(key, { logged: true, text: 'مرحبا 👋' });
    expect(sealed.ct).not.toContain('logged');
    expect(await open(key, sealed)).toEqual({ logged: true, text: 'مرحبا 👋' });
  });

  it('cannot be opened with another key or after tampering', async () => {
    const sealed = await seal(newTeamKey(), { secret: 1 });
    expect(await open(newTeamKey(), sealed)).toBeNull();
    const flipped = { ...sealed, ct: (sealed.ct[0] === 'A' ? 'B' : 'A') + sealed.ct.slice(1) };
    expect(await open(newTeamKey(), flipped)).toBeNull();
  });

  it('never repeats a nonce for the same plaintext', async () => {
    const key = newTeamKey();
    const a = await seal(key, 1);
    const b = await seal(key, 1);
    expect(a.iv).not.toBe(b.iv);
    expect(a.ct).not.toBe(b.ct);
  });

  it('makes and parses invites', () => {
    const invite = { teamId: newTeamId(), key: newTeamKey() };
    const text = makeInvite(invite);
    expect(parseInvite(text)).toEqual(invite);
    expect(parseInvite(`  ${text.slice(0, 8)}\n${text.slice(8)} `)).toEqual(invite);
  });

  it('rejects malformed invites', () => {
    expect(parseInvite('')).toBeNull();
    expect(parseInvite('abc.def')).toBeNull();
    expect(parseInvite('a.b.c')).toBeNull();
    const id = newTeamId();
    expect(parseInvite(`${id}.short`)).toBeNull();
    expect(parseInvite(`${id.toUpperCase()}.${newTeamKey()}`)).toBeNull();
  });
});

// 2026-11-16 is a Monday.
const mk = (uid: string, extra: Partial<Member> = {}): Member => ({ uid, name: uid, joined: '2026-11-01', ...extra });
const logged = (activeMin = 0) => ({ logged: true, inRange: true, activeMin });
const everyone = (uids: string[], activeMin = 0) => Object.fromEntries(uids.map((u) => [u, logged(activeMin)]));

describe('weeks and goals', () => {
  it('finds the Monday of a week', () => {
    expect(weekStart('2026-11-16')).toBe('2026-11-16');
    expect(weekStart('2026-11-19')).toBe('2026-11-16');
    expect(weekStart('2026-11-22')).toBe('2026-11-16');
    expect(weekStart('2026-11-23')).toBe('2026-11-23');
  });

  it('sums active minutes for this week only', () => {
    const members = [mk('a'), mk('b'), mk('c')];
    const cards: TeamCards = {
      '2026-11-15': everyone(['a', 'b', 'c'], 100), // last Sunday, not counted
      '2026-11-16': { a: logged(30), b: logged(40) },
      '2026-11-18': { a: logged(20), c: logged(10) },
    };
    expect(weeklyGoal(cards, members, '2026-11-18')).toEqual({ done: 100, goal: 450, daysLeft: 4 });
  });

  it('ignores minutes from people who left', () => {
    const cards: TeamCards = { '2026-11-16': { a: logged(30), gone: logged(500) } };
    expect(weeklyGoal(cards, [mk('a')], '2026-11-16').done).toBe(30);
  });
});

describe('streak', () => {
  const members = [mk('a'), mk('b'), mk('c')];
  const ids = ['a', 'b', 'c'];

  it('counts consecutive complete days including today', () => {
    const cards: TeamCards = { '2026-11-14': everyone(ids), '2026-11-15': everyone(ids), '2026-11-16': everyone(ids) };
    // Days 1 to 13 were missed by everyone, so the streak starts on the 14th.
    expect(streak(cards, members, '2026-11-16')).toBe(3);
  });

  it('keeps the streak while today is still waiting', () => {
    const cards: TeamCards = { '2026-11-15': everyone(ids), '2026-11-16': { a: logged(), b: logged() } };
    const m = members.map((x) => ({ ...x, joined: '2026-11-14' }));
    cards['2026-11-14'] = everyone(ids);
    expect(streak(cards, m, '2026-11-16')).toBe(2);
    expect(dayState(cards, m, '2026-11-16', '2026-11-16')).toEqual({ state: 'waiting', waitingFor: ['c'] });
  });

  it('breaks on a past day someone missed', () => {
    const m = members.map((x) => ({ ...x, joined: '2026-11-10' }));
    const cards: TeamCards = {
      '2026-11-13': everyone(ids),
      '2026-11-14': { a: logged(), b: logged() }, // c missed
      '2026-11-15': everyone(ids),
      '2026-11-16': everyone(ids),
    };
    expect(streak(cards, m, '2026-11-16')).toBe(2);
  });

  it('does not penalise a member on break', () => {
    const m = [mk('a', { joined: '2026-11-14' }), mk('b', { joined: '2026-11-14' }), mk('c', { joined: '2026-11-14', breakUntil: '2026-11-15' })];
    const cards: TeamCards = {
      '2026-11-14': everyone(ids),
      '2026-11-15': { a: logged(), b: logged() },
      '2026-11-16': everyone(ids),
    };
    expect(onBreak(m[2], '2026-11-15')).toBe(true);
    expect(onBreak(m[2], '2026-11-16')).toBe(false);
    expect(streak(cards, m, '2026-11-16')).toBe(3);
  });

  it('is neutral when everyone is on break', () => {
    const m = members.map((x) => ({ ...x, joined: '2026-11-14', breakUntil: '2026-11-15' }));
    const cards: TeamCards = { '2026-11-14': everyone(ids), '2026-11-16': everyone(ids) };
    expect(dayState(cards, m, '2026-11-15', '2026-11-16').state).toBe('neutral');
    // The 14th and 15th are neutral (all on break), so only the 16th adds to the streak.
    expect(streak(cards, m, '2026-11-16')).toBe(1);
  });

  it('starts counting from the day the team began', () => {
    const m = members.map((x) => ({ ...x, joined: '2026-11-16' }));
    expect(streak({ '2026-11-16': everyone(ids) }, m, '2026-11-16')).toBe(1);
    expect(streak({}, [], '2026-11-16')).toBe(0);
  });

  it('does not count a member before they joined', () => {
    const m = [mk('a', { joined: '2026-11-10' }), mk('b', { joined: '2026-11-10' }), mk('c', { joined: '2026-11-16' })];
    const cards: TeamCards = {
      '2026-11-14': { a: logged(), b: logged() },
      '2026-11-15': { a: logged(), b: logged() },
      '2026-11-16': everyone(ids),
    };
    // The two older members logged the 14th and 15th; before that nobody logged.
    expect(streak(cards, m, '2026-11-16')).toBe(3);
  });
});

describe('small rules', () => {
  it('limits nudges, breaks and team size', () => {
    expect(canNudge(undefined, '2026-11-16')).toBe(true);
    expect(canNudge('2026-11-16', '2026-11-16')).toBe(false);
    expect(canNudge('2026-11-15', '2026-11-16')).toBe(true);
    expect(breakEnd('2026-11-16', 3)).toBe('2026-11-18');
    expect(breakEnd('2026-11-16', 99)).toBe('2026-11-22');
    expect(breakEnd('2026-11-16', 0)).toBe('2026-11-16');
    expect(canJoin(4)).toBe(true);
    expect(canJoin(5)).toBe(false);
  });

  it('cleans display names', () => {
    expect(cleanName('  Sara   Ali ')).toBe('Sara Ali');
    expect(cleanName('x'.repeat(50))).toHaveLength(20);
  });
});
