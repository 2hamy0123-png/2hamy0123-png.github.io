import { formatClock, formatKcal, type Profile } from '../lib/calc';
import { MEALS, type DaySummary } from '../lib/store';
import { Icon } from '../ui';

interface Props {
  day: DaySummary;
  profile: Profile;
  onScan: () => void;
  onStart: () => void;
  onProfile: () => void;
}

export function activitySub(a: { distanceM?: number; durationSec: number }): string {
  if (a.distanceM && a.distanceM >= 50) return `${(a.distanceM / 1000).toFixed(1)} km in ${formatClock(a.durationSec)}`;
  return `${Math.round(a.durationSec / 60)} min`;
}

export function Today({ day, profile, onScan, onStart, onProfile }: Props) {
  const { target, net, status } = day;
  const scaleMax = target.high * 1.2;
  const pct = (v: number) => Math.max(0, Math.min(100, (v / scaleMax) * 100));

  const statusLine =
    status === 'in'
      ? `In your range of ${formatKcal(target.low)} to ${formatKcal(target.high)} kcal`
      : status === 'under'
        ? `${formatKcal(target.low - net)} kcal to reach your range`
        : `${formatKcal(net - target.high)} kcal over your range`;

  const creditNote =
    profile.creditPct === 0
      ? 'Activity credit is off in your profile.'
      : day.burned === 0
        ? 'Log an activity to earn credit.'
        : profile.creditPct === 100
          ? `Credit is all of about ${formatKcal(day.burned)} kcal burned, an estimate.`
          : `Credit is half of about ${formatKcal(day.burned)} kcal burned, an estimate.`;

  const meals = MEALS.map((meal) => ({ meal, items: day.foods.filter((f) => f.meal === meal) })).filter((m) => m.items.length > 0);
  const nothing = meals.length === 0 && day.activities.length === 0;

  return (
    <main className="screen">
      <header className="head">
        <h1 className="title">Today</h1>
        <button type="button" className="chip-btn" onClick={onProfile}>
          <Icon name="user" size={18} />
          <span>Profile</span>
        </button>
      </header>

      <section className="hero" aria-label="Net energy">
        <div className="stack" style={{ gap: 4 }}>
          <p className="caps">Net energy</p>
          <p className="hero-num">
            <span className="num" data-testid="net">
              {formatKcal(net)}
            </span>
            <span className="muted" style={{ fontSize: 16, fontWeight: 500 }}>
              kcal
            </span>
          </p>
          <p data-testid="status">{statusLine}</p>
        </div>
        <div className="range-bar" aria-hidden="true">
          <div className="range-track" />
          <div className="range-band" style={{ left: `${pct(target.low)}%`, width: `${pct(target.high) - pct(target.low)}%` }} />
          <div className="range-mark" style={{ left: `${pct(net)}%` }} />
        </div>
        <div className="equation">
          <div>
            <span className="small muted">
              <span className="dot" style={{ background: 'var(--eaten)' }} aria-hidden="true" />
              Eaten
            </span>
            <span className="num" style={{ color: 'var(--on-ink-eaten)' }} data-testid="eaten">
              {formatKcal(day.eaten)}
            </span>
          </div>
          <span className="num muted" style={{ fontSize: 24, fontWeight: 500 }} aria-hidden="true">
            −
          </span>
          <div>
            <span className="small muted">
              <span className="dot" style={{ background: '#6FA2FF' }} aria-hidden="true" />
              Activity credit
            </span>
            <span className="num" style={{ color: 'var(--on-ink-burned)' }} data-testid="credit">
              {formatKcal(day.credit)}
            </span>
          </div>
        </div>
        <p className="small muted">{creditNote}</p>
      </section>

      <div className="row">
        <button type="button" className="btn btn-eaten grow" onClick={onScan}>
          <Icon name="barcode" size={20} />
          <span>Scan food</span>
        </button>
        <button type="button" className="btn btn-burned grow" onClick={onStart}>
          <Icon name="play" size={20} />
          <span>Start activity</span>
        </button>
      </div>

      <section className="stack" aria-label="Logged today">
        <h2 style={{ fontSize: 15, fontWeight: 600 }}>Logged today</h2>
        <div className="list">
          {nothing ? <p className="empty">Nothing logged yet today.</p> : null}
          {meals.map(({ meal, items }) => (
            <div className="item" key={meal}>
              <span className="badge badge-eaten" aria-hidden="true">
                <Icon name="food" size={18} />
              </span>
              <div className="item-main">
                <span className="item-title">{meal}</span>
                <span className="small muted">{items.map((i) => i.name).join(', ')}</span>
              </div>
              <span className="item-val eaten">+{formatKcal(items.reduce((s, i) => s + i.kcal, 0))}</span>
            </div>
          ))}
          {day.activities.map((a) => (
            <div className="item" key={a.id}>
              <span className="badge badge-burned" aria-hidden="true">
                <Icon name="activity" size={18} />
              </span>
              <div className="item-main">
                <span className="item-title">{a.name}</span>
                <span className="small muted">{activitySub(a)}, estimated burn</span>
              </div>
              <span className="item-val burned">~{formatKcal(a.kcal)}</span>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
