import { Icon } from '../ui';

/** The app mark: an orange half (food) and a blue half (activity). */
export function BrandMark({ size }: { size: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 108 108">
      <rect width="108" height="108" rx="24" fill="#0E1A2B" />
      <path d="M51.5 24A30 30 0 0 0 51.5 84Z" fill="#F58A3C" />
      <path d="M56.5 24A30 30 0 0 1 56.5 84Z" fill="#6FA2FF" />
    </svg>
  );
}

const POINTS: { icon: string; text: string }[] = [
  { icon: 'barcode', text: 'Scan or search food in English or Arabic' },
  { icon: 'activity', text: 'Track runs, walks and rides' },
  { icon: 'team', text: 'Keep each other going in a private team' },
];

/** First screen of a new install, before the profile questions. */
export function Welcome({ onStart }: { onStart: () => void }) {
  return (
    <main className="welcome">
      <div className="welcome-brand">
        <BrandMark size={48} />
        <span>Balance</span>
      </div>

      <div className="stack" style={{ gap: 14 }}>
        <h1 className="welcome-title">
          <span style={{ color: 'var(--eaten)' }}>Eat.</span> <span style={{ color: '#6FA2FF' }}>Move.</span>
          <br />
          Stay accountable.
        </h1>
        <p className="welcome-lead">One number a day: what you ate, against how much you moved.</p>
      </div>

      <ul className="welcome-list">
        {POINTS.map((p) => (
          <li key={p.icon}>
            <span className="welcome-icon" aria-hidden="true">
              <Icon name={p.icon} size={22} />
            </span>
            <span>{p.text}</span>
          </li>
        ))}
      </ul>

      <div className="stack" style={{ gap: 14 }}>
        <button type="button" className="btn btn-eaten" onClick={onStart}>
          Get started
        </button>
        <p className="welcome-fine">
          No account needed. Your logs stay on this phone. Moving from another phone? You can restore a backup on the next screen.
        </p>
      </div>
    </main>
  );
}
