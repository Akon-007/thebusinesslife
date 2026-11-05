import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../state/authStore'
import { homePathFor } from './homePath'

/**
 * Screen 02 — account registration. Validates locally for fast feedback, then
 * creates the real account on the server, which is the only authority.
 */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const STRENGTH_LABEL = ['', 'Weak', 'Fair', 'Good', 'Strong']

/** Buckets a password into one of four strength levels. */
export function scorePassword(password: string): number {
  if (!password) return 0
  let points = 0
  if (password.length >= 8) points += 1
  if (password.length >= 12) points += 1
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) points += 1
  if (/\d/.test(password)) points += 1
  if (/[^A-Za-z0-9]/.test(password)) points += 1
  if (points <= 1) return 1
  if (points === 2) return 2
  if (points === 3) return 3
  return 4
}

export function RegisterPage() {
  const navigate = useNavigate()
  const register = useAuthStore((s) => s.register)

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [accepted, setAccepted] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const strength = useMemo(() => scorePassword(password), [password])

  const passwordsMatch = confirm.length === 0 || confirm === password
  const canSubmit =
    fullName.trim().length >= 2 &&
    EMAIL_PATTERN.test(email.trim()) &&
    password.length >= 8 &&
    confirm === password &&
    accepted &&
    !submitting

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setFormError(null)

    if (!canSubmit) {
      if (!accepted) setFormError('Please accept the Terms of Service to continue.')
      else if (confirm !== password) setFormError('Both passwords must match.')
      return
    }

    setSubmitting(true)
    try {
      await register(fullName.trim(), email.trim(), password)
      const { user, profile } = useAuthStore.getState()
      navigate(user ? homePathFor(user, profile) : '/verify')
    } catch {
      // The store already holds the server's message.
      setSubmitting(false)
    }
  }

  return (
    <div className="front">
      <div className="fo-auth">
        <div className="fo-auth__shell">
          <Link className="fo-auth__brand" to="/" style={{ textDecoration: 'none', color: 'inherit' }}>
            <span className="fo-brand__mark">B</span>
            <span>BUSINESSLIFE</span>
          </Link>

          <div className="fo-auth__card">
            <h1 className="fo-auth__title">Create your account</h1>
            <p className="fo-auth__sub">
              Your account keeps your business, your decisions and your progress safe.
            </p>

            <form onSubmit={handleSubmit} noValidate>
              {formError && <div className="fo-error">{formError}</div>}
              {notice && <div className="fo-notice">{notice}</div>}

              <div className="fo-field">
                <label className="fo-label" htmlFor="fullName">
                  Full name
                </label>
                <div className="fo-input-wrap">
                  <input
                    id="fullName"
                    className="fo-input"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g. Tunde Adeyemi"
                    autoComplete="name"
                    maxLength={80}
                  />
                </div>
              </div>

              <div className="fo-field">
                <label className="fo-label" htmlFor="email">
                  Email address
                </label>
                <div className="fo-input-wrap">
                  <input
                    id="email"
                    className="fo-input"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    autoComplete="email"
                    maxLength={255}
                  />
                </div>
              </div>

              <div className="fo-field">
                <label className="fo-label" htmlFor="password">
                  Password
                </label>
                <div className="fo-input-wrap">
                  <input
                    id="password"
                    className="fo-input fo-input--with-toggle"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    autoComplete="new-password"
                    maxLength={200}
                  />
                  <button
                    type="button"
                    className="fo-toggle"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>

                {password.length > 0 && (
                  <div className="fo-strength">
                    <div className="fo-strength__track">
                      {[1, 2, 3, 4].map((segment) => (
                        <span
                          key={segment}
                          className={
                            segment <= strength
                              ? `fo-strength__seg fo-strength__seg--on-${strength}`
                              : 'fo-strength__seg'
                          }
                        />
                      ))}
                    </div>
                    <div className="fo-strength__label">Password strength: {STRENGTH_LABEL[strength]}</div>
                  </div>
                )}
              </div>

              <div className="fo-field">
                <label className="fo-label" htmlFor="confirm">
                  Confirm password
                </label>
                <div className="fo-input-wrap">
                  <input
                    id="confirm"
                    className={
                      passwordsMatch
                        ? 'fo-input fo-input--with-toggle'
                        : 'fo-input fo-input--with-toggle fo-input--invalid'
                    }
                    type={showConfirm ? 'text' : 'password'}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="Re-enter your password"
                    autoComplete="new-password"
                    maxLength={200}
                  />
                  <button
                    type="button"
                    className="fo-toggle"
                    onClick={() => setShowConfirm((v) => !v)}
                    aria-label={showConfirm ? 'Hide password' : 'Show password'}
                  >
                    {showConfirm ? 'Hide' : 'Show'}
                  </button>
                </div>
                {!passwordsMatch && <p className="fo-field-error">Passwords do not match.</p>}
              </div>

              <label className="fo-check">
                <input
                  type="checkbox"
                  checked={accepted}
                  onChange={(e) => setAccepted(e.target.checked)}
                />
                <span>
                  I agree to the <a href="#terms">Terms of Service</a> and{' '}
                  <a href="#privacy">Privacy Policy</a>.
                </span>
              </label>

              <button className="fo-btn fo-btn--primary fo-btn--block" type="submit" disabled={!canSubmit}>
                {submitting ? 'Creating account…' : 'Create Account'}
              </button>
            </form>

            <div className="fo-divider">or</div>

            <button
              type="button"
              className="fo-btn fo-btn--google fo-btn--block"
              onClick={() =>
                setNotice(
                  'Google sign-in is not configured in this environment. Use the email form above.',
                )
              }
            >
              <GoogleMark />
              Sign up with Google
            </button>

            <p className="fo-auth__foot">
              Already have an account? <Link to="/login">Sign In</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

function GoogleMark() {
  return (
    <svg width="17" height="17" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"
      />
      <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z" />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"
      />
    </svg>
  )
}
