import { BEGINNER_LEVELS } from '../../data/beginnerLevels'
import { STAGES } from '../../data/stages'
import { currentLevelDef } from '../../systems/progression/progressionEngine'
import { useGameStore } from '../../state/gameStore'
import { useWorldStore } from '../../state/worldStore'
import { Icon } from '../Icon'

/** Stage and level map, backed by the same authoritative progress snapshot as the HUD. */
export function ProgressPanel() {
  const levelIndex = useGameStore((s) => s.levelIndex)
  const completed = useGameStore((s) => s.completedLevels)
  const level = currentLevelDef(levelIndex)
  const completedStages = STAGES.filter((stage) => completed.filter((id) => {
    const number = Number(id.slice(1))
    return number >= stage.levelRange[0] && number <= stage.levelRange[1]
  }).length >= stage.levelRange[1] - stage.levelRange[0] + 1).length

  return (
    <div className="panel-backdrop">
      <div className="panel panel--wide app-panel">
        <div className="panel__header">
          <div className="panel__avatar app-icon app-icon--orange"><Icon name="star" size={22} /></div>
          <div className="panel__heading"><h3 className="panel__title">Stages & levels</h3><div className="panel__sub">{completedStages} of {STAGES.length} stages complete</div></div>
          <button type="button" className="panel__close" onClick={() => useWorldStore.getState().closePanel()} aria-label="Close progress"><Icon name="close" size={15} /></button>
        </div>
        <div className="panel__body">
          {STAGES.map((stage) => {
            const unlocked = levelIndex >= stage.levelRange[0]
            const stageLevels = BEGINNER_LEVELS.filter((item) => item.index >= stage.levelRange[0] && item.index <= stage.levelRange[1])
            return <section className={`stage-card${unlocked ? ' stage-card--unlocked' : ''}`} key={stage.id}>
              <div className="stage-card__head"><div><strong>Stage {stage.index} · {stage.name}</strong><small>{stage.description}</small></div><span>{unlocked ? 'Open' : 'Locked'}</span></div>
              <div className="stage-levels">
                {stageLevels.length === 0 ? <span className="stage-levels__empty">Levels will unlock as this stage is authored.</span> : stageLevels.map((item) => {
                  const done = completed.includes(item.id)
                  const current = item.index === levelIndex
                  return <div className={`level-chip${done ? ' level-chip--done' : ''}${current ? ' level-chip--current' : ''}`} key={item.id} title={item.title}>{done ? '✓' : item.index}</div>
                })}
              </div>
            </section>
          })}
          <div className="info-item"><div className="info-item__label">Current level</div><div className="info-item__detail">Level {level.index}: {level.title}</div></div>
        </div>
        <div className="panel__footer"><button type="button" className="btn btn--primary" onClick={() => useWorldStore.getState().openPanel('tasks')}><Icon name="target" size={16} /> Open current task</button></div>
      </div>
    </div>
  )
}
