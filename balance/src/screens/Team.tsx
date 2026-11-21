import { useCallback, useEffect, useMemo, useState } from 'react';
import { WEEKLY_ACTIVE_MIN, addDays } from '../lib/calc';
import { getClient, type Client } from '../lib/firebase';
import { shareText } from '../lib/native';
import type { TeamInfo } from '../lib/store';
import { makeInvite } from '../lib/teamCrypto';
import {
  HISTORY_DAYS,
  MAX_POST,
  TeamError,
  createTeam,
  deletePost,
  joinTeam,
  leaveTeam,
  removeFromTeam,
  sendNudge,
  sendPost,
  subscribeTeam,
  writeProfile,
  type TeamSnapshot,
} from '../lib/teamService';
import { clearHistory, loadHistory } from '../lib/teamHistory';
import { MAX_TEAM, MIN_TEAM, breakEnd, cleanName, dayState, onBreak, streak, weekStart, weeklyGoal, type DayCard, type Member, type TeamCards } from '../lib/teamLogic';
import { Icon, Meter, Segmented, Sheet, TextField } from '../ui';

interface Props {
  team: TeamInfo | undefined;
  today: string;
  onTeam: (t: TeamInfo | null) => void;
}

type ClientState = { k: 'loading' } | { k: 'error'; message: string } | { k: 'ready'; client: Client };

function connectMessage(e: unknown): string {
  const code = typeof e === 'object' && e !== null && 'code' in e ? String((e as { code: unknown }).code) : '';
  if (code === 'auth/operation-not-allowed' || code === 'auth/admin-restricted-operation') {
    return 'Team sign-in is not switched on in Firebase yet. Enable Anonymous sign-in in the Firebase console.';
  }
  return 'Could not connect to the team service. Check your connection and try again.';
}

export function Team({ team, today, onTeam }: Props) {
  const [state, setState] = useState<ClientState>({ k: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    setState({ k: 'loading' });
    getClient().then(
      (client) => alive && setState({ k: 'ready', client }),
      (e: unknown) => alive && setState({ k: 'error', message: connectMessage(e) }),
    );
    return () => {
      alive = false;
    };
  }, [attempt]);

  return (
    <main className="screen">
      {state.k === 'loading' ? (
        <>
          <header className="head">
            <h1 className="title">Team</h1>
          </header>
          <p className="empty" role="status">
            Connecting…
          </p>
        </>
      ) : null}
      {state.k === 'error' ? (
        <>
          <header className="head">
            <h1 className="title">Team</h1>
          </header>
          <div className="card stack">
            <p className="notice" role="alert">
              {state.message}
            </p>
            <button type="button" className="btn btn-outline" onClick={() => setAttempt((n) => n + 1)}>
              Try again
            </button>
          </div>
        </>
      ) : null}
      {state.k === 'ready' && !team ? <Gate client={state.client} today={today} onTeam={onTeam} /> : null}
      {state.k === 'ready' && team ? <Home client={state.client} team={team} today={today} onTeam={onTeam} /> : null}
    </main>
  );
}

function errorText(e: unknown): string {
  return e instanceof TeamError ? e.message : 'Something went wrong. Please try again.';
}

// ---------------------------------------------------------------- no team yet

