import { useCallback, useEffect, useRef, useState } from 'react';
import {
  acceptFix,
  activeMinutes,
  activityKcal,
  formatClock,
  formatKcal,
  haversineM,
  paceSecPerKm,
  type ActivityType,
  type Effort,
  type LatLon,
} from '../lib/calc';
import { startTracking, type GpsStatus } from '../lib/native';
import { partOfDay, type ActivityEntry, type DaySummary } from '../lib/store';
import { Icon, Segmented, Sheet, TextField, parseNum } from '../ui';

export type NewActivity = Omit<ActivityEntry, 'id' | 'date'>;

interface Props {
  day: DaySummary;
  weightKg: number;
  openStart: boolean;
  onOpenStartHandled: () => void;
  onAdd: (a: NewActivity) => void;
  onRemove: (id: string) => void;
}

const EFFORTS: { value: Effort; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'hard', label: 'Hard' },
];

function defaultName(type: ActivityType): string {
  const part = partOfDay(new Date().getHours());
  return type === 'Other' ? `${part} workout` : `${part} ${type.toLowerCase()}`;
}

export function Activity({ day, weightKg, openStart, onOpenStartHandled, onAdd, onRemove }: Props) {
  const [sheet, setSheet] = useState<null | 'track' | 'manual'>(null);

  useEffect(() => {
    if (openStart) {
      setSheet('track');
      onOpenStartHandled();
    }
  }, [openStart, onOpenStartHandled]);

  const close = useCallback(() => setSheet(null), []);

  return (
    <main className="screen">
      <header className="head">
        <h1 className="title">Activity</h1>
        <p className="head-stat">
          <span className="num burned" style={{ fontSize: 24 }}>
            {day.activeMin}
          </span>
          <span className="small muted">active min today</span>
        </p>
      </header>

      <div className="row">
        <button type="button" className="btn btn-burned grow" style={{ fontSize: 16 }} onClick={() => setSheet('track')}>
          <Icon name="play" size={20} />
          <span>Start activity</span>
        </button>
        <button type="button" className="btn btn-outline grow" onClick={() => setSheet('manual')}>
          <Icon name="plus" size={18} />
          <span>Log manually</span>
        </button>
      </div>

      {day.activities.length === 0 ? (
        <div className="card">
          <p className="empty">No activity logged today.</p>
        </div>
      ) : null}

      {day.activities.map((a) => (
        <ActivityCard key={a.id} a={a} onRemove={() => onRemove(a.id)} />
      ))}

      {sheet === 'track' ? (
        <TrackerSheet
          weightKg={weightKg}
          onClose={close}
          onSave={(a) => {
            onAdd(a);
            close();
          }}
        />
      ) : null}
      {sheet === 'manual' ? (
        <ManualSheet
          weightKg={weightKg}
          onClose={close}
          onSave={(a) => {
            onAdd(a);
            close();
          }}
        />
      ) : null}
    </main>
  );
}

function ActivityCard({ a, onRemove }: { a: ActivityEntry; onRemove: () => void }) {
  const pace = a.distanceM ? paceSecPerKm(a.durationSec, a.distanceM) : null;
  return (
    <section className="card stack" aria-label={a.name} style={{ gap: 12 }}>
      {a.track && a.track.length >= 2 ? <RouteMap track={a.track} /> : null}
      <div className="head" style={{ minHeight: 0 }}>
        <div className="stack" style={{ gap: 2 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600 }}>{a.name}</h2>
          <span className="small muted">
            {activeMinutes(a)} active min, {a.effort} effort
          </span>
        </div>
        <div className="row" style={{ alignItems: 'center', gap: 4 }}>
          <span className="pill">{a.type}</span>
          <button type="button" className="icon-btn" aria-label={`Remove ${a.name}`} onClick={onRemove}>
            <Icon name="trash" size={18} />
          </button>
        </div>
      </div>
      <div className="grid-2">
        {a.distanceM ? (
          <Stat label="Distance" value={(a.distanceM / 1000).toFixed(1)} unit="km" />
        ) : null}
        <Stat label="Time" value={formatClock(a.durationSec)} />
        {pace ? <Stat label="Pace" value={formatClock(pace)} unit="/km" /> : null}
        <Stat label="Burned, estimated" value={`~${formatKcal(a.kcal)}`} unit="kcal" tone="burned" />
      </div>
    </section>
  );
}

function Stat({ label, value, unit, tone }: { label: string; value: string; unit?: string; tone?: 'burned' }) {
  return (
    <div className="stack" style={{ gap: 2 }}>
      <span className="tiny muted" style={{ fontWeight: 500 }}>
        {label}
      </span>
      <span>
        <span className={tone ? `num ${tone}` : 'num'} style={{ fontSize: 24 }}>
          {value}
        </span>
        {unit ? <span className="unit">{unit}</span> : null}
      </span>
    </div>
  );
}

