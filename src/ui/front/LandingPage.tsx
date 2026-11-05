import { Link } from 'react-router-dom'

/**
 * Screen 01 — the public landing page. First impression of the game, and the
 * route into account creation.
 */
export function LandingPage() {
  return (
    <div className="front">
      <header className="fo-topbar">
        <div className="fo-brand">
          <span className="fo-brand__mark">B</span>
          <span>BUSINESSLIFE</span>
        </div>
        <nav className="fo-nav">
          <Link className="fo-btn fo-btn--ghost" to="/login">
            Log In
          </Link>
          <Link className="fo-btn fo-btn--primary" to="/register">
            Start Your Business
          </Link>
        </nav>
      </header>

      <section className="fo-hero">
        <div>
          <span className="fo-hero__eyebrow">Business simulation</span>
          <h1 className="fo-hero__title">
            Build. Trade. <em>Grow.</em>
          </h1>
          <p className="fo-hero__sub">
            Start with an idea and a small amount of capital, then build a real business
            inside a living city. Find customers, negotiate with suppliers, hire a team
            and raise your first investment — one decision at a time.
          </p>
          <div className="fo-hero__actions">
            <Link className="fo-btn fo-btn--primary" to="/register">
              Start Your Business
            </Link>
            <Link className="fo-btn fo-btn--ghost" to="/login">
              Log In
            </Link>
          </div>
          <p className="fo-hero__hint">
            Think your first move through. In BUSINESSLIFE there is no undo, only the next decision.
          </p>
        </div>

        <IsoCity />
      </section>

      <section className="fo-section">
        <h2 className="fo-section__title">What you will do</h2>
        <p className="fo-section__sub">Three things this game asks of you from day one.</p>
        <div className="fo-cards">
          <article className="fo-card">
            <div className="fo-card__icon">
              <IconBriefcase />
            </div>
            <h3 className="fo-card__title">Start and run a business</h3>
            <p className="fo-card__body">
              Choose an industry, register a company, find premises and get your first
              paying customers through the door.
            </p>
          </article>

          <article className="fo-card fo-card--orange">
            <div className="fo-card__icon">
              <IconChat />
            </div>
            <h3 className="fo-card__title">Learn by doing</h3>
            <p className="fo-card__body">
              Every mission puts you in front of real characters — customers, suppliers,
              officials and investors. The decisions you make shape how they respond.
            </p>
          </article>

          <article className="fo-card fo-card--green">
            <div className="fo-card__icon">
              <IconChart />
            </div>
            <h3 className="fo-card__title">Build your empire</h3>
            <p className="fo-card__body">
              Grow from a beginner with one idea into an established, funded company with
              a board, a team and a market of its own.
            </p>
          </article>
        </div>
      </section>

      <footer className="fo-footer">
        <span>BUSINESSLIFE — business simulation game</span>
        <span className="fo-footer__links">
          <a href="#how-to-play">How to Play</a>
          <Link to="/login">Log In</Link>
          <Link to="/register">Create Account</Link>
        </span>
      </footer>
    </div>
  )
}

/** A lightweight isometric city block, drawn entirely in CSS. */
function IsoCity() {
  const blocks = [
    { left: '26%', top: '34%', w: 46, h: 64, cls: 'blue' },
    { left: '42%', top: '24%', w: 40, h: 88, cls: 'navy' },
    { left: '57%', top: '40%', w: 52, h: 52, cls: 'white' },
    { left: '38%', top: '54%', w: 44, h: 40, cls: 'orange' },
    { left: '60%', top: '60%', w: 38, h: 44, cls: 'green' },
    { left: '22%', top: '58%', w: 34, h: 34, cls: 'white' },
  ]

  return (
    <div className="fo-iso" aria-hidden="true">
      <div className="fo-iso__sun" />
      <div className="fo-iso__ground" />
      {blocks.map((b, i) => (
        <div
          key={i}
          className={`fo-iso__block fo-iso__block--${b.cls}`}
          style={{ left: b.left, top: b.top, width: b.w, height: b.h }}
        />
      ))}
      <div className="fo-iso__pin" style={{ left: '40%', top: '40%', background: '#f5a623' }} />
      <div
        className="fo-iso__pin"
        style={{ left: '63%', top: '30%', background: '#315bea', animationDelay: '0.7s' }}
      />
      <div
        className="fo-iso__pin"
        style={{ left: '52%', top: '62%', background: '#32b879', animationDelay: '1.3s' }}
      />
    </div>
  )
}

function IconBriefcase() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
      <rect x="3" y="7.5" width="18" height="12" rx="2.2" />
      <path d="M8.5 7.5V6a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v1.5M3 12.5h18" />
    </svg>
  )
}

function IconChat() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
      <path d="M20 12.5a7.5 7.5 0 0 1-10.9 6.7L4 20.5l1.4-4.4A7.5 7.5 0 1 1 20 12.5z" />
    </svg>
  )
}

function IconChart() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
      <path d="M4 19.5h16M7 19.5V11m5 8.5V5.5m5 14v-6" />
    </svg>
  )
}
