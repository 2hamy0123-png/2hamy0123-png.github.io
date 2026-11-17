import { useState } from 'react';
import { bmi, canLose, dailyTarget, isAdult, macroTargets, type Goal, type Profile, type Sex } from '../lib/calc';
import { formatKcal } from '../lib/calc';
import { Segmented, TextField, parseNum } from '../ui';

interface Props {
  initial: Profile | null;
  onSave: (p: Profile) => void;
  onCancel?: () => void;
}

export function Setup({ initial, onSave, onCancel }: Props) {
  const [sex, setSex] = useState<Sex>(initial?.sex ?? 'female');
  const [age, setAge] = useState(initial ? String(initial.age) : '');
  const [height, setHeight] = useState(initial ? String(initial.heightCm) : '');
  const [weight, setWeight] = useState(initial ? String(initial.weightKg) : '');
  const [goal, setGoal] = useState<Goal>(initial?.goal ?? 'maintain');
  const [pace, setPace] = useState(initial?.paceKgPerWeek ?? 0.25);
  const [credit, setCredit] = useState(initial?.creditPct ?? 50);

  const ageN = parseNum(age);
  const heightN = parseNum(height);
  const weightN = parseNum(weight);

  const problems: string[] = [];
  if (ageN !== null && !isAdult(ageN)) problems.push('Balance sets calorie targets for adults only (18 and over).');
  if (ageN !== null && ageN > 100) problems.push('Check the age you entered.');
  if (heightN !== null && (heightN < 120 || heightN > 230)) problems.push('Height should be between 120 and 230 cm.');
  if (weightN !== null && (weightN < 30 || weightN > 250)) problems.push('Weight should be between 30 and 250 kg.');

  const complete = ageN !== null && heightN !== null && weightN !== null && problems.length === 0;
  const loseAllowed = heightN === null || weightN === null || canLose({ heightCm: heightN, weightKg: weightN });
  const effectiveGoal: Goal = goal === 'lose' && !loseAllowed ? 'maintain' : goal;

  const profile: Profile | null = complete
    ? { sex, age: ageN, heightCm: heightN, weightKg: weightN, goal: effectiveGoal, paceKgPerWeek: pace, creditPct: credit }
    : null;
  const target = profile ? dailyTarget(profile) : null;
  const protein = profile && target ? macroTargets(target.target, profile.weightKg).protein : null;

  return (
    <main className="screen screen-plain">
      <header className="stack" style={{ gap: 4 }}>
        <h1 className="title">{initial ? 'Your profile' : 'About you'}</h1>
        <p className="muted" style={{ fontSize: 14 }}>
          For adults 18 and over. Used to set your daily range, and it stays on your phone.
        </p>
      </header>

      <Segmented
        label="Sex"
        value={sex}
        onChange={setSex}
        options={[
          { value: 'female', label: 'Female' },
          { value: 'male', label: 'Male' },
        ]}
      />

      <div className="grid-3" style={{ gap: 8 }}>
        <TextField label="Age" value={age} onChange={setAge} numeric big />
        <TextField label="Height, cm" value={height} onChange={setHeight} numeric big />
        <TextField label="Weight, kg" value={weight} onChange={setWeight} numeric big />
      </div>

      <div className="stack" style={{ gap: 8 }}>
        <Segmented
          label="Goal"
          value={effectiveGoal}
          onChange={setGoal}
          options={[
            { value: 'lose', label: 'Lose', disabled: !loseAllowed },
            { value: 'maintain', label: 'Maintain' },
            { value: 'gain', label: 'Gain' },
          ]}
        />
        {!loseAllowed && heightN !== null && weightN !== null ? (
          <p className="tiny muted">
            Lose is unavailable because your weight is already low for your height (BMI {bmi({ heightCm: heightN, weightKg: weightN }).toFixed(1)}).
          </p>
        ) : null}
      </div>

      {effectiveGoal !== 'maintain' ? (
        <Segmented
          label="Pace"
          value={pace}
          onChange={setPace}
          options={[
            { value: 0.25, label: '0.25 kg a week' },
            { value: 0.5, label: '0.5 kg a week' },
          ]}
        />
      ) : null}

      {initial ? (
        <Segmented
          label="Activity credit"
          hint="share of burned energy added back"
          value={credit}
          onChange={setCredit}
          options={[
            { value: 0, label: 'None' },
            { value: 50, label: 'Half' },
            { value: 100, label: 'All' },
          ]}
        />
      ) : null}

      {problems.map((p) => (
        <p key={p} className="notice" role="alert">
          {p}
        </p>
      ))}

      {target && protein !== null ? (
        <section className="result" aria-label="Your daily target">
          <h2 className="caps">Your daily target</h2>
          <p>
            <span className="num">{formatKcal(target.target)}</span>
            <span className="muted" style={{ marginLeft: 8 }}>
              kcal
            </span>
          </p>
          <p style={{ fontSize: 14 }}>
            Range {formatKcal(target.low)} to {formatKcal(target.high)} kcal. Protein {protein} g.
          </p>
          <p className="small muted">
            {target.floored
              ? `Raised to the minimum of ${formatKcal(target.target)} kcal so you do not eat too little.`
              : `Your target never goes below ${formatKcal(sex === 'male' ? 1500 : 1200)} kcal.`}
          </p>
        </section>
      ) : null}

      <div className="row">
        {onCancel ? (
          <button type="button" className="btn btn-outline grow" onClick={onCancel}>
            Cancel
          </button>
        ) : null}
        <button type="button" className="btn btn-burned grow" disabled={!profile} onClick={() => profile && onSave(profile)}>
          {initial ? 'Save' : 'Continue'}
        </button>
      </div>
    </main>
  );
}
