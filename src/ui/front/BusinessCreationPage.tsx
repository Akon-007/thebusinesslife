import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { sectorOptions } from '../../state/contentStore'
import { useAuthStore } from '../../state/authStore'
import { useGameStore } from '../../state/gameStore'

/**
 * Screen 05 — create your business. Four short steps, then the answers are
 * written to the database as the player's business profile.
 *
 * The sectors on offer, and the one-line description under each, are published
 * by the administrator portal; the catalogue is the fallback.
 */

const IDEA_SUGGESTIONS = [
  'Affordable ready-to-wear clothing for young professionals',
  'A lunch delivery service for busy office workers',
  'Phone repair and accessories shop',
  'Bulk foodstuff supply to small restaurants',
]

const STEPS = [
  { id: 1, title: "What's your business idea?", sub: 'One or two sentences is enough to begin.' },
  { id: 2, title: 'Choose your sector', sub: 'This shapes the market, the suppliers and the customers you will meet.' },
  { id: 3, title: 'Name your business', sub: 'You can change this later, but choose something you can grow into.' },
  { id: 4, title: 'Describe the business', sub: 'What problem does it solve, and what exactly does it sell?' },
]

export function BusinessCreationPage() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const saveProfile = useAuthStore((s) => s.saveProfile)
  const logout = useAuthStore((s) => s.logout)
  const avatarId = useGameStore((s) => s.avatarId)

  const [step, setStep] = useState(1)
  const [idea, setIdea] = useState('')
  const [sector, setSector] = useState('')
  const [businessName, setBusinessName] = useState('')
  const [description, setDescription] = useState('')
  const [problem, setProblem] = useState('')
  const [product, setProduct] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canAdvance = (() => {
    if (step === 1) return idea.trim().length >= 10
    if (step === 2) return sector.length > 0
    if (step === 3) return businessName.trim().length >= 2 && description.trim().length >= 10
    return problem.trim().length >= 10 && product.trim().length >= 2
  })()

  async function finish() {
    if (saving) return
    setSaving(true)
    setError(null)
    try {
      await saveProfile({
        businessName: businessName.trim(),
        sector,
        idea: idea.trim(),
        description: description.trim(),
        problem: problem.trim(),
        product: product.trim(),
        avatarId,
      })
      navigate('/play', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your business.')
      setSaving(false)
    }
  }

  function next() {
    if (!canAdvance) return
    if (step === 4) void finish()
    else setStep((s) => s + 1)
  }

  const current = STEPS[step - 1]

  return (
    <div className="front">
      <header className="fo-topbar">
        <div className="fo-brand">
          <span className="fo-brand__mark">B</span>
          <span>BUSINESSLIFE</span>
        </div>
        <nav className="fo-nav">
          <span style={{ fontSize: 13.5, color: 'var(--muted)' }}>{user?.fullName}</span>
          <button className="fo-btn fo-btn--ghost fo-btn--sm" type="button" onClick={logout}>
            Sign out
          </button>
        </nav>
      </header>

      <section className="fo-section" style={{ maxWidth: 760, paddingTop: 34 }}>
        <div className="fo-steps">
          {STEPS.map((s) => (
            <span
              key={s.id}
              className={
                s.id === step
                  ? 'fo-step fo-step--active'
                  : s.id < step
                    ? 'fo-step fo-step--done'
                    : 'fo-step'
              }
            >
              {s.id < step ? '✓' : s.id}
            </span>
          ))}
        </div>

        <div className="fo-card" style={{ padding: 30 }}>
          <p className="fo-step-count">
            Step {step} of {STEPS.length}
          </p>
          <h1 className="fo-section__title" style={{ fontSize: 24 }}>
            {current.title}
          </h1>
          <p className="fo-section__sub">{current.sub}</p>

          {error && <div className="fo-error">{error}</div>}

          {step === 1 && (
            <>
              <textarea
                className="fo-textarea"
                rows={4}
                value={idea}
                onChange={(e) => setIdea(e.target.value)}
                placeholder="Describe the business you want to build…"
                maxLength={400}
              />
              <div className="fo-chips">
                {IDEA_SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    className="fo-chip"
                    onClick={() => setIdea(suggestion)}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </>
          )}

          {step === 2 && (
            <div className="fo-sectors">
              {sectorOptions().map((option) => (
                <button
                  key={option.sector}
                  type="button"
                  className={option.sector === sector ? 'fo-sector fo-sector--selected' : 'fo-sector'}
                  onClick={() => setSector(option.sector)}
                >
                  <span className="fo-sector__text">
                    <span className="fo-sector__name">{option.sector}</span>
                    {option.briefing && <span className="fo-sector__brief">{option.briefing}</span>}
                  </span>
                  {option.sector === sector && <span className="fo-sector__tick">✓</span>}
                </button>
              ))}
            </div>
          )}

          {step === 3 && (
            <>
              <div className="fo-field">
                <label className="fo-label" htmlFor="biz-name">
                  Business name
                </label>
                <input
                  id="biz-name"
                  className="fo-input"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder="e.g. Ada Threads"
                  maxLength={60}
                />
              </div>
              <div className="fo-field">
                <label className="fo-label" htmlFor="biz-desc">
                  Short description
                </label>
                <textarea
                  id="biz-desc"
                  className="fo-textarea"
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What does the business do, and who is it for?"
                  maxLength={600}
                />
              </div>
            </>
          )}

          {step === 4 && (
            <>
              <div className="fo-field">
                <label className="fo-label" htmlFor="biz-problem">
                  The problem you are solving
                </label>
                <textarea
                  id="biz-problem"
                  className="fo-textarea"
                  rows={3}
                  value={problem}
                  onChange={(e) => setProblem(e.target.value)}
                  placeholder="What is painful, expensive or missing for your customer today?"
                  maxLength={600}
                />
              </div>
              <div className="fo-field">
                <label className="fo-label" htmlFor="biz-product">
                  What does it sell?
                </label>
                <input
                  id="biz-product"
                  className="fo-input"
                  value={product}
                  onChange={(e) => setProduct(e.target.value)}
                  placeholder="e.g. Ready-to-wear shirts, made to order"
                  maxLength={400}
                />
              </div>
            </>
          )}

          <div className="fo-step-actions">
            <button
              className="fo-btn fo-btn--ghost"
              type="button"
              onClick={() => setStep((s) => Math.max(1, s - 1))}
              disabled={step === 1}
            >
              Back
            </button>
            <button className="fo-btn fo-btn--primary" type="button" onClick={next} disabled={!canAdvance || saving}>
              {step === 4 ? (saving ? 'Setting up…' : 'Finish setup') : 'Continue'}
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}