function Gate({ client, today, onTeam }: { client: Client; today: string; onTeam: (t: TeamInfo) => void }) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<null | 'create' | 'join'>(null);
  const [error, setError] = useState<string | null>(null);
  const clean = cleanName(name);

  const run = async (kind: 'create' | 'join') => {
    setBusy(kind);
    setError(null);
    try {
      onTeam(kind === 'create' ? await createTeam(client.db, client.uid, clean, today) : await joinTeam(client.db, client.uid, code, clean, today));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <header className="head">
        <h1 className="title">Team</h1>
      </header>
      <section className="card stack" style={{ gap: 12 }}>
        <span className="badge badge-burned" aria-hidden="true">
          <Icon name="lock" size={18} />
        </span>
        <h2 style={{ fontSize: 17, fontWeight: 600 }}>A private team of {MIN_TEAM} to {MAX_TEAM}</h2>
        <p className="muted">
          Share a weekly goal, keep a streak together and swap ideas. Only people with your invite can join, and everything is encrypted on the phone, so even the server cannot read it.
        </p>
        <p className="small muted">Your team sees whether you logged, whether your day is in range, and your active minutes. Never your calories or weight.</p>
      </section>

      <TextField label="Your name in the team" value={name} onChange={setName} placeholder="Sara" />

      <button type="button" className="btn btn-burned" disabled={clean === '' || busy !== null} onClick={() => void run('create')}>
        {busy === 'create' ? 'Creating…' : 'Create a team'}
      </button>

      <section className="card stack" style={{ gap: 12 }} aria-label="Join a team">
        <h2 style={{ fontSize: 16, fontWeight: 600 }}>Have an invite?</h2>
        <TextField label="Invite code" value={code} onChange={setCode} placeholder="Paste the code here" />
        <button type="button" className="btn btn-outline" disabled={clean === '' || code.trim() === '' || busy !== null} onClick={() => void run('join')}>
          {busy === 'join' ? 'Joining…' : 'Join the team'}
        </button>
      </section>

      {error ? (
        <p className="notice" role="alert">
          {error}
        </p>
      ) : null}
    </>
  );
}

// ------------------------------------------------------------------ in a team

const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  return (words.length === 1 ? Array.from(words[0]).slice(0, 2) : [Array.from(words[0])[0], Array.from(words[1])[0]]).join('').toUpperCase();
}

function weekday(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'long' });
}

function statusText(m: Member, card: DayCard | undefined, today: string): string {
  if (onBreak(m, today)) return `On a break until ${weekday(m.breakUntil as string)}`;
  if (!card?.logged) return 'Not logged yet';
  const base = card.inRange ? 'In range' : 'Logged';
  return card.activeMin > 0 ? `${base}, ${card.activeMin} active min` : base;
}

