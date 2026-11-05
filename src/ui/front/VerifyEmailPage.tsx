import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../state/authStore'
import { homePathFor } from './homePath'

const CODE_LENGTH = 6

/**
 * Screen 03 — email verification. The code is checked by the server; this
 * screen only collects it and handles the small conveniences (paste, backspace,
 * auto-submit).
 */
export function VerifyEmailPage() {
  const navigate = useNavigate()
  const pendingEmail = useAuthStore((s) => s.pendingEmail)
  const status = useAuthStore((s) => s.status)
  const user = useAuthStore((s) => s.user)
  const profile = useAuthStore((s) => s.profile)
  const devCode = useAuthStore((s) => s.devCode)
  const storeError = useAuthStore((s) => s.error)
  const verifyEmail = useAuthStore((s) => s.verifyEmail)
  const resendCode = useAuthStore((s) => s.resendCode)

  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(''))
  const [submitting, setSubmitting] = useState(false)
  const [resent, setResent] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const inputs = useRef<(HTMLInputElement | null)[]>([])

  useEffect(() => {
    inputs.current[0]?.focus()
  }, [])

  // Registration is the only way here, so a missing email means a stray visit.
  useEffect(() => {
    if (status === 'authenticated' && user) {
      navigate(homePathFor(user, profile), { replace: true })
      return
    }
    if (!pendingEmail) navigate('/register', { replace: true })
  }, [pendingEmail, navigate, profile, status, user])

  const code = digits.join('')

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

  async function submit(event?: React.FormEvent) {
    event?.preventDefault()
    if (code.length !== CODE_LENGTH || submitting) return

    setSubmitting(true)
    setLocalError(null)
    try {
      await verifyEmail(code)
      const { user, profile } = useAuthStore.getState()
      if (user) navigate(homePathFor(user, profile), { replace: true })
    } catch {
      setSubmitting(false)
      setDigits(Array(CODE_LENGTH).fill(''))
      inputs.current[0]?.focus()
    }
  }

  async function handleResend() {
    setLocalError(null)
    setResent(false)
    await resendCode()
    setResent(true)
    setDigits(Array(CODE_LENGTH).fill(''))
    inputs.current[0]?.focus()
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
            <h1 className="fo-auth__title">Verify your email</h1>
            <p className="fo-auth__sub">
              We sent a 6-digit code to <span className="fo-mail">{pendingEmail ?? 'your email'}</span>.
              Enter it below.
            </p>

            {devCode && (
              <div className="fo-devnote">
                No mail provider is configured in this environment, so the code is shown here
                instead: <strong>{devCode}</strong>
              </div>
            )}

            {message && <div className="fo-error">{message}</div>}
            {resent && !message && <div className="fo-notice">A new code is on its way.</div>}

            <form onSubmit={submit}>
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

              <div className="fo-actions-row">
                <button
                  className="fo-btn fo-btn--primary"
                  type="submit"
                  disabled={code.length !== CODE_LENGTH || submitting}
                >
                  {submitting ? 'Verifying…' : 'Verify'}
                </button>
              </div>
            </form>

            <div className="fo-actions-row">
              <button className="fo-link-btn" type="button" onClick={handleResend}>
                Resend Code
              </button>
              <button className="fo-link-btn" type="button" onClick={() => navigate('/register')}>
                Change email
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
