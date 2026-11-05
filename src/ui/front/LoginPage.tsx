import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ApiError } from '../../api/client'
import { useAuthStore } from '../../state/authStore'
import { homePathFor } from './homePath'

/** Sign-in for every role. Where you land is decided by the role on the account. */
export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const login = useAuthStore((s) => s.login)
  const storeError = useAuthStore((s) => s.error)

  // Set by the reset screen once a new password has been saved.
  const notice = (location.state as { notice?: string } | null)?.notice ?? null

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (submitting) return

    setSubmitting(true)
    try {
      await login(email.trim(), password)
      const { user, profile } = useAuthStore.getState()
      if (user) {
        navigate(homePathFor(user, profile), { replace: true })
        return
      }
      setSubmitting(false)
    } catch (error) {
      // An unverified account is sent straight back to the code screen.
      if (error instanceof ApiError && error.status === 403) {
        const details = (error.details ?? {}) as Record<string, unknown>
        if (details.code === 'EMAIL_NOT_VERIFIED') {
          navigate('/verify')
          return
        }
      }
      setSubmitting(false)
    }
  }

  const canSubmit = email.trim().length > 0 && password.length > 0 && !submitting

  return (
    <div className="front">
      <div className="fo-auth">
        <div className="fo-auth__shell">
          <Link className="fo-auth__brand" to="/" style={{ textDecoration: 'none', color: 'inherit' }}>
            <span className="fo-brand__mark">B</span>
            <span>BUSINESSLIFE</span>
          </Link>

          <div className="fo-auth__card">
            <h1 className="fo-auth__title">Welcome back</h1>
            <p className="fo-auth__sub">Sign in to continue building your business.</p>

            <form onSubmit={handleSubmit} noValidate>
              {notice && <div className="fo-notice">{notice}</div>}
              {storeError && <div className="fo-error">{storeError}</div>}

              <div className="fo-field">
                <label className="fo-label" htmlFor="login-email">
                  Email address
                </label>
                <div className="fo-input-wrap">
                  <input
                    id="login-email"
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
                <label className="fo-label" htmlFor="login-password">
                  Password
                </label>
                <div className="fo-input-wrap">
                  <input
                    id="login-password"
                    className="fo-input fo-input--with-toggle"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Your password"
                    autoComplete="current-password"
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
              </div>

              <div className="fo-auth__forgot">
                <Link to="/forgot-password">Forgot password?</Link>
              </div>

              <button className="fo-btn fo-btn--primary fo-btn--block" type="submit" disabled={!canSubmit}>
                {submitting ? 'Signing in…' : 'Sign In'}
              </button>
            </form>

            <p className="fo-auth__foot">
              New here? <Link to="/register">Create an account</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