function clock(ms: number): string {
  return new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function Home({ client, team, today, onTeam }: { client: Client; team: TeamInfo; today: string; onTeam: (t: TeamInfo | null) => void }) {
  const [snap, setSnap] = useState<TeamSnapshot | null>(null);
  const [lost, setLost] = useState<TeamError | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [sheet, setSheet] = useState<null | 'invite' | 'break'>(null);
  const [note, setNote] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
  const [message, setMessage] = useState('');
  const [nudged, setNudged] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<TeamCards>({});

  // Older days are read once and kept on the phone; only the last week is live.
  useEffect(() => {
    let alive = true;
    loadHistory(client.db, team, today).then(
      (h) => alive && setHistory(h),
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, [client, team, today]);

  useEffect(() => {
    setLost(null);
    return subscribeTeam(client.db, client.uid, team, today, setSnap, setLost);
  }, [client, team, today, attempt]);

  const say = useCallback((tone: 'ok' | 'bad', text: string) => setNote({ tone, text }), []);

  const guard = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      say('bad', errorText(e));
    } finally {
      setBusy(false);
    }
  };

  if (lost) {
    return (
      <>
        <header className="head">
          <h1 className="title">Team</h1>
        </header>
        <div className="card stack" style={{ gap: 12 }}>
          <p className="notice" role="alert">
            {lost.code === 'removed'
              ? 'You are not in this team on this phone. This can happen after restoring a backup on a new phone, or if a teammate removed you.'
              : lost.message}
          </p>
          {lost.code === 'removed' ? (
            <>
              <button
                type="button"
                className="btn btn-burned"
                disabled={busy}
                onClick={() =>
                  void guard(async () => {
                    await joinTeam(client.db, client.uid, makeInvite(team), team.myName, today);
                    setAttempt((n) => n + 1);
                  })
                }
              >
                Rejoin with the saved invite
              </button>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => {
                  void clearHistory(team.teamId);
                  onTeam(null);
                }}
              >
                Forget this team
              </button>
            </>
          ) : (
            <button type="button" className="btn btn-outline" onClick={() => setAttempt((n) => n + 1)}>
              Try again
            </button>
          )}
          {note ? (
            <p className="notice" role="alert">
              {note.text}
            </p>
          ) : null}
        </div>
      </>
    );
  }

  if (!snap) {
    return (
      <>
        <header className="head">
          <h1 className="title">Team</h1>
        </header>
        <p className="empty" role="status">
          Loading your team…
        </p>
      </>
    );
  }

  const cards: TeamCards = { ...history, ...snap.cards };
  const me = snap.members.find((m) => m.uid === client.uid);
  const todayCards = cards[today] ?? {};
  const goal = weeklyGoal(cards, snap.members, today);
  const run = streak(cards, snap.members, today, HISTORY_DAYS);
  const state = dayState(cards, snap.members, today, today);
  const names = new Map(snap.members.map((m) => [m.uid, m.name]));
  const waitingNames = state.waitingFor.map((u) => names.get(u) ?? 'Someone');
  const places = MAX_TEAM - snap.memberUids.length;
  const iLogged = !!todayCards[client.uid]?.logged;
  const nudgers = snap.nudgedBy.map((u) => names.get(u) ?? 'A teammate');
  const myBreak = me && onBreak(me, today);

  const week = DAY_LETTERS.map((letter, i) => {
    const day = addDays(weekStart(today), i);
    const kind = day > today ? 'future' : dayState(cards, snap.members, day, today).state;
    return { letter, day, kind };
  });

  const invite = makeInvite(team);

  const saveBreak = (days: number | null) =>
    guard(async () => {
      if (!me) return;
      await writeProfile(client.db, team, client.uid, { name: me.name, joined: me.joined, breakUntil: days === null ? undefined : breakEnd(today, days) });
      setSheet(null);
      say('ok', days === null ? 'Welcome back. Your break has ended.' : 'Break started. Your team keeps its streak.');
    });

  const nudge = (m: Member) =>
    guard(async () => {
      try {
        await sendNudge(client.db, client.uid, team.teamId, m.uid, today);
        say('ok', `Nudged ${m.name}.`);
      } catch (e) {
        if (e instanceof TeamError && e.code === 'already') say('ok', e.message);
        else throw e;
      } finally {
        setNudged((prev) => new Set(prev).add(m.uid));
      }
    });

  const post = () =>
    guard(async () => {
      await sendPost(client.db, client.uid, team, message);
      setMessage('');
    });

  const leave = () => {
    if (!window.confirm('Leave this team? Your messages in it will be deleted. You can rejoin later with the invite.')) return;
    void guard(async () => {
      await leaveTeam(client.db, client.uid, team.teamId);
      await clearHistory(team.teamId);
      onTeam(null);
    });
  };

  const removeMember = (m: Member) => {
    if (!window.confirm(`Remove ${m.name} from the team? Use this for someone who lost their phone or left.`)) return;
    void guard(async () => {
      await removeFromTeam(client.db, team.teamId, m.uid);
      say('ok', `${m.name} was removed.`);
    });
  };

  return (
    <>
      <header className="head">
        <div className="stack" style={{ gap: 2, minWidth: 0 }}>
          <h1 className="title">Team</h1>
          <p className="small muted" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name="lock" size={14} />
            <span>
              Private, {snap.memberUids.length} of {MAX_TEAM} members
            </span>
          </p>
        </div>
        <button type="button" className="chip-btn" onClick={() => setSheet('invite')} disabled={places === 0}>
          <Icon name="plus" size={16} />
          <span>Invite</span>
        </button>
      </header>

      {nudgers.length > 0 && !iLogged ? (
        <p className="notice" role="status">
          {nudgers.join(' and ')} nudged you. Log your day to keep the streak going.
        </p>
      ) : null}

      <section className="card stack" aria-label="Team goal this week" style={{ gap: 8 }}>
        <h2 className="caps">Team goal this week</h2>
        <p>
          <span className="num" style={{ fontSize: 32, letterSpacing: '-0.02em', lineHeight: '36px' }} data-testid="goal-done">
            {goal.done}
          </span>
          <span className="unit" style={{ fontSize: 15 }}>
            of {goal.goal} active min
          </span>
        </p>
        <Meter value={goal.done} max={goal.goal} tone="blue" />
        <p className="small muted">
          {Math.max(goal.goal - goal.done, 0) === 0 ? 'Goal reached. Keep it up.' : `${goal.goal - goal.done} min to go, ${goal.daysLeft} ${goal.daysLeft === 1 ? 'day' : 'days'} left.`}{' '}
          Goal is {WEEKLY_ACTIVE_MIN} min per member.
        </p>
      </section>

      <section className="hero" aria-label="Team streak" style={{ gap: 12, padding: 16, borderRadius: 20 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
          <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FFB27A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3c1 3 4 5 4 9a4 4 0 0 1-8 0c0-1.5.5-2.5 1.5-3.5C10 10 11.5 7 12 3z" />
          </svg>
          <span data-testid="streak">
            {run >= HISTORY_DAYS - 1 ? `${run}+` : run}-day team streak
          </span>
        </h2>
        <div className="week" aria-hidden="true">
          {week.map((d, i) => (
            <span key={i} className={`wk wk-${d.kind}`}>
              {d.letter}
            </span>
          ))}
        </div>
        <p className="small muted">
          {state.state === 'complete'
            ? 'Everyone has logged today.'
            : state.state === 'neutral'
              ? 'Everyone is on a break today.'
              : `${snap.members.length - waitingNames.length} of ${snap.members.length} logged today, waiting for ${waitingNames.join(', ')}.`}
        </p>
      </section>

      {snap.members.length < MIN_TEAM ? (
        <p className="small muted">A team works best with {MIN_TEAM} to {MAX_TEAM} people. {places} {places === 1 ? 'place is' : 'places are'} open.</p>
      ) : null}

      <section className="list" aria-label="Members today">
        {snap.members.map((m) => {
          const card = todayCards[m.uid];
          const isMe = m.uid === client.uid;
          const canNudge = !isMe && !onBreak(m, today) && !card?.logged;
          return (
            <div className="item" key={m.uid} style={{ minHeight: 58 }}>
              <span
                className="badge"
                aria-hidden="true"
                style={{ background: isMe ? 'var(--ink)' : 'var(--line-soft)', color: isMe ? '#fff' : 'var(--ink)', fontSize: 13, fontWeight: 600 }}
              >
                {initials(m.name)}
              </span>
              <div className="item-main">
                <span className="item-title">{isMe ? `${m.name} (you)` : m.name}</span>
                <span className="small muted">{statusText(m, card, today)}</span>
              </div>
              {canNudge ? (
                <button type="button" className="chip-btn" style={{ height: 44 }} disabled={busy || nudged.has(m.uid)} onClick={() => void nudge(m)}>
                  {nudged.has(m.uid) ? 'Nudged' : 'Nudge'}
                </button>
              ) : null}
              {!isMe ? (
                <button type="button" className="icon-btn" aria-label={`Remove ${m.name}`} onClick={() => removeMember(m)}>
                  <Icon name="trash" size={18} />
                </button>
              ) : null}
            </div>
          );
        })}
      </section>

      <section className="stack" aria-label="Team chat">
        <h2 style={{ fontSize: 15, fontWeight: 600 }}>Share an idea</h2>
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            if (message.trim()) void post();
          }}
        >
          <label htmlFor="team-msg" className="sr-only">
            Message the team
          </label>
          <input
            id="team-msg"
            className="input grow"
            style={{ borderRadius: 26 }}
            type="text"
            maxLength={MAX_POST}
            autoComplete="off"
            placeholder="A recipe, a route, a tip"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
          <button type="submit" className="btn btn-ink" style={{ width: 52, minHeight: 52, padding: 0, borderRadius: 26 }} aria-label="Send message" disabled={busy || message.trim() === ''}>
            <Icon name="send" size={20} />
          </button>
        </form>
        {snap.posts.length === 0 ? <p className="small muted">No messages yet. Be the first to share something useful.</p> : null}
        {snap.posts.length > 0 ? (
          <div className="list">
            {snap.posts.slice(0, 20).map((p) => (
              <div className="item" key={p.id} style={{ alignItems: 'flex-start', paddingTop: 12, paddingBottom: 12 }}>
                <div className="item-main" style={{ gap: 4 }}>
                  <span className="small muted">
                    <strong style={{ color: 'var(--ink)', fontWeight: 600 }}>{p.uid === client.uid ? 'You' : p.name}</strong> at {clock(p.at)}
                  </span>
                  <span style={{ overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }} dir="auto">
                    {p.text}
                  </span>
                </div>
                {p.uid === client.uid ? (
                  <button type="button" className="icon-btn" aria-label="Delete your message" onClick={() => void guard(() => deletePost(client.db, team.teamId, p.id))}>
                    <Icon name="trash" size={18} />
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
      </section>

      {note ? (
        <p className={note.tone === 'bad' ? 'notice' : 'small muted'} role={note.tone === 'bad' ? 'alert' : 'status'}>
          {note.text}
        </p>
      ) : null}

      <div className="row">
        {myBreak ? (
          <button type="button" className="btn btn-outline grow" disabled={busy} onClick={() => void saveBreak(null)}>
            End my break
          </button>
        ) : (
          <button type="button" className="btn btn-outline grow" disabled={busy || !me} onClick={() => setSheet('break')}>
            Take a break
          </button>
        )}
        <button type="button" className="btn btn-danger grow" disabled={busy} onClick={leave}>
          Leave team
        </button>
      </div>

      {sheet === 'invite' ? <InviteSheet invite={invite} places={places} onClose={() => setSheet(null)} /> : null}
      {sheet === 'break' ? <BreakSheet busy={busy} onClose={() => setSheet(null)} onStart={(d) => void saveBreak(d)} /> : null}
    </>
  );
}

function InviteSheet({ invite, places, onClose }: { invite: string; places: number; onClose: () => void }) {
  const [status, setStatus] = useState<string | null>(null);
  const text = useMemo(() => `Join my team on Balance. Open Balance, go to Team, choose "Have an invite?" and paste this code:\n\n${invite}`, [invite]);

  const share = async () => {
    const r = await shareText(text, 'Join my Balance team');
    if (r === 'copied') setStatus('Invite copied. Paste it into a private message.');
    else if (r === 'failed') setStatus('Could not share. Select the code above and copy it.');
    else setStatus(null);
  };

  return (
    <Sheet title="Invite to your team" onClose={onClose}>
      <p className="muted">
        {places} {places === 1 ? 'place is' : 'places are'} open. Anyone with this code can join and read what the team shares, so send it privately and only to people you trust.
      </p>
      <label htmlFor="invite-code" className="field-label">
        Invite code
      </label>
      <input id="invite-code" className="input" readOnly value={invite} onFocus={(e) => e.currentTarget.select()} style={{ fontSize: 14 }} />
      <button type="button" className="btn btn-burned" onClick={() => void share()}>
        Share invite
      </button>
      {status ? (
        <p className="small muted" role="status">
          {status}
        </p>
      ) : null}
    </Sheet>
  );
}

function BreakSheet({ busy, onClose, onStart }: { busy: boolean; onClose: () => void; onStart: (days: number) => void }) {
  const [days, setDays] = useState(3);
  const options: { value: number; label: string }[] = [
    { value: 1, label: '1 day' },
    { value: 3, label: '3 days' },
    { value: 7, label: '7 days' },
  ];
  return (
    <Sheet title="Take a break" onClose={onClose}>
      <p className="muted">Sick, travelling or resting? A break keeps your team's streak safe while you are away.</p>
      <Segmented label="How long" value={days} onChange={setDays} options={options} />
      <button type="button" className="btn btn-burned" disabled={busy} onClick={() => onStart(days)}>
        Start break
      </button>
    </Sheet>
  );
}
