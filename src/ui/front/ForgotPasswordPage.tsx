import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../state/authStore'

const CODE_LENGTH = 6
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Screen — password recovery. Step one asks for the email and triggers the
 * server's reset code; step two collects that code plus the new password.
 *
 * The code is never returned by the API, so this screen only carries the email
 * forward and lets the server judge the code.
 */
export function ForgotPasswordPage() {
  const navigate = useNavigate()
  const requestPasswordReset = useAuthStore((s) => s.requestPasswordReset)
  const resetPassword = useAuthStore((s) => s.resetPassword)
  const resetEmail = useAuthStore((s) => s.resetEmail)
  const storeError = useAuthStore((s) => s.error)
  const setError = useAuthStore((s) => s.setError)

  const [step, setStep] = useState<'email' | 'reset'>('email')
  const [email, setEmail] = useState('')
  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(''))
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const inputs = useRef<(HTMLInputElement | null)[]>([])

  useEffect(() => {
    setError(null)
  }, [setError])

  // Move focus into the code boxes as soon as the second step opens.
  useEffect(() => {
    if (step === 'reset') inputs.current[0]?.focus()
  }, [step])

  const code = digits.join('')
  const passwordsMatch = confirm.length === 0 || confirm === password
  const canRequest = EMAIL_PATTERN.test(email.trim()) && !submitting
  const canReset =
    code.length === CODE_LENGTH && password.length >= 8 && confirm === password && !submitting

  async function handleRequest(event: React.FormEvent) {
    event.preventDefault()
    if (!canRequest) return

    setLocalError(null)
    setSubmitting(true)
    try {
      await requestPasswordReset(email.trim())
      setStep('reset')
    } catch {
      /* the store holds the server's message */
    } finally {
      setSubmitting(false)
    }
  }

  function writeDigit(index: number, raw: string) {
    const numeric = raw.replace(/\D/g, '')
    setLocalError(null)

    if (numeric.length > 1) {
      // A pasted code fills the boxes in order.
      const next = [...digits]
      for (let i = 0; i < CODE_LENGTH - index && i < numeric.length; i += 1) {
        next[index + i] = numeric[i]
      }
      setDigits(next)
      const lastFilled = Math.min(index + numeric.length, CODE_LENGTH - 1)
      inputs.current[lastFilled]?.focus()
      return
    }

    const next = [...digits]
    next[index] = numeric
    setDigits(next)
    if (numeric && index < CODE_LENGTH - 1) inputs.current[index + 1]?.focus()
  }

  function handleKeyDown(index: number, event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Backspace' && !digits[index] && index > 0) {
      event.preventDefault()
      const next = [...digits]
      next[index - 1] = ''
      setDigits(next)
      inputs.current[index - 1]?.focus()
    }
    if (event.key === 'ArrowLeft' && index > 0) inputs.current[index - 1]?.focus()
    if (event.key === 'ArrowRight' && index < CODE_LENGTH - 1) inputs.current[index + 1]?.focus()
  }

  async function handleReset(event: React.FormEvent) {
    event.preventDefault()
    const target = resetEmail ?? email.trim()
    if (!canReset || !target) return

    setLocalError(null)
    setSubmitting(true)
    try {
      await resetPassword(target, code, password)
      navigate('/login', {
        replace: true,
        state: { notice: 'Your password has been updated. Sign in with your new password.' },
      })
    } catch {
      setSubmitting(false)
      setDigits(Array(CODE_LENGTH).fill(''))
      inputs.current[0]?.focus()
    }
  }

  function backToEmail() {
    setError(null)
    setLocalError(null)
    setDigits(Array(CODE_LENGTH).fill(''))
    setPassword('')
    setConfirm('')
    setStep('email')
  }

  const message = localError ?? storeError

  return (
    <div className="front">
      <div className="fo-auth">
        <div className="fo-auth__shell">
          <Link className="fo-auth__brand" to="/" style={{ textDecoration: 'none', color: 'inherit' }}>
            <span className="fo-brand__mark">B</span>
            <span>BUSINESSLIFE</span>
          </Link>

          <div className="fo-auth__card">
            {step === 'email' ? (
              <>
                <h1 className="fo-auth__title">Reset your password</h1>
                <p className="fo-auth__sub">
                  Enter the email on your account and we&apos;ll send a 6-digit reset code.
                </p>

                <form onSubmit={handleRequest} noValidate>
                  {message && <div className="fo-error">{message}</div>}

                  <div className="fo-field">
                    <label className="fo-label" htmlFor="reset-email">
                      Email address
                    </label>
                    <div className="fo-input-wrap">
                      <input
                        id="reset-email"
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

                  <button className="fo-btn fo-btn--primary fo-btn--block" type="submit" disabled={!canRequest}>
                    {submitting ? 'Sending code…' : 'Send Reset Code'}
                  </button>
                </form>

                <p className="fo-auth__foot">
                  Remembered it? <Link to="/login">Back to sign in</Link>
                </p>
              </>
            ) : (
              <>
                <h1 className="fo-auth__title">Choose a new password</h1>
                <p className="fo-auth__sub">
                  Enter the 6-digit code sent to{' '}
                  <span className="fo-mail">{resetEmail ?? email}</span> and pick a new password.
                </p>

                <div className="fo-devnote">
                  In this environment no mail provider is configured, so the reset code is printed to
                  the server console instead.
                </div>

                {message && <div className="fo-error">{message}</div>}

                <form onSubmit={handleReset} noValidate>
                  <div className="fo-code">
                    {digits.map((digit, index) => (
                      <input
                        key={index}
                        ref={(el) => {
                          inputs.current[index] = el
                        }}
                        className={digit ? 'fo-code__box fo-code__box--filled' : 'fo-code__box'}
                        value={digit}
                        onChange={(e) => writeDigit(index, e.target.value)}
                        onKeyDown={(e) => handleKeyDown(index, e)}
                        inputMode="numeric"
                        autoComplete={index === 0 ? 'one-time-code' : 'off'}
                        maxLength={CODE_LENGTH}
                        aria-label={`Digit ${index + 1}`}
                      />
                    ))}
                  </div>

                  <div className="fo-field" style={{ marginTop: 18 }}>
                    <label className="fo-label" htmlFor="reset-password">
                      New password
                    </label>
                    <div className="fo-input-wrap">
                      <input
                        id="reset-password"
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
                  </div>

                  <div className="fo-field">
                    <label className="fo-label" htmlFor="reset-confirm">
                      Confirm new password
                    </label>
                    <div className="fo-input-wrap">
                      <input
                        id="reset-confirm"
                        className={
                          passwordsMatch
                            ? 'fo-input fo-input--with-toggle'
                            : 'fo-input fo-input--with-toggle fo-input--invalid'
                        }
                        type={showPassword ? 'text' : 'password'}
                        value={confirm}
                        onChange={(e) => setConfirm(e.target.value)}
                        placeholder="Re-enter your new password"
                        autoComplete="new-password"
                        maxLength={200}
                      />
                    </div>
                    {!passwordsMatch && <p className="fo-field-error">Passwords do not match.</p>}
                  </div>

                  <button className="fo-btn fo-btn--primary fo-btn--block" type="submit" disabled={!canReset}>
                    {submitting ? 'Updating password…' : 'Update Password'}
                  </button>
                </form>

                <div className="fo-actions-row">
                  <button className="fo-link-btn" type="button" onClick={backToEmail}>
                    Use a different email
                  </button>
                  <button className="fo-link-btn" type="button" onClick={() => navigate('/login')}>
                    Back to sign in
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
