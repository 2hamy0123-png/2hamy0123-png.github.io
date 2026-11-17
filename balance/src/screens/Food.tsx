import { useCallback, useEffect, useRef, useState } from 'react';
import { formatKcal, scalePer100 } from '../lib/calc';
import { isBarcode, lookupBarcode, type Product } from '../lib/off';
import { startScanner, type Scanner } from '../lib/scanner';
import { MEALS, mealForHour, type DaySummary, type FoodEntry, type Meal } from '../lib/store';
import { Icon, Meter, Segmented, Sheet, TextField, parseNum } from '../ui';

export type NewFood = Omit<FoodEntry, 'id' | 'date'>;

interface Props {
  day: DaySummary;
  openScan: boolean;
  onOpenScanHandled: () => void;
  onAdd: (f: NewFood) => void;
  onRemove: (id: string) => void;
}

const MEAL_OPTIONS = MEALS.map((m) => ({ value: m, label: m }));

export function Food({ day, openScan, onOpenScanHandled, onAdd, onRemove }: Props) {
  const [sheet, setSheet] = useState<null | 'scan' | 'manual'>(null);
  const [prefillCode, setPrefillCode] = useState<string | undefined>();

  useEffect(() => {
    if (openScan) {
      setSheet('scan');
      onOpenScanHandled();
    }
  }, [openScan, onOpenScanHandled]);

  const close = useCallback(() => setSheet(null), []);
  const groups = MEALS.map((meal) => ({ meal, items: day.foods.filter((f) => f.meal === meal) })).filter((g) => g.items.length > 0);

  return (
    <main className="screen">
      <header className="head">
        <h1 className="title">Food</h1>
        <p className="head-stat">
          <span className="num eaten" style={{ fontSize: 24 }}>
            {formatKcal(day.eaten)}
          </span>
          <span className="small muted">kcal eaten</span>
        </p>
      </header>

      <div className="row">
        <button type="button" className="btn btn-eaten grow" style={{ minHeight: 56, fontSize: 16 }} onClick={() => setSheet('scan')}>
          <Icon name="barcode" size={22} />
          <span>Scan barcode</span>
        </button>
        <button
          type="button"
          className="btn btn-outline grow"
          style={{ minHeight: 56 }}
          onClick={() => {
            setPrefillCode(undefined);
            setSheet('manual');
          }}
        >
          <Icon name="plus" size={18} />
          <span>Add manually</span>
        </button>
      </div>

      <section className="card stack" aria-label="Macros" style={{ gap: 12 }}>
        <div className="grid-3" style={{ gap: 16 }}>
          <Macro label="Protein" value={day.protein} target={day.macros.protein} />
          <Macro label="Carbs" value={day.carbs} target={day.macros.carbs} />
          <Macro label="Fat" value={day.fat} target={day.macros.fat} />
        </div>
        <p className="tiny muted">Targets follow your body weight and today's activity.</p>
      </section>

      <section className="list" aria-label="Meals">
        {groups.length === 0 ? <p className="empty">No food logged today. Scan a barcode or add a meal.</p> : null}
        {groups.map(({ meal, items }) => (
          <div className="group" key={meal}>
            <div className="group-head">
              <h2 className="caps">{meal}</h2>
              <span className="item-val eaten" style={{ fontSize: 15 }}>
                {formatKcal(items.reduce((s, i) => s + i.kcal, 0))}
              </span>
            </div>
            {items.map((f) => (
              <div className="food-row" key={f.id}>
                <div className="item-main">
                  <span>{f.name}</span>
                  <span className="small muted">{f.amount}</span>
                </div>
                <span style={{ fontWeight: 500 }}>{formatKcal(f.kcal)}</span>
                <button type="button" className="icon-btn" aria-label={`Remove ${f.name}`} onClick={() => onRemove(f.id)}>
                  <Icon name="trash" size={18} />
                </button>
              </div>
            ))}
          </div>
        ))}
      </section>

      {sheet === 'scan' ? (
        <ScanSheet
          onClose={close}
          onAdd={(f) => {
            onAdd(f);
            close();
          }}
          onManual={(code) => {
            setPrefillCode(code);
            setSheet('manual');
          }}
        />
      ) : null}
      {sheet === 'manual' ? (
        <ManualSheet
          barcode={prefillCode}
          onClose={close}
          onAdd={(f) => {
            onAdd(f);
            close();
          }}
        />
      ) : null}
    </main>
  );
}

