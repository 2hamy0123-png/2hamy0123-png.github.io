import { Icon } from '../ui';

/** Placeholder until private teams are connected in the next version. */
export function Team() {
  return (
    <main className="screen">
      <header className="head">
        <h1 className="title">Team</h1>
      </header>
      <section className="card stack" style={{ gap: 12, alignItems: 'flex-start' }}>
        <span className="badge badge-burned" aria-hidden="true">
          <Icon name="lock" size={18} />
        </span>
        <h2 style={{ fontSize: 17, fontWeight: 600 }}>Private teams are coming next</h2>
        <p className="muted">
          A team of 3 to 5 people will share a weekly goal in active minutes, keep a streak together and swap ideas. Only people you invite can join.
        </p>
        <p className="muted">Your own tracking works fully without a team.</p>
      </section>
    </main>
  );
}
