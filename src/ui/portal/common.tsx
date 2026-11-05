import type { ReactNode } from 'react'

/**
 * Presentation pieces shared by the administrator and lecturer portals.
 *
 * Both portals are management interfaces, so they share the vocabulary — cards,
 * stat tiles, bar lists, tables, empty/error states — while each keeps its own
 * layout and tone.
 */

export function formatNumber(value: number): string {
  return value.toLocaleString('en-NG')
}

/** Nigerian naira, with separators — administrators need exact figures. */
export function formatMoney(value: number): string {
  return `₦${Math.round(value).toLocaleString('en-NG')}`
}

export function formatPercent(ratio: number): string {
  if (!Number.isFinite(ratio)) return '—'
  return `${Math.round(ratio * 100)}%`
}

export function formatRelative(iso: string): string {
  const then = Date.parse(iso)
  if (!Number.isFinite(then)) return '—'
  const seconds = Math.round((Date.now() - then) / 1000)
  if (seconds < 45) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(then).toLocaleDateString()
}

/** "auth.login" → "Sign in", for the activity feed. */
export function humaniseAction(action: string): string {
  const map: Record<string, string> = {
    'auth.register': 'Account created',
    'auth.verify_email': 'Email verified',
    'auth.login': 'Signed in',
    'auth.login_failed': 'Failed sign-in',
    'auth.login_blocked': 'Suspended sign-in blocked',
    'profile.create': 'Business created',
    'profile.update': 'Business profile updated',
    'progress.start': 'Entered the city',
    'admin.player.suspend': 'Player suspended',
    'admin.player.restore': 'Player restored',
  }
  return map[action] ?? action.replace(/[._]/g, ' ')
}

export function feedTone(action: string): string {
  if (action.startsWith('admin.')) return 'pf-feed__dot--admin'
  if (action.includes('failed') || action.includes('blocked')) return 'pf-feed__dot--warn'
  if (action.startsWith('auth.')) return 'pf-feed__dot--auth'
  return ''
}

export function Card({
  title,
  meta,
  children,
  className = '',
}: {
  title?: string
  meta?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={`pf-card ${className}`.trim()}>
      {(title || meta) && (
        <header className="pf-card__head">
          {title && <h2 className="pf-card__title">{title}</h2>}
          {meta && <span className="pf-card__meta">{meta}</span>}
        </header>
      )}
      {children}
    </section>
  )
}

export function StatTile({
  label,
  value,
  sub,
  tone = '',
}: {
  label: string
  value: string
  sub?: string
  tone?: '' | 'accent' | 'good' | 'warn'
}) {
  return (
    <div className={`pf-stat${tone ? ` pf-stat--${tone}` : ''}`}>
      <div className="pf-stat__label">{label}</div>
      <div className="pf-stat__value">{value}</div>
      {sub && <div className="pf-stat__sub">{sub}</div>}
    </div>
  )
}

export interface BarDatum {
  label: string
  value: number
  /** Text shown at the end of the row. Defaults to the value. */
  display?: string
  tone?: '' | 'orange' | 'green'
}

/** A horizontal bar list, sized against the largest value present. */
export function BarList({ data, empty }: { data: BarDatum[]; empty: string }) {
  if (data.length === 0) return <p className="pf-card__note">{empty}</p>
  const max = Math.max(...data.map((d) => d.value), 1)

  return (
    <div className="pf-bars">
      {data.map((d) => (
        <div className="pf-bar" key={d.label}>
          <span className="pf-bar__label" title={d.label}>
            {d.label}
          </span>
          <span className="pf-bar__track">
            <span
              className={`pf-bar__fill${d.tone ? ` pf-bar__fill--${d.tone}` : ''}`}
              style={{ width: `${Math.max((d.value / max) * 100, d.value > 0 ? 3 : 0)}%` }}
            />
          </span>
          <span className="pf-bar__value">{d.display ?? formatNumber(d.value)}</span>
        </div>
      ))}
    </div>
  )
}

/** A compact column plot, used for a short daily series. */
export function ColumnPlot({
  points,
  empty,
}: {
  points: { label: string; value: number }[]
  empty: string
}) {
  if (points.length === 0) return <p className="pf-card__note">{empty}</p>
  const max = Math.max(...points.map((p) => p.value), 1)

  return (
    <div>
      <div className="pf-plot__scale">
        <span>peak {formatNumber(max)}</span>
        <span>{points.reduce((sum, p) => sum + p.value, 0)} total</span>
      </div>
      <div className="pf-plot">
        {points.map((p) => (
          <div className="pf-plot__col" key={p.label} title={`${p.label}: ${p.value}`}>
            <div
              className={`pf-plot__bar${p.value === 0 ? ' pf-plot__bar--zero' : ''}`}
              style={{ height: `${(p.value / max) * 100}%` }}
            />
            <span className="pf-plot__day">{p.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function Badge({ children, tone = '' }: { children: ReactNode; tone?: '' | 'good' | 'warn' | 'bad' }) {
  return <span className={`pf-badge${tone ? ` pf-badge--${tone}` : ''}`}>{children}</span>
}

export function StateBlock({
  loading,
  error,
  empty,
  onRetry,
}: {
  loading: boolean
  error: string | null
  empty?: string
  onRetry?: () => void
}) {
  if (loading) {
    return (
      <div className="pf-card">
        <div className="pf-skeleton" style={{ height: 14, width: '38%', marginBottom: 12 }} />
        <div className="pf-skeleton" style={{ height: 14, width: '72%', marginBottom: 12 }} />
        <div className="pf-skeleton" style={{ height: 14, width: '56%' }} />
      </div>
    )
  }

  if (error) {
    return (
      <div className="pf-card">
        <div className="pf-state pf-state--error">
          <p>{error}</p>
          {onRetry && (
            <button className="fo-btn fo-btn--ghost pf-retry" type="button" onClick={onRetry}>
              Try again
            </button>
          )}
        </div>
      </div>
    )
  }

  if (empty) {
    return (
      <div className="pf-card">
        <div className="pf-state">{empty}</div>
      </div>
    )
  }

  return null
}
