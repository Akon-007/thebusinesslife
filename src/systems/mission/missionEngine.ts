import type { InfoKind } from '../../types/business'
import type { Mission, Objective, ObjectiveProgress } from '../../types/mission'
import type { NPCRole } from '../../types/npc'
import type { BuildingType } from '../../types/world'

/** Something that happened in the world, which may advance an objective. */
export type MissionEvent =
  | { type: 'visit_building'; buildingType: BuildingType }
  | { type: 'talk_role'; role: NPCRole }
  | { type: 'do_interaction'; interactionId: string }
  | { type: 'collect_info'; kind: InfoKind }
  | { type: 'business_action'; actionId: string }
  | { type: 'reach_stat'; stat: 'cash' | 'reputation' | 'team'; value: number }

export function initProgress(mission: Mission): ObjectiveProgress[] {
  return mission.objectives.map((o) => ({
    objectiveId: o.id,
    progress: 0,
    done: false,
    kind: o.kind ?? 'required',
  }))
}

function matches(objective: Objective, event: MissionEvent): boolean {
  switch (objective.type) {
    case 'visit_building':
      return event.type === 'visit_building' && event.buildingType === objective.target
    case 'talk_role':
      return event.type === 'talk_role' && event.role === objective.target
    case 'do_interaction':
      return event.type === 'do_interaction' && event.interactionId === objective.target
    case 'collect_info':
      return event.type === 'collect_info' && event.kind === objective.target
    case 'business_action':
      return event.type === 'business_action' && event.actionId === objective.target
    case 'reach_stat':
      return event.type === 'reach_stat' && event.stat === objective.target
    default:
      return false
  }
}

/**
 * Applies one event to a mission's progress list and returns the new list.
 *
 * Only the first not-yet-satisfied matching objective is advanced per event, so
 * a single action can never tick two objectives at once.
 */
export function applyMissionEvent(
  mission: Mission,
  progress: ObjectiveProgress[],
  event: MissionEvent,
): { progress: ObjectiveProgress[]; changed: boolean } {
  const objective = mission.objectives.find((o) => {
    const p = progress.find((x) => x.objectiveId === o.id)
    return p && !p.done && matches(o, event)
  })
  if (!objective) return { progress, changed: false }

  const next = progress.map((p) => {
    if (p.objectiveId !== objective.id) return p
    if (objective.type === 'reach_stat') {
      const value = event.type === 'reach_stat' ? event.value : 0
      const satisfied = value >= objective.count
      return { ...p, progress: value, done: satisfied }
    }
    const value = Math.min(objective.count, p.progress + 1)
    return { ...p, progress: value, done: value >= objective.count }
  })

  return { progress: next, changed: true }
}

/**
 * Re-evaluates `reach_stat` objectives against the current player stats.
 * Called when stats change rather than per-frame.
 */
export function syncStatObjectives(
  mission: Mission,
  progress: ObjectiveProgress[],
  stats: { cash: number; reputation: number; team: number },
): { progress: ObjectiveProgress[]; changed: boolean } {
  let changed = false
  const next = progress.map((p) => {
    if (p.done) return p
    const objective = mission.objectives.find((o) => o.id === p.objectiveId)
    if (!objective || objective.type !== 'reach_stat') return p
    const value = stats[objective.target as 'cash' | 'reputation' | 'team'] ?? 0
    const done = value >= objective.count
    if (value !== p.progress || done !== p.done) {
      changed = true
      return { ...p, progress: value, done }
    }
    return p
  })
  return { progress: next, changed }
}

/**
 * A level is finished when every *required* objective is done.
 *
 * Optional objectives are tracked and displayed but never block progress — an
 * author can add bonus work without stranding a player who skips it.
 */
export function isMissionComplete(progress: ObjectiveProgress[]): boolean {
  const required = progress.filter((p) => p.kind !== 'optional')
  return required.length > 0 && required.every((p) => p.done)
}

export function objectiveById(mission: Mission, objectiveId: string): Objective | undefined {
  return mission.objectives.find((o) => o.id === objectiveId)
}