/** Draws the recorded route as a shape; no map tiles are downloaded. */
export function RouteMap({ track }: { track: [number, number][] }) {
  const W = 350;
  const H = 180;
  const P = 24;
  const meanLat = track.reduce((s, p) => s + p[0], 0) / track.length;
  const kx = Math.cos((meanLat * Math.PI) / 180);
  const pts = track.map(([lat, lon]) => [lon * kx, -lat]);
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const spanX = Math.max(Math.max(...xs) - minX, 1e-9);
  const spanY = Math.max(Math.max(...ys) - minY, 1e-9);
  const scale = Math.min((W - 2 * P) / spanX, (H - 2 * P) / spanY);
  const offX = (W - spanX * scale) / 2;
  const offY = (H - spanY * scale) / 2;
  const xy = pts.map(([x, y]) => [offX + (x - minX) * scale, offY + (y - minY) * scale]);
  const d = xy.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const start = xy[0];
  const end = xy[xy.length - 1];
  return (
    <svg className="map" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Route of this activity">
      <rect x="0" y="0" width={W} height={H} fill="#DCE4EC" />
      <path d={d} stroke="#1D4ED8" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <circle cx={start[0]} cy={start[1]} r="7" fill="#FFFFFF" stroke="#0E1A2B" strokeWidth="3" />
      <circle cx={end[0]} cy={end[1]} r="7" fill="#0E1A2B" stroke="#FFFFFF" strokeWidth="2" />
    </svg>
  );
}

function thin(track: [number, number][], max = 400): [number, number][] {
  if (track.length <= max) return track;
  const step = (track.length - 1) / (max - 1);
  const out: [number, number][] = [];
  for (let i = 0; i < max; i++) out.push(track[Math.round(i * step)]);
  return out;
}

type GpsState = 'waiting' | GpsStatus;

const GPS_TEXT: Record<GpsState, string> = {
  waiting: 'Waiting for GPS…',
  ok: 'GPS signal is good.',
  weak: 'GPS signal is weak, so distance may be off.',
  off: 'Location is off. Time is recorded but distance is not.',
};

interface WakeLockLike {
  release(): Promise<void>;
}

function TrackerSheet({ weightKg, onClose, onSave }: { weightKg: number; onClose: () => void; onSave: (a: NewActivity) => void }) {
  const [type, setType] = useState<ActivityType>('Run');
  const [phase, setPhase] = useState<'pick' | 'run' | 'paused' | 'effort'>('pick');
  const [elapsed, setElapsed] = useState(0);
  const [distance, setDistance] = useState(0);
  const [gps, setGps] = useState<GpsState>('waiting');
  const [effort, setEffort] = useState<Effort>('moderate');
  const s = useRef({ before: 0, resumedAt: 0, running: false, last: undefined as LatLon | undefined, distance: 0, track: [] as [number, number][] });

  const watching = phase === 'run' || phase === 'paused';

  // On the phone this keeps running with the screen locked (foreground service).
  useEffect(() => {
    if (!watching) return;
    let cancelled = false;
    let stop: (() => void) | undefined;
    void startTracking((fix) => {
      const st = s.current;
      if (!st.running) return;
      const next = { lat: fix.lat, lon: fix.lon };
      if (!acceptFix(st.last, next, fix.accuracy)) return;
      if (st.last) {
        st.distance += haversineM(st.last, next);
        setDistance(st.distance);
      }
      st.last = next;
      st.track.push([fix.lat, fix.lon]);
    }, setGps).then((fn) => {
      if (cancelled) fn();
      else stop = fn;
    });
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [watching]);

  // Keep the screen on while tracking, where the device allows it.
  useEffect(() => {
    if (!watching) return;
    const wl = (navigator as unknown as { wakeLock?: { request(kind: 'screen'): Promise<WakeLockLike> } }).wakeLock;
    if (!wl) return;
    let lock: WakeLockLike | undefined;
    let cancelled = false;
    const acquire = () => {
      wl.request('screen')
        .then((l) => {
          if (cancelled) void l.release();
          else lock = l;
        })
        .catch(() => undefined);
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') acquire();
    };
    acquire();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      void lock?.release().catch(() => undefined);
    };
  }, [watching]);

  useEffect(() => {
    if (phase !== 'run') return;
    const tick = () => setElapsed(s.current.before + (Date.now() - s.current.resumedAt) / 1000);
    tick();
    const t = setInterval(tick, 500);
    return () => clearInterval(t);
  }, [phase]);

  const start = () => {
    s.current = { before: 0, resumedAt: Date.now(), running: true, last: undefined, distance: 0, track: [] };
    setElapsed(0);
    setDistance(0);
    setPhase('run');
  };
  const stopClock = () => {
    const st = s.current;
    if (st.running) st.before += (Date.now() - st.resumedAt) / 1000;
    st.running = false;
    st.last = undefined;
    setElapsed(st.before);
  };
  const pause = () => {
    stopClock();
    setPhase('paused');
  };
  const resume = () => {
    s.current.resumedAt = Date.now();
    s.current.running = true;
    setPhase('run');
  };
  const finish = () => {
    stopClock();
    setPhase('effort');
  };
  const save = () => {
    const st = s.current;
    const durationSec = Math.round(st.before);
    const distanceM = st.distance >= 50 ? Math.round(st.distance) : undefined;
    onSave({
      type,
      name: defaultName(type),
      durationSec,
      distanceM,
      effort,
      kcal: activityKcal({ type, effort, durationSec, distanceM, weightKg }),
      track: st.track.length >= 2 ? thin(st.track) : undefined,
    });
  };
  const requestClose = () => {
    if (phase === 'pick' || window.confirm('Discard this activity?')) onClose();
  };

  const pace = paceSecPerKm(elapsed, distance);

  return (
    <Sheet title={phase === 'pick' ? 'Start activity' : phase === 'effort' ? 'How did it feel?' : type} onClose={requestClose}>
      {phase === 'pick' ? (
        <>
          <Segmented
            label="Activity"
            value={type}
            onChange={setType}
            options={[
              { value: 'Run', label: 'Run' },
              { value: 'Walk', label: 'Walk' },
              { value: 'Ride', label: 'Ride' },
            ]}
          />
          <p className="small muted">Distance is measured with GPS. Keep this screen open while you move.</p>
          <button type="button" className="btn btn-burned" onClick={start}>
            <Icon name="play" size={20} />
            <span>Start</span>
          </button>
        </>
      ) : null}

      {watching ? (
        <>
          <div className="card live" aria-live="off">
            <div className="stack" style={{ gap: 2 }}>
              <span className="tiny muted">Time</span>
              <span className="num" data-testid="live-time">
                {formatClock(elapsed)}
              </span>
            </div>
            <div className="stack" style={{ gap: 2 }}>
              <span className="tiny muted">Distance, km</span>
              <span className="num" data-testid="live-distance">
                {(distance / 1000).toFixed(2)}
              </span>
            </div>
            <div className="stack" style={{ gap: 2 }}>
              <span className="tiny muted">Pace, /km</span>
              <span className="num">{pace ? formatClock(pace) : '–'}</span>
            </div>
          </div>
          <p className="small muted" role="status">
            {phase === 'paused' ? 'Paused. ' : ''}
            {GPS_TEXT[gps]}
          </p>
          <div className="row">
            {phase === 'run' ? (
              <button type="button" className="btn btn-outline grow" onClick={pause}>
                <Icon name="pause" size={20} />
                <span>Pause</span>
              </button>
            ) : (
              <button type="button" className="btn btn-outline grow" onClick={resume}>
                <Icon name="play" size={20} />
                <span>Resume</span>
              </button>
            )}
            <button type="button" className="btn btn-burned grow" onClick={finish}>
              Finish
            </button>
          </div>
        </>
      ) : null}

      {phase === 'effort' ? (
        <>
          <p className="muted">
            {formatClock(elapsed)}
            {distance >= 50 ? `, ${(distance / 1000).toFixed(2)} km` : ''}
          </p>
          <Segmented label="Effort" hint="hard minutes count double" value={effort} onChange={setEffort} options={EFFORTS} />
          <button type="button" className="btn btn-burned" onClick={save}>
            Save activity
          </button>
        </>
      ) : null}
    </Sheet>
  );
}

