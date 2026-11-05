import type { NPCEntity } from '../../types/npc'
import { BUILDING_BY_ID } from '../../data/buildings'
import { WAYPOINT_BY_ID } from '../../data/waypoints'
import { damp, lerpAngle } from '../../shared/math'
import { chance, pick, randRange, type Rng } from '../../shared/rng'

const ARRIVE_EPSILON = 0.35

/** Breadth-first search over the waypoint graph. Returns [] when unreachable. */
export function bfsPath(fromId: string, toId: string): string[] {
  if (fromId === toId) return []
  const visited = new Set<string>([fromId])
  const queue: string[] = [fromId]
  const parent = new Map<string, string>()

  while (queue.length) {
    const current = queue.shift()!
    const node = WAYPOINT_BY_ID[current]
    if (!node) continue
    for (const link of node.links) {
      if (visited.has(link)) continue
      visited.add(link)
      parent.set(link, current)
      if (link === toId) {
        const path: string[] = []
        let cursor: string | undefined = toId
        while (cursor && cursor !== fromId) {
          path.unshift(cursor)
          cursor = parent.get(cursor)
        }
        return path
      }
      queue.push(link)
    }
  }
  return []
}

/** Nearest waypoint id to a world position, searching every district. */
export function nearestWaypoint(position: [number, number, number]): string | null {
  let best: string | null = null
  let bestDist = Infinity
  for (const id in WAYPOINT_BY_ID) {
    const w = WAYPOINT_BY_ID[id]
    const d = (w.position[0] - position[0]) ** 2 + (w.position[2] - position[2]) ** 2
    if (d < bestDist) {
      bestDist = d
      best = id
    }
  }
  return best
}

/** Assigns a new walking destination, preferring to stay in the home district. */
export function assignWalkGoal(npc: NPCEntity, rng: Rng, preferDistrict = true): boolean {
  const fromId = nearestWaypoint(npc.position)
  if (!fromId) return false

  const sameDistrict = Object.values(WAYPOINT_BY_ID).filter((w) => w.districtId === npc.districtId)
  const pool = preferDistrict && sameDistrict.length && chance(rng, 0.7)
    ? sameDistrict
    : Object.values(WAYPOINT_BY_ID)
  if (!pool.length) return false

  const target = pick(rng, pool)
  const path = bfsPath(fromId, target.id)
  if (!path.length) return false

  npc.path = path
  npc.pathIndex = 0
  npc.state = 'walking'
  return true
}

/** Walks an NPC toward a single world-space point. Returns true on arrival. */
export function moveToward(
  npc: NPCEntity,
  target: [number, number, number],
  dt: number,
  turnRate = 9,
): boolean {
  const dx = target[0] - npc.position[0]
  const dz = target[2] - npc.position[2]
  const dist = Math.hypot(dx, dz)

  if (dist < 0.001) return true

  const desiredRotation = Math.atan2(dx, dz)
  npc.rotationY = lerpAngle(npc.rotationY, desiredRotation, damp(turnRate, dt))

  const step = npc.speed * dt
  if (dist <= step + ARRIVE_EPSILON) {
    npc.position[0] = target[0]
    npc.position[2] = target[2]
    return true
  }
  npc.position[0] += (dx / dist) * step
  npc.position[2] += (dz / dist) * step
  return false
}

/** Points an NPC at a position without moving it. */
export function faceToward(
  npc: NPCEntity,
  target: [number, number, number],
  dt: number,
  rate = 6,
): void {
  const dx = target[0] - npc.position[0]
  const dz = target[2] - npc.position[2]
  if (Math.abs(dx) < 0.001 && Math.abs(dz) < 0.001) return
  npc.rotationY = lerpAngle(npc.rotationY, Math.atan2(dx, dz), damp(rate, dt))
}

