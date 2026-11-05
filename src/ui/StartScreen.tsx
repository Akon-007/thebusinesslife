import { useState } from 'react'
import { useGameStore } from '../state/gameStore'
import { useWorldStore } from '../state/worldStore'
import { AVATAR_OPTIONS } from '../data/avatars'

const KEY_HINTS: { keys: string; label: string }[] = [
  { keys: 'W A S D', label: 'Move around the city' },
  { keys: 'Shift', label: 'Sprint' },
  { keys: 'Drag', label: 'Orbit the camera' },
  { keys: 'Scroll', label: 'Zoom in and out' },
  { keys: 'E', label: 'Talk / enter a building' },
]

/**
 * The entry point. The player names themselves and their company, then walks
 * straight into the city — there is no separate menu screen to get lost in.
 */
export function StartScreen({ onStart }: { onStart: () => void }) {
  const storedName = useGameStore((s) => s.playerName)
  const storedBusiness = useGameStore((s) => s.businessName)
  const completed = useGameStore((s) => s.completedMissions.length)
  const resetGame = useGameStore((s) => s.resetGame)

  const [name, setName] = useState(storedName === 'You' ? '' : storedName)
  const [business, setBusiness] = useState(storedBusiness)
  const [avatarId, setAvatarId] = useState(useGameStore.getState().avatarId)

  const hasProgress = completed > 0 || useGameStore.getState().levelIndex > 1

  function begin() {
    useGameStore.setState({
      playerName: name.trim() || 'You',
      businessName: business.trim() || 'BusinessLife Ltd',
      avatarId,
    })
    useWorldStore.getState().setOverlay(false)
    onStart()
  }

  function startOver() {
    resetGame()
    setName('')
    setBusiness('BusinessLife Ltd')
  }

  return (
    <div className="start-screen">
      <div className="start-card">
        <h1 className="start-logo">BUSINESSLIFE</h1>
        <p className="start-tagline">Build a company in the city</p>

        <div className="avatar-picker" aria-label="Choose your character">
          {AVATAR_OPTIONS.map((avatar) => (
            <button
              type="button"
              key={avatar.id}
              className={`avatar-choice${avatar.id === avatarId ? ' avatar-choice--selected' : ''}`}
              onClick={() => setAvatarId(avatar.id)}
              title={`${avatar.name} — ${avatar.role}`}
            >
              <span className="avatar-portrait" style={{ background: `linear-gradient(145deg, ${avatar.accent}, ${avatar.tone})` }}>
                {avatar.name.slice(0, 1)}
              </span>
              <span>{avatar.name}</span>
            </button>
          ))}
        </div>

        <p className="start-body">
          Lagos is awake and the market never closes. Walk the districts, talk to
          traders, regulators, suppliers and investors, and take a business from a
          folder of notes all the way to break-even. Every person on the street has
          something you need — but none of them will come to you.
        </p>

        <div className="start-fields">
          <div className="field">
            <label htmlFor="player-name">Your name</label>
            <input
              id="player-name"
              value={name}
              maxLength={24}
              placeholder="e.g. Ada"
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') begin()
              }}
            />
          </div>
          <div className="field">
            <label htmlFor="business-name">Company name</label>
            <input
              id="business-name"
              value={business}
              maxLength={32}
              placeholder="e.g. Ada Logistics"
              onChange={(e) => setBusiness(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') begin()
              }}
            />
          </div>
        </div>

        <div className="key-hints">
          {KEY_HINTS.map((h) => (
            <div className="key-hint" key={h.keys}>
              <span className="key">{h.keys}</span>
              <span>{h.label}</span>
            </div>
          ))}
        </div>

        <div className="modal-actions" style={{ justifyContent: 'center' }}>
          {hasProgress && (
            <button type="button" className="btn btn--ghost" onClick={startOver}>
              Start over
            </button>
          )}
          <button type="button" className="btn btn--primary" onClick={begin}>
            {hasProgress ? 'Continue in the city' : 'Enter the city'}
          </button>
        </div>
      </div>
    </div>
  )
}