function ManualSheet({ weightKg, onClose, onSave }: { weightKg: number; onClose: () => void; onSave: (a: NewActivity) => void }) {
  const [type, setType] = useState<ActivityType>('Other');
  const [name, setName] = useState('');
  const [minutes, setMinutes] = useState('');
  const [km, setKm] = useState('');
  const [effort, setEffort] = useState<Effort>('moderate');

  const min = parseNum(minutes);
  const dist = km.trim() === '' ? 0 : parseNum(km);
  const valid = min !== null && min > 0 && min <= 1440 && dist !== null;
  const durationSec = valid ? Math.round(min * 60) : 0;
  const distanceM = valid && dist > 0 ? Math.round(dist * 1000) : undefined;
  const kcal = valid ? activityKcal({ type, effort, durationSec, distanceM, weightKg }) : 0;

  return (
    <Sheet title="Log activity" onClose={onClose}>
      <Segmented
        label="Activity"
        value={type}
        onChange={setType}
        options={[
          { value: 'Run', label: 'Run' },
          { value: 'Walk', label: 'Walk' },
          { value: 'Ride', label: 'Ride' },
          { value: 'Other', label: 'Other' },
        ]}
      />
      <TextField label="Name (optional)" value={name} onChange={setName} placeholder="Football, gym, swimming" />
      <div className="grid-2">
        <TextField label="Minutes" value={minutes} onChange={setMinutes} numeric />
        <TextField label="Distance, km (optional)" value={km} onChange={setKm} numeric />
      </div>
      <Segmented label="Effort" hint="hard minutes count double" value={effort} onChange={setEffort} options={EFFORTS} />
      <p className="small muted" role="status">
        {valid ? `About ${formatKcal(kcal)} kcal burned, ${activeMinutes({ durationSec, effort })} active minutes. Both are estimates.` : 'Enter how long it lasted.'}
      </p>
      <button
        type="button"
        className="btn btn-burned"
        disabled={!valid}
        onClick={() => valid && onSave({ type, name: name.trim() || defaultName(type), durationSec, distanceM, effort, kcal })}
      >
        Save activity
      </button>
    </Sheet>
  );
}
