import { currentLevelDef, missionForLevel, stageForLevel } from '../systems/progression/progressionEngine'
import { useGameStore } from '../state/gameStore'

/**
 * The mission briefing card. It appears the moment a new level begins and
 * restates what the player has to do out in the city.
 */
export function BriefingModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const levelIndex = useGameStore((s) => s.levelIndex)
  if (!open) return null

  const level = currentLevelDef(levelIndex)
  const mission = missionForLevel(levelIndex)
  const stage = stageForLevel(levelIndex)
  if (!mission) return null

  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <div className="modal-kicker">
          {stage.name} · Level {level.index} of {stage.levelRange[1]}
        </div>
        <h2 className="modal-title">{mission.title}</h2>
        <p className="modal-body">{mission.briefing}</p>

        <div className="section-title" style={{ marginBottom: 8 }}>
          Objectives
        </div>
        <ul className="objectives" style={{ marginBottom: 18 }}>
          {mission.objectives.map((o) => (
            <li className="objective" key={o.id}>
              <span className="objective__tick" />
              <span className="objective__text">
                {o.text}
                {o.hintLocation && (
                  <span className="objective__hint">Go to: {o.hintLocation}</span>
                )}
              </span>
              {o.count > 1 && <span className="objective__count">×{o.count}</span>}
            </li>
          ))}
        </ul>

        <div className="reward-row">
          <span className="reward-pill">+{level.rewards.xp} XP</span>
          <span className="reward-pill">+₦{level.rewards.cash.toLocaleString()}</span>
          {level.rewards.reputation > 0 && (
            <span className="reward-pill">+{level.rewards.reputation} reputation</span>
          )}
        </div>

        <div className="modal-actions">
          <button type="button" className="btn btn--primary" onClick={onClose}>
            Get to work
          </button>
        </div>
      </div>
    </div>
  )
}
