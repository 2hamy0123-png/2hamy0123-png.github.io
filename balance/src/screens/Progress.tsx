import { useState } from 'react';
import { WEEKLY_ACTIVE_MIN, addDays, lastDays, weightAverage, type Profile, type WeightEntry } from '../lib/calc';
import { daySummary, type AppState } from '../lib/store';
import { Meter, TextField, parseNum } from '../ui';

interface Props {
  state: AppState;
  profile: Profile;
  today: string;
  onLogWeight: (kg: number) => void;
}

export function Progress({ state, profile, today, onLogWeight }: Props) {
  const [weight, setWeight] = useState('');
  const kg = parseNum(weight);
  const validWeight = kg !== null && kg >= 30 && kg <= 250;

  const avg = weightAverage(state.weights, today);
  const prev = weightAverage(state.weights, addDays(today, -7));
  const todayReading = state.weights.find((w) => w.date === today);

  let trend = 'Log your weight on a few days to see the trend.';
  if (avg !== null && prev !== null) {
    const diff = Math.round((avg - prev) * 10) / 10;
    trend = diff === 0 ? 'Same as last week.' : `${diff < 0 ? 'Down' : 'Up'} ${Math.abs(diff).toFixed(1)} kg from last week.`;
  }

  const week = lastDays(today, 7).map((d) => daySummary(state, profile, d));
  const daysInRange = week.filter((d) => d.foods.length > 0 && d.status === 'in').length;
  const activeMin = week.reduce((s, d) => s + d.activeMin, 0);
  const readings = state.weights.filter((w) => lastDays(today, 14).includes(w.date));

  return (
    <main className="screen">
      <header className="head">
        <h1 className="title">Progress</h1>
      </header>

      <section className="card stack" aria-label="Weight trend">
        <div className="stack" style={{ gap: 4 }}>
          <h2 className="caps">Weight, 7-day average</h2>
          <p>
            <span className="num" style={{ fontSize: 40, letterSpacing: '-0.02em', lineHeight: '44px' }} data-testid="weight-avg">
              {avg !== null ? avg.toFixed(1) : '–'}
            </span>
            <span className="unit" style={{ fontSize: 15 }}>
              kg
            </span>
          </p>
          <p className="small muted">
            {trend}
            {todayReading ? ` Today's reading was ${todayReading.kg.toFixed(1)} kg.` : ''}
          </p>
        </div>
        {readings.length >= 2 ? (
          <>
            <WeightChart weights={state.weights} today={today} />
            <div className="legend">
              <span>
                <span className="legend-dot" aria-hidden="true" />
                Daily reading
              </span>
              <span>
                <span className="legend-line" aria-hidden="true" />
                7-day average
              </span>
            </div>
          </>
        ) : null}
      </section>

      <div className="row" style={{ alignItems: 'flex-end' }}>
        <div className="grow">
          <TextField label="Today's weight, kg" value={weight} onChange={setWeight} numeric />
        </div>
        <button
          type="button"
          className="btn btn-outline"
          disabled={!validWeight}
          onClick={() => {
            if (validWeight) {
              onLogWeight(Math.round(kg * 10) / 10);
              setWeight('');
            }
          }}
        >
          Save weight
        </button>
      </div>

      <section className="grid-2" aria-label="Last 7 days">
        <div className="tile">
          <span className="tiny muted" style={{ fontWeight: 500 }}>
            Days in range, last 7
          </span>
          <span>
            <span className="num" data-testid="days-in-range">
              {daysInRange}
            </span>
            <span className="unit">of 7</span>
          </span>
          <Meter value={daysInRange} max={7} />
        </div>
        <div className="tile">
          <span className="tiny muted" style={{ fontWeight: 500 }}>
            Active minutes, last 7 days
          </span>
          <span>
            <span className="num" data-testid="active-week">
              {activeMin}
            </span>
            <span className="unit">of {WEEKLY_ACTIVE_MIN}</span>
          </span>
          <Meter value={activeMin} max={WEEKLY_ACTIVE_MIN} tone="blue" />
        </div>
      </section>
    </main>
  );
}

