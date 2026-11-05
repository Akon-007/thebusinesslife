import type { NPCEntity } from '../../types/npc'
import type { Building } from '../../types/world'
import { BUILDING_BY_ID } from '../../data/buildings'
import { ROLE_BY_ID } from '../../data/npcCatalog'
import { useWorldStore } from '../../state/worldStore'
import { buildingIsOpen, openBuildings } from '../../state/contentStore'
import { npcRuntime } from '../npcRuntime'
import { playerState } from '../player/playerState'

/** How close the player must be to talk to someone. */
export const NPC_INTERACT_RANGE = 6.5
/** How close the player must be to interact with a building. */
export const BUILDING_INTERACT_RANGE = 4

export function npcDistanceToPlayer(npc: NPCEntity): number {
  return Math.hypot(npc.position[0] - playerState.x, npc.position[2] - playerState.z)
}

export function buildingDistanceToPlayer(building: Building): number {
  const dx = Math.abs(building.position[0] - playerState.x) - building.size[0] / 2
  const dz = Math.abs(building.position[2] - playerState.z) - building.size[2] / 2
  return Math.max(0, Math.max(dx, dz))
}

export function canInteractWithNpc(npc: NPCEntity): boolean {
  return npc.state !== 'inside' && npcDistanceToPlayer(npc) <= NPC_INTERACT_RANGE
}

export function canInteractWithBuilding(building: Building): boolean {
  return buildingDistanceToPlayer(building) <= BUILDING_INTERACT_RANGE
}

/**
 * Selects an NPC for interaction, but only if the player has actually walked
 * over to them. Ranges are enforced here rather than in the UI so every entry
 * point (click, tap, keyboard) obeys the same rule.
 */
export function handleNpcClick(npcId: string): void {
  const npc = npcRuntime.byId(npcId)
  if (!npc) return

  if (npc.state === 'inside') {
    useWorldStore.getState().pushToast(`${npc.name} has gone inside. Wait for them.`, 'warning')
    return
  }

  if (!canInteractWithNpc(npc)) {
    const roleLabel = ROLE_BY_ID[npc.role].label
    useWorldStore
      .getState()
      .pushToast(`Walk closer to speak with that ${roleLabel.toLowerCase()}.`, 'warning')
    return
  }

  npc.state = 'talking'
  npc.talkingToId = null
  npc.waitTimer = 3
  useWorldStore.getState().selectNpc(npcId)
}

export function handleBuildingClick(buildingId: string): void {
  const building = BUILDING_BY_ID[buildingId]
  if (!building) return

  if (!buildingIsOpen(buildingId)) {
    useWorldStore.getState().pushToast(`${building.name} is closed for now.`, 'warning')
    return
  }

  if (!canInteractWithBuilding(building)) {
    useWorldStore.getState().pushToast(`Move closer to ${building.name}.`, 'warning')
    return
  }

  useWorldStore.getState().selectBuilding(buildingId)
}

/** The interactable NPC nearest the player, used for the "press E" prompt. */
export function nearestInteractableNpc(): NPCEntity | null {
  let best: NPCEntity | null = null
  let bestDist = NPC_INTERACT_RANGE
  for (const npc of npcRuntime.npcs) {
    if (npc.state === 'inside') continue
    const d = npcDistanceToPlayer(npc)
    if (d < bestDist) {
      bestDist = d
      best = npc
    }
  }
  return best
}

/** Buildings currently within interaction range of the player. */
export function nearbyBuildings(): Building[] {
  return openBuildings().filter((b) => canInteractWithBuilding(b))
}
