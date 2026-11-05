import { BUILDINGS } from '../../data/buildings'
import { useGameStore } from '../../state/gameStore'
import { useWorldStore } from '../../state/worldStore'
import { buildingDistanceToPlayer } from '../interaction/selection'

const VISIT_RADIUS = 3.5
const CHECK_INTERVAL = 0.3

/** Buildings the player is standing at right now, so we only fire on arrival. */
const occupied = new Set<string>()
let timer = 0

/**
 * Turns "the player physically walked up to a place" into a mission event.
 *
 * Missions like "Visit the Balogun Market" can only be satisfied by going
 * there, so this runs beside the movement system rather than from the UI.
 */
export function updateBuildingVisits(dt: number): void {
  timer -= dt
  if (timer > 0) return
  timer = CHECK_INTERVAL

  const store = useGameStore.getState()

  for (const building of BUILDINGS) {
    const close = buildingDistanceToPlayer(building) <= VISIT_RADIUS
    if (!close) {
      occupied.delete(building.id)
      continue
    }
    if (occupied.has(building.id)) continue
    occupied.add(building.id)

    const before = store.progress.filter((p) => p.done).length
    useGameStore.getState().reportBuildingVisit(building.type, building.name)
    const after = useGameStore.getState().progress.filter((p) => p.done).length

    if (after > before) {
      useWorldStore.getState().pushToast(`Location reached — ${building.name}`, 'success')
    }
  }
}