function Macro({ label, value, target }: { label: string; value: number; target: number }) {
  return (
    <div className="stack" style={{ gap: 6 }}>
      <span className="tiny muted" style={{ fontWeight: 500 }}>
        {label}
      </span>
      <span style={{ fontWeight: 600 }}>
        {value} <span className="muted" style={{ fontWeight: 400 }}>/ {target} g</span>
      </span>
      <Meter value={value} max={target} />
    </div>
  );
}

type Phase =
  | { k: 'scan' }
  | { k: 'loading'; code: string }
  | { k: 'found'; product: Product }
  | { k: 'missing'; code: string }
  | { k: 'error'; code: string };

function ScanSheet({ onClose, onAdd, onManual }: { onClose: () => void; onAdd: (f: NewFood) => void; onManual: (code?: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [phase, setPhase] = useState<Phase>({ k: 'scan' });
  const [cameraFailed, setCameraFailed] = useState(false);
  const [typed, setTyped] = useState('');

  const lookup = useCallback(async (code: string) => {
    setPhase({ k: 'loading', code });
    try {
      const product = await lookupBarcode(code);
      setPhase(product ? { k: 'found', product } : { k: 'missing', code });
    } catch {
      setPhase({ k: 'error', code });
    }
  }, []);

  const scanning = phase.k === 'scan';
  useEffect(() => {
    const video = videoRef.current;
    if (!scanning || !video) return;
    let done = false;
    let scanner: Scanner | undefined;
    startScanner(video, (code) => {
      if (done) return;
      done = true;
      scanner?.stop();
      void lookup(code);
    })
      .then((s) => {
        if (done) s.stop();
        else scanner = s;
      })
      .catch(() => {
        if (!done) setCameraFailed(true);
      });
    return () => {
      done = true;
      scanner?.stop();
    };
  }, [scanning, lookup]);

  return (
    <Sheet title="Scan barcode" onClose={onClose}>
      {phase.k === 'scan' ? (
        <>
          {cameraFailed ? (
            <p className="notice">The camera is not available here. Type the barcode number instead.</p>
          ) : (
            <div className="camera">
              <video ref={videoRef} playsInline muted aria-label="Camera preview" />
              <div className="camera-guide" aria-hidden="true" />
            </div>
          )}
          <p className="small muted">Hold the barcode on the line. It is read automatically.</p>
          <div className="row" style={{ alignItems: 'flex-end' }}>
            <div className="grow">
              <TextField label="Or type the barcode number" value={typed} onChange={setTyped} numeric />
            </div>
            <button type="button" className="btn btn-ink" disabled={!isBarcode(typed)} onClick={() => void lookup(typed.trim())}>
              Look up
            </button>
          </div>
        </>
      ) : null}

      {phase.k === 'loading' ? (
        <p className="empty" role="status">
          Looking up {phase.code}…
        </p>
      ) : null}

      {phase.k === 'found' ? <ProductForm product={phase.product} onAdd={onAdd} onManual={() => onManual(phase.product.code)} /> : null}

      {phase.k === 'missing' ? (
        <>
          <p className="notice">Barcode {phase.code} is not in the food database yet.</p>
          <div className="row">
            <button type="button" className="btn btn-outline grow" onClick={() => setPhase({ k: 'scan' })}>
              Scan again
            </button>
            <button type="button" className="btn btn-eaten grow" onClick={() => onManual(phase.code)}>
              Add manually
            </button>
          </div>
        </>
      ) : null}

      {phase.k === 'error' ? (
        <>
          <p className="notice" role="alert">
            Could not reach the food database. Check your connection and try again.
          </p>
          <div className="row">
            <button type="button" className="btn btn-outline grow" onClick={() => void lookup(phase.code)}>
              Try again
            </button>
            <button type="button" className="btn btn-eaten grow" onClick={() => onManual(phase.code)}>
              Add manually
            </button>
          </div>
        </>
      ) : null}
    </Sheet>
  );
}

function ProductForm({ product, onAdd, onManual }: { product: Product; onAdd: (f: NewFood) => void; onManual: () => void }) {
  const [grams, setGrams] = useState(String(product.servingG ?? 100));
  const [meal, setMeal] = useState<Meal>(() => mealForHour(new Date().getHours()));
  const g = parseNum(grams);
  const portion = g !== null && g > 0 ? scalePer100(product.per100, g) : null;

  if (product.incomplete) {
    return (
      <>
        <p className="notice">The database lists {product.name} but has no energy value for it.</p>
        <button type="button" className="btn btn-eaten" onClick={onManual}>
          Add manually
        </button>
      </>
    );
  }

  return (
    <>
      <div className="card stack" style={{ gap: 4 }}>
        <span style={{ fontSize: 17, fontWeight: 600 }}>{product.name}</span>
        <span className="small muted">
          {product.brand ? `${product.brand}, ` : ''}
          {formatKcal(product.per100.kcal)} kcal per 100 g
        </span>
      </div>
      <TextField label="Amount, grams" value={grams} onChange={setGrams} numeric big />
      <Segmented label="Meal" value={meal} onChange={setMeal} options={MEAL_OPTIONS} />
      <p className="small muted" role="status">
        {portion
          ? `${formatKcal(portion.kcal)} kcal, protein ${portion.protein} g, carbs ${portion.carbs} g, fat ${portion.fat} g`
          : 'Enter the amount you ate.'}
      </p>
      <button
        type="button"
        className="btn btn-eaten"
        disabled={!portion}
        onClick={() =>
          portion &&
          g !== null &&
          onAdd({ meal, name: product.name, amount: `${g} g`, barcode: product.code, ...portion })
        }
      >
        Add to {meal.toLowerCase()}
      </button>
    </>
  );
}

function ManualSheet({ barcode, onClose, onAdd }: { barcode?: string; onClose: () => void; onAdd: (f: NewFood) => void }) {
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [kcal, setKcal] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [meal, setMeal] = useState<Meal>(() => mealForHour(new Date().getHours()));

  const k = parseNum(kcal);
  const optional = (t: string) => (t.trim() === '' ? 0 : parseNum(t));
  const p = optional(protein);
  const c = optional(carbs);
  const f = optional(fat);
  const valid = name.trim() !== '' && k !== null && p !== null && c !== null && f !== null;

  return (
    <Sheet title="Add food" onClose={onClose}>
      <TextField label="Name" value={name} onChange={setName} placeholder="Lentil soup" />
      <div className="grid-2">
        <TextField label="Amount" value={amount} onChange={setAmount} placeholder="1 bowl" />
        <TextField label="Energy, kcal" value={kcal} onChange={setKcal} numeric />
      </div>
      <div className="grid-3" style={{ gap: 8 }}>
        <TextField label="Protein, g" value={protein} onChange={setProtein} numeric />
        <TextField label="Carbs, g" value={carbs} onChange={setCarbs} numeric />
        <TextField label="Fat, g" value={fat} onChange={setFat} numeric />
      </div>
      <Segmented label="Meal" value={meal} onChange={setMeal} options={MEAL_OPTIONS} />
      <button
        type="button"
        className="btn btn-eaten"
        disabled={!valid}
        onClick={() =>
          valid &&
          onAdd({
            meal,
            name: name.trim(),
            amount: amount.trim() || '1 serving',
            kcal: Math.round(k),
            protein: p,
            carbs: c,
            fat: f,
            barcode,
          })
        }
      >
        Add to {meal.toLowerCase()}
      </button>
    </Sheet>
  );
}