/**
 * Advances one NPC by `dt` seconds. This is the whole behaviour state machine:
 * walking the waypoint graph, idling, entering buildings, waiting inside and
 * coming back out.
 */
export function stepNpc(npc: NPCEntity, dt: number, rng: Rng): void {
  switch (npc.state) {
    case 'walking': {
      const nextId = npc.path[npc.pathIndex]
      const node = nextId ? WAYPOINT_BY_ID[nextId] : undefined
      if (!node) {
        npc.state = 'idle'
        npc.waitTimer = randRange(rng, 1, 3)
        npc.path = []
        return
      }
      if (moveToward(npc, node.position, dt)) {
        npc.pathIndex += 1
        if (npc.pathIndex >= npc.path.length) {
          // Reached the end of the route.
          npc.path = []
          npc.pathIndex = 0
          const canEnter =
            !!node.buildingId && npc.visitBuildingIds.includes(node.buildingId) && chance(rng, 0.5)
          if (canEnter) {
            npc.state = 'entering'
          } else {
            npc.state = 'idle'
            npc.waitTimer = randRange(rng, 1.5, 6)
          }
        }
      }
      return
    }

    case 'idle': {
      npc.waitTimer -= dt
      if (npc.waitTimer > 0) return

      const roll = rng.next()
      if (roll < 0.62) {
        if (!assignWalkGoal(npc, rng)) {
          npc.waitTimer = randRange(rng, 1, 3)
        }
      } else if (roll < 0.78 && npc.visitBuildingIds.length && chance(rng, 0.6)) {
        // Pop into a nearby building.
        const target = npc.visitBuildingIds[Math.floor(rng.next() * npc.visitBuildingIds.length)]
        const entranceId = `wp_ent_${target}`
        const entrance = WAYPOINT_BY_ID[entranceId]
        if (entrance) {
          const path = bfsPath(nearestWaypoint(npc.position) ?? entranceId, entranceId)
          if (path.length) {
            npc.path = path
            npc.pathIndex = 0
            npc.state = 'walking'
            return
          }
        }
        npc.waitTimer = randRange(rng, 1, 3)
      } else {
        npc.waitTimer = randRange(rng, 2, 7)
        // Idle NPCs slowly look around.
        npc.rotationY += randRange(rng, -0.6, 0.6)
      }
      return
    }

    case 'entering': {
      const buildingId = npc.homeBuildingId ?? npc.visitBuildingIds[0]
      const building = buildingId ? BUILDING_BY_ID[buildingId] : undefined
      const target: [number, number, number] = building
        ? [building.position[0], 0, building.position[2]]
        : npc.position
      if (moveToward(npc, target, dt)) {
        npc.state = 'inside'
        npc.insideTimer = randRange(rng, 5, 16)
      }
      return
    }

    case 'inside': {
      npc.insideTimer -= dt
      if (npc.insideTimer <= 0) {
        npc.state = 'leaving'
      }
      return
    }

    case 'leaving': {
      const entranceId = npc.homeBuildingId ? `wp_ent_${npc.homeBuildingId}` : null
      const external = npc.visitBuildingIds[0] ? `wp_ent_${npc.visitBuildingIds[0]}` : null
      const node =
        (entranceId && WAYPOINT_BY_ID[entranceId]) ||
        (external && WAYPOINT_BY_ID[external]) ||
        null
      if (!node) {
        npc.state = 'idle'
        npc.waitTimer = randRange(rng, 1, 3)
        npc.insideTimer = 0
        return
      }
      if (moveToward(npc, node.position, dt)) {
        npc.state = 'idle'
        npc.waitTimer = randRange(rng, 1.5, 5)
        npc.insideTimer = 0
      }
      return
    }

    case 'talking': {
      npc.waitTimer -= dt
      if (npc.waitTimer <= 0) {
        npc.state = 'idle'
        npc.waitTimer = randRange(rng, 1, 4)
        npc.talkingToId = null
      }
      return
    }
  }
}
