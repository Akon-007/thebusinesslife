import { useState } from 'react'
import { currentLevelDef, stageForLevel, xpForLevel } from '../../systems/progression/progressionEngine'
import { useGameStore } from '../../state/gameStore'
import { useThemeStore, type ThemeMode } from '../../state/themeStore'
import { useWorldStore } from '../../state/worldStore'
import { Icon } from '../Icon'

/** The appearance choices, in the order they are offered. */
const THEME_OPTIONS: { mode: ThemeMode; label: string; icon: 'moon' | 'sun' | 'monitor' }[] = [
  { mode: 'dark', label: 'Dark', icon: 'moon' },
  { mode: 'light', label: 'Light', icon: 'sun' },
  { mode: 'system', label: 'System', icon: 'monitor' },
]

/**
 * Settings and save management. Kept inside the game frame like every other
 * panel so the player never feels they have left the city.
 */
export function SettingsPanel() {
  const playerName = useGameStore((s) => s.playerName)
  const businessName = useGameStore((s) => s.businessName)
  const levelIndex = useGameStore((s) => s.levelIndex)
  const xp = useGameStore((s) => s.xp)
  const cash = useGameStore((s) => s.cash)
  const reputation = useGameStore((s) => s.reputation)
  const completedLevels = useGameStore((s) => s.completedLevels)
  const resetGame = useGameStore((s) => s.resetGame)

  const showHints = useWorldStore((s) => s.showHints)
  const toggleHints = useWorldStore((s) => s.toggleHints)

  const themeMode = useThemeStore((s) => s.mode)
  const setThemeMode = useThemeStore((s) => s.setMode)

  const [confirmingReset, setConfirmingReset] = useState(false)

  const level = currentLevelDef(levelIndex)
  const stage = stageForLevel(levelIndex)
  const need = xpForLevel(levelIndex)

  function close() {
    useWorldStore.getState().closePanel()
  }

  function setName(value: string) {
    useGameStore.setState({ playerName: value || 'You' })
  }

  function setBusiness(value: string) {
    useGameStore.setState({ businessName: value || 'BusinessLife Ltd' })
  }

  function handleReset() {
    if (!confirmingReset) {
      setConfirmingReset(true)
      return
    }
    resetGame()
    setConfirmingReset(false)
    useWorldStore.getState().pushToast('A new business begins. The city awaits.', 'success')
    close()
  }

  return (
    <div className="panel-backdrop">
      <div className="panel">
        <div className="panel__header">
          <div className="panel__avatar" style={{ background: 'var(--violet)' }}>
            <Icon name="gear" size={22} />
          </div>
          <div className="panel__heading">
            <h3 className="panel__title">Settings</h3>
            <div className="panel__sub">
              {stage.name} · Level {level.index} of {stage.levelRange[1]}
            </div>
          </div>
          <button type="button" className="panel__close" onClick={close} aria-label="Close settings">
            <Icon name="close" size={15} />
          </button>
        </div>

        <div className="panel__body">
          <div className="section-title">Player</div>
          <div className="field">
            <label htmlFor="settings-player">Your name</label>
            <input
              id="settings-player"
              value={playerName}
              maxLength={24}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="settings-business">Business name</label>
            <input
              id="settings-business"
              value={businessName}
              maxLength={32}
              onChange={(e) => setBusiness(e.target.value)}
            />
          </div>

          <div className="section-title">Interface</div>
          <button type="button" className="interaction" onClick={toggleHints}>
            <span className="interaction__icon">
              <Icon name="target" size={16} />
            </span>
            <span className="interaction__main">
              <span className="interaction__label">Control hints</span>
              <span className="interaction__desc">
                Show the movement and interaction key guide in the corner.
              </span>
            </span>
            <span className="interaction__meta">
              <span className="interaction__xp">{showHints ? 'On' : 'Off'}</span>
            </span>
          </button>

          <div className="info-item">
            <div className="info-item__label">Appearance</div>
            <div className="info-item__detail">
              Pick a palette, or let the game follow your device setting.
            </div>
            <div className="seg" role="group" aria-label="Appearance">
              {THEME_OPTIONS.map((option) => (
                <button
                  key={option.mode}
                  type="button"
                  className={`seg__option${themeMode === option.mode ? ' seg__option--active' : ''}`}
                  onClick={() => setThemeMode(option.mode)}
                  aria-pressed={themeMode === option.mode}
                >
                  <Icon name={option.icon} size={14} /> {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="section-title">Progress</div>
          <button type="button" className="interaction" onClick={() => useWorldStore.getState().openPanel('progress')}>
            <span className="interaction__icon"><Icon name="star" size={16} /></span>
            <span className="interaction__main"><span className="interaction__label">Stages & levels</span><span className="interaction__desc">View your journey and locked stages.</span></span>
            <span className="interaction__meta"><span className="interaction__xp">Open</span></span>
          </button>
          <div className="record">
            <span className="record__key">Cash</span>
            <span className="record__value">₦{cash.toLocaleString()}</span>
          </div>
          <div className="record">
            <span className="record__key">Reputation</span>
            <span className="record__value">{reputation}</span>
          </div>
          <div className="record">
            <span className="record__key">Experience</span>
            <span className="record__value">
              {xp} XP ({Math.min(xp, need)}/{need} toward level {levelIndex})
            </span>
          </div>
          <div className="record">
            <span className="record__key">Levels completed</span>
            <span className="record__value">
              {completedLevels.length} of {stage.levelRange[1]}
            </span>
          </div>

          <div className="info-item">
            <div className="info-item__label">Automatic saving</div>
            <div className="info-item__detail">
              Your business is saved in this browser as you play. Closing the tab will not lose progress.
            </div>
          </div>

          <div className="section-title">Danger zone</div>
          <button
            type="button"
            className="interaction"
            onClick={handleReset}
            title="Wipe the save and start a new business"
          >
            <span className="interaction__icon">
              <Icon name="close" size={16} />
            </span>
            <span className="interaction__main">
              <span className="interaction__label">
                {confirmingReset ? 'Tap again to confirm' : 'Start a new business'}
              </span>
              <span className="interaction__desc">
                {confirmingReset
                  ? 'This permanently erases your progress, records and team.'
                  : 'Erase all progress and return to The Idea.'}
              </span>
            </span>
          </button>
        </div>

        <div className="panel__footer">
          <button type="button" className="btn btn--ghost" onClick={close}>
            Back to the city
          </button>
        </div>
      </div>
    </div>
  )
}
