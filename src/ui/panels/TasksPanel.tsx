import { missionForLevel, currentLevelDef, stageForLevel } from '../../systems/progression/progressionEngine'
import { useGameStore } from '../../state/gameStore'
import { useWorldStore } from '../../state/worldStore'
import { Icon } from '../Icon'

/** The task board presented by the new mobile-style navigation. */
export function TasksPanel() {
  const levelIndex = useGameStore((s) => s.levelIndex)
  const progress = useGameStore((s) => s.progress)
  const mission = missionForLevel(levelIndex)
  const level = currentLevelDef(levelIndex)
  const stage = stageForLevel(levelIndex)

  return (
    <div className="panel-backdrop">
      <div className="panel panel--wide app-panel">
        <div className="panel__header">
          <div className="panel__avatar app-icon app-icon--orange"><Icon name="target" size={22} /></div>
          <div className="panel__heading"><h3 className="panel__title">Tasks</h3><div className="panel__sub">{stage.name} · Level {level.index}</div></div>
          <button type="button" className="panel__close" onClick={() => useWorldStore.getState().closePanel()} aria-label="Close tasks"><Icon name="close" size={15} /></button>
        </div>
        <div className="panel__body">
          {!mission && <div className="empty-state">The next stage is being prepared.</div>}
          {mission && <>
            <div className="app-hero-card"><div className="app-hero-card__eyebrow">Current objective</div><h2>{mission.title}</h2><p>{mission.briefing}</p></div>
            <div className="section-title">Available objectives</div>
            {mission.objectives.map((objective) => {
              const item = progress.find((entry) => entry.objectiveId === objective.id)
              const done = !!item?.done
              return <div className={`task-row${done ? ' task-row--done' : ''}`} key={objective.id}>
                <span className="task-row__count">{done ? '✓' : `${Math.min(item?.progress ?? 0, objective.count)}/${objective.count}`}</span>
                <span className="task-row__main"><strong>{objective.text}</strong><small>{objective.hintLocation ?? objective.hint ?? 'Complete this objective in the city.'}</small></span>
              </div>
            })}
          </>}
        </div>
        <div className="panel__footer"><button type="button" className="btn btn--primary" onClick={() => useWorldStore.getState().openPanel('map')}><Icon name="map" size={16} /> Find the next location</button></div>
      </div>
    </div>
  )
}