/** Daily readings as dots and the 7-day average as a line, over 14 days. */
function WeightChart({ weights, today }: { weights: WeightEntry[]; today: string }) {
  const [picked, setPicked] = useState<string | null>(null);
  const days = lastDays(today, 14);
  const byDate = new Map(weights.map((w) => [w.date, w.kg]));
  const daily = days.map((d, i) => ({ d, i, kg: byDate.get(d) })).filter((p): p is { d: string; i: number; kg: number } => p.kg !== undefined);
  const firstIndex = daily[0].i;
  const avg = days
    .map((d, i) => ({ i, kg: i >= firstIndex ? weightAverage(weights, d) : null }))
    .filter((p): p is { i: number; kg: number } => p.kg !== null);

  const W = 318;
  const X0 = 34;
  const X1 = 310;
  const TOP = 14;
  const PLOT_H = 112;
  const values = [...daily.map((p) => p.kg), ...avg.map((p) => p.kg)];
  // Whole-kilogram bounds, so the middle gridline is a clean x.0 or x.5 value.
  const lo = Math.floor(Math.min(...values) - 0.2);
  let hi = Math.ceil(Math.max(...values) + 0.2);
  if (hi - lo < 1) hi = lo + 1;
  const x = (i: number) => X0 + (i * (X1 - X0)) / (days.length - 1);
  const y = (kg: number) => TOP + ((hi - kg) / (hi - lo)) * PLOT_H;
  const ticks = [hi, (hi + lo) / 2, lo];
  const line = avg.map((p, n) => `${n === 0 ? 'M' : 'L'}${x(p.i).toFixed(1)} ${y(p.kg).toFixed(1)}`).join(' ');
  const end = avg[avg.length - 1];
  const sel = daily.find((p) => p.d === picked);
  const summary = `Weight over the last 14 days. Daily readings range from ${Math.min(...daily.map((p) => p.kg)).toFixed(1)} to ${Math.max(
    ...daily.map((p) => p.kg),
  ).toFixed(1)} kg; the 7-day average is now ${end.kg.toFixed(1)} kg.`;

  return (
    <svg className="chart" viewBox={`0 0 ${W} 160`} role="img" aria-label={summary}>
      {ticks.map((t) => (
        <g key={t}>
          <path d={`M${X0} ${y(t)} H314`} stroke="#E4E8ED" strokeWidth="1" fill="none" />
          <text x="0" y={y(t) + 4} fontSize="11" fill="#536072">
            {t.toFixed(1)}
          </text>
        </g>
      ))}
      {avg.length >= 2 ? <path d={line} stroke="#0E1A2B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" /> : null}
      {daily.map((p) => (
        <g key={p.d} onClick={() => setPicked(picked === p.d ? null : p.d)} style={{ cursor: 'pointer' }}>
          <circle cx={x(p.i)} cy={y(p.kg)} r="14" fill="transparent" />
          <circle cx={x(p.i)} cy={y(p.kg)} r={picked === p.d ? 6 : 4} fill="#7C899B" stroke="#FFFFFF" strokeWidth="2" />
        </g>
      ))}
      <circle cx={x(end.i)} cy={y(end.kg)} r="5" fill="#0E1A2B" stroke="#FFFFFF" strokeWidth="2" />
      {sel ? (
        <text
          x={Math.min(Math.max(x(sel.i), X0 + 14), X1 - 14)}
          y={Math.max(y(sel.kg) - 10, 10)}
          fontSize="12"
          fontWeight="600"
          fill="#0E1A2B"
          textAnchor="middle"
        >
          {sel.kg.toFixed(1)}
        </text>
      ) : null}
      <text x={X0} y="152" fontSize="11" fill="#536072">
        14 days ago
      </text>
      <text x="314" y="152" fontSize="11" fill="#536072" textAnchor="end">
        Today
      </text>
    </svg>
  );
}
